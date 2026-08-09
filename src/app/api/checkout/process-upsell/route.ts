import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import {
  processUpsellForOrder,
  PaymentIntentError,
} from "@/lib/payments"

/**
 * POST /api/checkout/process-upsell
 *
 * Cobra un 1-click upsell off-session sobre una orden YA pagada, reutilizando
 * el método de pago guardado del cargo base (mecánica SamCart).
 * Body: { order_id, product_id, quantity, idempotency_key, guest_token? }
 *
 * Contratos:
 *  · Idempotente: si ya hay un upsell pagado para la idempotency_key, devuelve
 *    200 con el resultado original sin volver a cobrar.
 *  · Si el cargo falla (declinado / requiere 3DS no soportado off-session),
 *    la orden base permanece `paid`/`confirmed` — nunca se muta orders.total.
 *  · El monto se deriva SIEMPRE de `products` + `bump_rules` (server-side);
 *    el cliente jamás envía un amount.
 *
 * Respuestas:
 *  200 { status: "succeeded", paymentIntentId, orderUpsellId, amount }
 *  200 { status: "requires_action", clientSecret, paymentIntentId, orderUpsellId }
 *  4xx { error, code? }  (403/404/409/402 — la orden base queda intacta).
 *    · code "order_not_confirmed" (409) → transitorio, reintentable (el webhook
 *      tarda ~1-2s en confirmar el pago base).
 *    · code "no_payment_method" (409) → permanente: el pago base se hizo sin
 *      método reutilizable (p.ej. wallet), NO reintentar.
 *    · code "out_of_stock" (409) → permanente, NO reintentar.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { order_id, product_id, quantity, idempotency_key, guest_token } = body

    if (order_id === undefined || order_id === null) {
      return NextResponse.json({ error: "order_id es requerido" }, { status: 400 })
    }
    if (product_id === undefined || product_id === null) {
      return NextResponse.json({ error: "product_id es requerido" }, { status: 400 })
    }
    if (quantity === undefined || quantity === null) {
      return NextResponse.json({ error: "quantity es requerido" }, { status: 400 })
    }
    if (typeof idempotency_key !== "string" || !idempotency_key.trim()) {
      return NextResponse.json({ error: "idempotency_key es requerida" }, { status: 400 })
    }

    const supabaseClient = await createClient()
    const {
      data: { user },
    } = await supabaseClient.auth.getUser()

    const result = await processUpsellForOrder({
      orderId: order_id,
      productId: product_id,
      quantity,
      idempotencyKey: idempotency_key,
      userId: user?.id ?? null,
      guestToken: typeof guest_token === "string" && guest_token ? guest_token : null,
    })

    if (result.status === "requires_action") {
      return NextResponse.json({
        status: "requires_action",
        clientSecret: result.clientSecret,
        paymentIntentId: result.paymentIntentId,
        orderUpsellId: result.orderUpsellId,
      })
    }

    return NextResponse.json({
      status: "succeeded",
      paymentIntentId: result.paymentIntentId,
      orderUpsellId: result.orderUpsellId,
      amount: result.amount,
    })
  } catch (error) {
    if (error instanceof PaymentIntentError) {
      logger.warn("process-upsell error", { error: error.message })
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      )
    }

    logger.error("process-upsell unexpected error:", error)
    const message =
      error instanceof Error ? error.message : "Error al procesar el upsell"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
