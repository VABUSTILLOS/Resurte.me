import { NextRequest, NextResponse } from "next/server"

import { createServiceClient } from "@/lib/supabase/service"
import { getPosWebhookSecret, logPosSync } from "@/lib/pos/connections"
import { isPosProvider } from "@/lib/pos/registry"
import { mapPosOrderStatus, planOrderReconcile } from "@/lib/pos/reconcile"
import { safeSecretEqual } from "@/lib/secret-equal"
import { logger } from "@/lib/logger"
import type { FoodosOrderStatus } from "@/types/foodos"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Webhook entrante del punto de venta.
 *
 * POST /api/foodos/pos/{provider}/webhook/{restaurantId}
 *
 * El proveedor no tiene sesión de FoodOS, así que el restaurante va en la ruta
 * y el secreto de la conexión es la única credencial. `safeSecretEqual` compara
 * en tiempo constante y falla cerrado: sin secreto guardado o sin conexión
 * `connected`, `getPosWebhookSecret` devuelve `null` y todo se rechaza.
 *
 * El pedido **no se recalcula aquí**. Nació en el POS y el POS manda el estado;
 * volver a cotizarlo en FoodOS abriría la puerta a que un webhook reescriba un
 * total. Solo se mueve el estado, y `planOrderReconcile` garantiza que nunca
 * retroceda, nunca reabra un cancelado y nunca toque uno entregado.
 *
 * Hoy ningún adaptador está implementado, así que en la práctica esta ruta solo
 * responde `503`: la URL ni siquiera se muestra en el panel. Existe como la
 * mitad receptora de `resolvePosAdapter`, lista para el día que haya uno.
 */

/** El secreto viaja en este header. Cada adaptador real puede añadir su firma. */
const SECRET_HEADER = "x-pos-secret"

interface WebhookPayload {
  order_id?: unknown
  status?: unknown
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string; restaurantId: string }> }
) {
  try {
    const { provider, restaurantId } = await params
    if (!isPosProvider(provider)) {
      return NextResponse.json({ error: "Proveedor no reconocido" }, { status: 404 })
    }

    let supabase: Awaited<ReturnType<typeof createServiceClient>>
    try {
      supabase = await createServiceClient()
    } catch {
      return NextResponse.json({ error: "Servicio no disponible" }, { status: 503 })
    }

    const expected = await getPosWebhookSecret(supabase, provider, restaurantId)
    if (!expected) {
      // Sin conexión activa no hay secreto y no se puede verificar nada.
      return NextResponse.json({ error: "Conexión no activa" }, { status: 503 })
    }

    if (!safeSecretEqual(request.headers.get(SECRET_HEADER), expected)) {
      logger.warn("foodos.pos.webhook.unauthorized", { provider, restaurantId })
      return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    }

    let payload: WebhookPayload
    try {
      payload = (await request.json()) as WebhookPayload
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
    }

    const orderId = typeof payload.order_id === "string" ? payload.order_id.trim() : ""
    if (!orderId) {
      return NextResponse.json({ error: "Falta order_id" }, { status: 400 })
    }

    const incoming = mapPosOrderStatus(provider, payload.status)
    if (!incoming) {
      await logPosSync(supabase, restaurantId, {
        provider,
        kind: "order",
        status: "skipped",
        detail: `Estado externo no reconocido: ${String(payload.status).slice(0, 60)}`,
      })
      return NextResponse.json({ ok: true, applied: false, reason: "Estado no reconocido" })
    }

    const { data: orderRow } = await supabase
      .from("foodos_orders")
      .select("id, status")
      .eq("id", orderId)
      .eq("restaurant_id", restaurantId)
      .maybeSingle()

    if (!orderRow) {
      await logPosSync(supabase, restaurantId, {
        provider,
        kind: "order",
        status: "failed",
        detail: "El pedido no existe en este restaurante",
      })
      return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 })
    }

    const current = ((orderRow as Record<string, unknown>).status ?? "pending") as FoodosOrderStatus
    const plan = planOrderReconcile(current, incoming)

    if (plan.action === "ignore") {
      await logPosSync(supabase, restaurantId, {
        provider,
        kind: "order",
        status: "skipped",
        detail: plan.reason,
      })
      return NextResponse.json({ ok: true, applied: false, reason: plan.reason })
    }

    const { error } = await supabase
      .from("foodos_orders")
      .update({ status: plan.next })
      .eq("id", orderId)
      .eq("restaurant_id", restaurantId)

    if (error) {
      await logPosSync(supabase, restaurantId, {
        provider,
        kind: "order",
        status: "failed",
        detail: "No se pudo aplicar el estado",
      })
      return NextResponse.json({ error: "No se pudo aplicar el estado" }, { status: 500 })
    }

    await logPosSync(supabase, restaurantId, {
      provider,
      kind: "order",
      status: "ok",
      detail: plan.reason,
    })

    return NextResponse.json({ ok: true, applied: true, status: plan.next })
  } catch (error) {
    logger.error("foodos.pos.webhook.failed", error)
    return NextResponse.json({ error: "Error inesperado" }, { status: 500 })
  }
}
