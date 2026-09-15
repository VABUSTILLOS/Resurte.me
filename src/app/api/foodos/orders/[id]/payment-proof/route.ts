import { NextRequest, NextResponse } from "next/server"
import { after } from "next/server"
import { createServiceClient } from "@/lib/supabase/service"
import { notifyFoodosCustomer } from "@/lib/foodos-notifications"
import { logger } from "@/lib/logger"
import { rateLimited, clientIp, rateLimitResponse } from "@/lib/rate-limit"
import type { FoodosPaymentProofMethod } from "@/types/foodos"

export const runtime = "nodejs"

const MAX_SIZE = 5 * 1024 * 1024 // 5 MB
const ACCEPTED = new Set(["image/jpeg", "image/png", "image/webp", "image/avif", "application/pdf"])
const METHODS = new Set<FoodosPaymentProofMethod>(["transfer", "oxxo", "efectivo", "otro"])

const RATE_LIMIT_WINDOW_SECONDS = 60

/** Estados en los que todavía tiene sentido subir un comprobante. */
const PROOF_ALLOWED_STATUSES = new Set(["pending", "failed", "expired", "amount_mismatch"])

/**
 * POST /api/foodos/orders/[id]/payment-proof?slug=<restaurante>
 *
 * El comensal del micrositio sube su comprobante de pago manual
 * (transferencia, OXXO, efectivo). NO hay sesión de Supabase en este
 * flujo: el UUID del pedido + el slug del restaurante funcionan como
 * capability URL, igual que `/track`, y ambos se validan contra la BD.
 *
 * La subida a Storage la hace el servidor con la service key porque el
 * bucket `comprobantes` es privado y no tiene políticas para anon. El
 * archivo nunca se expone por URL pública: el panel lo lee con una URL
 * firmada de corta vida.
 *
 * GET devuelve el estado de los comprobantes del pedido para que el
 * cliente vea si su pago sigue en revisión, fue aprobado o rechazado.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createServiceClient()

    const rate = await rateLimited(
      supabase,
      `foodos_proof:${clientIp(request)}`,
      5,
      RATE_LIMIT_WINDOW_SECONDS
    )
    if (!rate.allowed) return rateLimitResponse(rate)

    const { id } = await params
    const slug = request.nextUrl.searchParams.get("slug")
    if (!id || !slug) {
      return NextResponse.json({ error: "Faltan parámetros" }, { status: 400 })
    }

    const { data: restaurant } = await supabase
      .from("foodos_restaurants")
      .select("id")
      .eq("slug", slug)
      .eq("status", "active")
      .maybeSingle()
    if (!restaurant) {
      return NextResponse.json({ error: "Restaurante no encontrado" }, { status: 404 })
    }

    const { data: order } = await supabase
      .from("foodos_orders")
      .select("id, total, payment_status")
      .eq("id", id)
      .eq("restaurant_id", restaurant.id)
      .maybeSingle()
    if (!order) {
      return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 })
    }
    if (!PROOF_ALLOWED_STATUSES.has(order.payment_status as string)) {
      return NextResponse.json(
        { error: "Este pedido ya no acepta comprobantes de pago" },
        { status: 409 }
      )
    }

    const form = await request.formData().catch(() => null)
    const file = form?.get("file")
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Adjunta el comprobante (campo file)" }, { status: 400 })
    }
    if (!ACCEPTED.has(file.type)) {
      return NextResponse.json(
        { error: "Formato no soportado (JPG, PNG, WebP, AVIF o PDF)" },
        { status: 400 }
      )
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: "El comprobante supera los 5 MB" }, { status: 400 })
    }
    if (file.size === 0) {
      return NextResponse.json({ error: "El archivo está vacío" }, { status: 400 })
    }

    const methodRaw = String(form?.get("method") ?? "transfer")
    const method = (METHODS.has(methodRaw as FoodosPaymentProofMethod)
      ? methodRaw
      : "transfer") as FoodosPaymentProofMethod
    const reference = String(form?.get("reference") ?? "").trim().slice(0, 120) || null
    // El monto es informativo (lo que el cliente dice haber pagado). El
    // total real del pedido se lee de la BD y nunca del cliente.
    const amountRaw = Number(form?.get("amount"))
    const amount =
      Number.isFinite(amountRaw) && amountRaw > 0 ? Math.round(amountRaw * 100) / 100 : null

    const ext =
      file.type === "application/pdf"
        ? "pdf"
        : file.type.split("/")[1] === "jpeg"
          ? "jpg"
          : file.type.split("/")[1]
    // Ruta con restaurante/pedido primero: agrupa por pedido y facilita
    // la limpieza si hay que borrar archivos huérfanos.
    const path = `${restaurant.id}/${id}/${crypto.randomUUID()}.${ext}`

    const { error: uploadError } = await supabase.storage
      .from("comprobantes")
      .upload(path, file, { contentType: file.type })

    if (uploadError) {
      logger.error("[FOODOS PROOF] storage error:", uploadError)
      return NextResponse.json(
        { error: "No se pudo subir el comprobante", detail: uploadError.message },
        { status: 500 }
      )
    }

    const { data: inserted, error: insertError } = await supabase
      .from("foodos_order_payments")
      .insert({
        order_id: id,
        restaurant_id: restaurant.id,
        method,
        amount,
        proof_path: path,
        reference,
      })
      .select("id, status, created_at")
      .single()

    if (insertError) {
      // El índice parcial permite un solo comprobante pendiente por
      // pedido. Si ya había uno, el archivo recién subido se descarta
      // para no dejar huérfanos en Storage.
      await supabase.storage.from("comprobantes").remove([path])
      const conflict = insertError.code === "23505"
      logger.error("[FOODOS PROOF] insert error:", insertError)
      return NextResponse.json(
        {
          error: conflict
            ? "Ya tienes un comprobante en revisión para este pedido"
            : "No se pudo registrar el comprobante",
        },
        { status: conflict ? 409 : 500 }
      )
    }

    // Acuse al comensal. La tabla de notificaciones deduplica por
    // (pedido, evento, canal), así que reintentos de subida no generan
    // mensajes repetidos.
    after(() => {
      void notifyFoodosCustomer(id, "payment:proof_pending")
    })

    return NextResponse.json({ payment: inserted }, { status: 201 })
  } catch (err) {
    logger.error("[FOODOS PROOF] POST unexpected:", err)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createServiceClient()

    const rate = await rateLimited(
      supabase,
      `foodos_proof_get:${clientIp(request)}`,
      30,
      RATE_LIMIT_WINDOW_SECONDS
    )
    if (!rate.allowed) return rateLimitResponse(rate)

    const { id } = await params
    const slug = request.nextUrl.searchParams.get("slug")
    if (!id || !slug) {
      return NextResponse.json({ error: "Faltan parámetros" }, { status: 400 })
    }

    const { data: restaurant } = await supabase
      .from("foodos_restaurants")
      .select("id")
      .eq("slug", slug)
      .eq("status", "active")
      .maybeSingle()
    if (!restaurant) {
      return NextResponse.json({ error: "Restaurante no encontrado" }, { status: 404 })
    }

    // `proof_path` se omite a propósito: el cliente no necesita la ruta
    // interna del bucket, sólo saber en qué estado va su revisión.
    const { data, error } = await supabase
      .from("foodos_order_payments")
      .select("id, method, amount, reference, status, notes, reviewed_at, created_at")
      .eq("order_id", id)
      .eq("restaurant_id", restaurant.id)
      .order("created_at", { ascending: false })
      .limit(5)

    if (error) {
      logger.error("[FOODOS PROOF] GET error:", error)
      return NextResponse.json({ error: "No se pudo consultar" }, { status: 500 })
    }

    return NextResponse.json(
      { payments: data ?? [] },
      { headers: { "Cache-Control": "no-store" } }
    )
  } catch (err) {
    logger.error("[FOODOS PROOF] GET unexpected:", err)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
