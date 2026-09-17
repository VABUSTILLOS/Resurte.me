import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/service"
import { requireAdmin } from "@/lib/admin-auth"
import { logAdminAction } from "@/lib/audit-log"
import { logger } from "@/lib/logger"
import {
  DELIVERY_PROOF_BUCKET,
  isMarketplaceProofPath,
  validateDeliveryProofFile,
  deliveryProofPath,
} from "@/lib/delivery-proof"

export const runtime = "nodejs"

/**
 * POST   /api/admin/orders/[id]/proof  — sube o reemplaza el comprobante
 * DELETE /api/admin/orders/[id]/proof  — lo quita
 *
 * El comprobante es la evidencia de que la entrega ocurrió: foto, hora y
 * nota. Antes de esta ruta, pasar el pedido a `delivered` no dejaba ningún
 * artefacto — la única prueba era el `status` que el admin acababa de
 * escribir a mano (00154).
 *
 * Tres decisiones que conviene no deshacer sin pensarlo:
 *
 *  1. Subir NO es obligatorio para cerrar el pedido. Mismo criterio que el
 *     PIN y la foto de FoodOS: la foto respalda, no autoriza. Si bloqueara
 *     el cierre, el admin acabaría subiendo cualquier cosa para
 *     desbloquearse y la evidencia perdería todo valor.
 *
 *  2. Se guarda la ruta, nunca la URL. El bucket es privado; la URL se
 *     firma al leer, con una hora de vida (ver GET /api/orders/[id]/proof).
 *
 *  3. Reemplazar borra el objeto anterior solo DESPUÉS de que la base
 *     apunte al nuevo. Al revés, un fallo del update dejaría el pedido sin
 *     comprobante y con la foto ya destruida.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, response } = await requireAdmin()
    if (response) return response

    const { id } = await params
    if (!/^\d+$/.test(id)) {
      return NextResponse.json({ error: "Pedido inválido" }, { status: 400 })
    }
    const orderId = Number(id)

    const form = await request.formData().catch(() => null)
    const file = form?.get("file")
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Adjunta la foto (campo file)" }, { status: 400 })
    }

    const check = validateDeliveryProofFile(file)
    if (!check.ok) {
      return NextResponse.json({ error: check.error }, { status: 400 })
    }

    const noteRaw = String(form?.get("note") ?? "").trim()
    const note = noteRaw ? noteRaw.slice(0, 500) : null

    const supabase = await createServiceClient()

    const { data: order, error: readError } = await supabase
      .from("orders")
      .select("id, status, delivery_proof_path")
      .eq("id", orderId)
      .maybeSingle()

    if (readError) {
      logger.error("[ORDER-PROOF] no se pudo leer el pedido:", readError)
      return NextResponse.json({ error: "No se pudo leer el pedido" }, { status: 500 })
    }
    if (!order) {
      return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 })
    }
    // Un pedido cancelado no se entregó: aceptar una foto ahí solo generaría
    // evidencia contradictoria que luego habría que depurar a mano.
    if (order.status === "cancelled") {
      return NextResponse.json(
        { error: "El pedido está cancelado: no hay entrega que comprobar" },
        { status: 409 }
      )
    }

    const previous = (order.delivery_proof_path as string | null) ?? null
    const path = deliveryProofPath(orderId, file.type)

    const { error: uploadError } = await supabase.storage
      .from(DELIVERY_PROOF_BUCKET)
      .upload(path, file, { contentType: file.type })
    if (uploadError) {
      logger.error("[ORDER-PROOF] storage error:", uploadError)
      return NextResponse.json({ error: "No se pudo subir la foto" }, { status: 500 })
    }

    const { error: updateError } = await supabase
      .from("orders")
      .update({
        delivery_proof_path: path,
        delivery_proof_at: new Date().toISOString(),
        delivery_proof_note: note,
      })
      .eq("id", orderId)

    if (updateError) {
      logger.error("[ORDER-PROOF] no se pudo guardar la ruta:", updateError)
      // La base sigue apuntando al comprobante anterior (o a ninguno): el
      // objeto recién subido es basura, no evidencia huérfana.
      try {
        await supabase.storage.from(DELIVERY_PROOF_BUCKET).remove([path])
      } catch {
        // Nada que hacer: es limpieza de un objeto que nadie referencia.
      }
      return NextResponse.json({ error: "No se pudo guardar la foto" }, { status: 500 })
    }

    if (previous && previous !== path && isMarketplaceProofPath(previous)) {
      // Best-effort: si falla, queda un objeto huérfano en un bucket privado,
      // que es preferible a perder la evidencia vigente.
      const { error: removeError } = await supabase.storage
        .from(DELIVERY_PROOF_BUCKET)
        .remove([previous])
      if (removeError) {
        logger.warn("[ORDER-PROOF] no se pudo borrar el comprobante anterior:", {
          previous,
          error: removeError.message,
        })
      }
    }

    await logAdminAction(supabase, {
      actorId: user?.id ?? null,
      actorEmail: user?.email ?? null,
      action: "order_delivery_proof",
      entity: "orders",
      entityId: orderId,
      detail: { path, replaced: previous !== null, has_note: note !== null },
    })

    return NextResponse.json({ ok: true, path })
  } catch (err) {
    logger.error("[ORDER-PROOF] POST falló", err)
    return NextResponse.json({ error: "No se pudo subir la foto" }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, response } = await requireAdmin()
    if (response) return response

    const { id } = await params
    if (!/^\d+$/.test(id)) {
      return NextResponse.json({ error: "Pedido inválido" }, { status: 400 })
    }
    const orderId = Number(id)

    const supabase = await createServiceClient()

    const { data: order, error: readError } = await supabase
      .from("orders")
      .select("id, delivery_proof_path")
      .eq("id", orderId)
      .maybeSingle()

    if (readError) {
      logger.error("[ORDER-PROOF] no se pudo leer el pedido:", readError)
      return NextResponse.json({ error: "No se pudo leer el pedido" }, { status: 500 })
    }
    if (!order) {
      return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 })
    }

    const path = (order.delivery_proof_path as string | null) ?? null
    if (!path) {
      // Nada que quitar. Se responde 200 en vez de 404: el estado deseado ya
      // se cumple y la interfaz no tiene que distinguir "ya estaba" de "no existe".
      return NextResponse.json({ ok: true, removed: false })
    }

    // Primero la base, después el objeto: si el borrado del objeto falla, el
    // pedido ya no referencia el comprobante y solo queda un huérfano privado.
    const { error: updateError } = await supabase
      .from("orders")
      .update({
        delivery_proof_path: null,
        delivery_proof_at: null,
        delivery_proof_note: null,
      })
      .eq("id", orderId)

    if (updateError) {
      logger.error("[ORDER-PROOF] no se pudo limpiar el comprobante:", updateError)
      return NextResponse.json({ error: "No se pudo quitar el comprobante" }, { status: 500 })
    }

    if (isMarketplaceProofPath(path)) {
      const { error: removeError } = await supabase.storage
        .from(DELIVERY_PROOF_BUCKET)
        .remove([path])
      if (removeError) {
        logger.warn("[ORDER-PROOF] comprobante huérfano en storage:", {
          path,
          error: removeError.message,
        })
      }
    }

    await logAdminAction(supabase, {
      actorId: user?.id ?? null,
      actorEmail: user?.email ?? null,
      action: "order_delivery_proof_removed",
      entity: "orders",
      entityId: orderId,
      detail: { path },
    })

    return NextResponse.json({ ok: true, removed: true })
  } catch (err) {
    logger.error("[ORDER-PROOF] DELETE falló", err)
    return NextResponse.json({ error: "No se pudo quitar el comprobante" }, { status: 500 })
  }
}
