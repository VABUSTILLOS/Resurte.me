import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"
import { rateLimited, clientIp, rateLimitResponse } from "@/lib/rate-limit"
import { logger } from "@/lib/logger"
import {
  getOrCreateOrderPaymentLink,
  PaymentLinkError,
} from "@/lib/stripe-payment-link"

export const runtime = "nodejs"

const RATE_LIMIT_MAX = 10
const RATE_LIMIT_WINDOW_SECONDS = 60

/**
 * POST /api/orders/[id]/payment-link   body: { t?: string }
 *
 * Genera (o reutiliza) el link de pago con tarjeta del pedido: una
 * página hospedada por Stripe por el saldo exacto que la BD dice
 * que falta. Es el botón «Pagar con tarjeta» de la página pública
 * de seguimiento.
 *
 * Autorización — los mismos dos caminos que cancelar: el
 * `restore_token` del pedido (capability URL del invitado) o la
 * sesión cuyo `id` es `orders.user_id`. Sin uno de los dos, 404
 * genérico: distinguir «no es tuyo» de «no existe» convertiría la
 * ruta en un oráculo de qué ids existen.
 *
 * El monto NUNCA viene del cliente: sale de `orders.total` menos
 * lo abonado en el libro de pagos. Cuando Stripe acredita el pago,
 * el webhook lo registra y marca el pedido pagado si el saldo se
 * cubrió; esta ruta solo crea la sesión.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  if (!/^\d+$/.test(id)) {
    return NextResponse.json({ error: "Parámetros inválidos" }, { status: 400 })
  }
  const orderId = Number(id)

  let token: string | null = null
  try {
    const body = (await request.json()) as { t?: unknown }
    if (typeof body?.t === "string" && body.t) token = body.t
  } catch {
    // Sin cuerpo JSON se cae al query param; no es un error.
  }
  if (!token) token = request.nextUrl.searchParams.get("t")

  try {
    const supabase = await createServiceClient()

    const rate = await rateLimited(
      supabase,
      `order-payment-link:${clientIp(request)}`,
      RATE_LIMIT_MAX,
      RATE_LIMIT_WINDOW_SECONDS
    )
    if (!rate.allowed) return rateLimitResponse(rate)

    let sessionUserId: string | null = null
    try {
      const session = await createClient()
      const {
        data: { user },
      } = await session.auth.getUser()
      sessionUserId = user?.id ?? null
    } catch (err) {
      logger.warn("order_payment_link.session_lookup_failed", {
        error: err instanceof Error ? err.message : String(err),
      })
    }

    const { data: order, error } = await supabase
      .from("orders")
      .select(
        "id, user_id, total, payment_status, status, customer_email, restore_token, cities(slug)"
      )
      .eq("id", orderId)
      .maybeSingle()

    const authorized =
      !!order &&
      ((!!token && order.restore_token === token) ||
        (!!sessionUserId && order.user_id === sessionUserId))
    if (error || !order || !authorized) {
      return NextResponse.json({ error: "Enlace inválido o expirado" }, { status: 404 })
    }

    if (order.status === "cancelled") {
      return NextResponse.json(
        { error: "Este pedido está cancelado y ya no se puede pagar." },
        { status: 409 }
      )
    }
    if (order.payment_status === "paid") {
      return NextResponse.json({ error: "Este pedido ya está pagado." }, { status: 409 })
    }
    if (order.payment_status === "refunded" || order.payment_status === "partially_refunded") {
      return NextResponse.json(
        { error: "Este pedido tiene un reembolso en curso. Escríbenos por WhatsApp y te ayudamos." },
        { status: 409 }
      )
    }

    const city = Array.isArray(order.cities) ? order.cities[0] : order.cities
    const link = await getOrCreateOrderPaymentLink(supabase, {
      id: order.id,
      total: order.total,
      payment_status: order.payment_status,
      status: order.status,
      customer_email: order.customer_email ?? null,
      restore_token: order.restore_token ?? null,
      city_slug: city?.slug ?? null,
    })

    return NextResponse.json({
      url: link.url,
      amount: link.amount,
      balance: link.balance,
    })
  } catch (err) {
    if (err instanceof PaymentLinkError) {
      if (err.code === "stripe_not_configured") {
        return NextResponse.json(
          { error: "El pago con tarjeta no está disponible por el momento." },
          { status: 503 }
        )
      }
      if (err.code === "no_balance") {
        return NextResponse.json({ error: "Este pedido ya está pagado." }, { status: 409 })
      }
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    logger.error("[PAYMENT-LINK] unexpected error:", err)
    return NextResponse.json(
      { error: "No se pudo generar el link de pago. Intenta de nuevo." },
      { status: 500 }
    )
  }
}
