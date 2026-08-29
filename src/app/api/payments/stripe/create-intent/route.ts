import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"
import { logger } from "@/lib/logger"
import {
  createPaymentIntentForOrder,
  PaymentIntentError,
} from "@/lib/payments"
import { rateLimited, rateLimitResponse, clientIp } from "@/lib/rate-limit"

/**
 * POST /api/payments/stripe/create-intent
 *
 * Crea un PaymentIntent de Stripe para un pedido PENDIENTE con pago por tarjeta
 * y lo liga al pedido (orders o foodos_orders).
 * Body: { order_id: number|string, type?: "main" | "foodos", guest_token?: string,
 *         save_card?: boolean, customer_email?: string }
 *
 * El monto se deriva SIEMPRE del total del pedido en la BD (nunca del body),
 * por lo que no se acepta `amount` del cliente.
 *
 * Acceso:
 *  · pedidos main con user_id → requiere sesión del dueño del pedido;
 *  · pedidos main anónimos → opcional guest_token (coincide con la dirección);
 *  · pedidos foodos → sin sesión (monto validado contra la BD + webhook).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { order_id, type = "main", guest_token, save_card, customer_email } = body

    if (order_id === undefined || order_id === null) {
      return NextResponse.json({ error: "order_id es requerido" }, { status: 400 })
    }

    const supabaseClient = await createClient()
    const {
      data: { user },
    } = await supabaseClient.auth.getUser()

    // Rate limit: 15 requests per minute per IP (authenticated or not)
    const ip = clientIp(request)
    const rlKey = `pi-create:${type}:${ip}:${user?.id ?? "anon"}`
    const rl = await rateLimited(await createServiceClient(), rlKey, 15, 60)
    if (!rl.allowed) {
      return rateLimitResponse(rl)
    }

    const result = await createPaymentIntentForOrder({
      type: type === "foodos" ? "foodos" : "main",
      orderId: order_id,
      userId: user?.id ?? null,
      guestToken: typeof guest_token === "string" && guest_token ? guest_token : null,
      saveCardConsent: save_card === true,
      customerEmail: typeof customer_email === "string" && customer_email ? customer_email : null,
    })

    return NextResponse.json({
      clientSecret: result.clientSecret,
      paymentIntentId: result.paymentIntentId,
      saveCardEnabled: result.saveCardEnabled,
    })
  } catch (error) {
    if (error instanceof PaymentIntentError) {
      logger.error("create-intent error:", error.message)
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    logger.error("Stripe create-intent error:", error)
    const message =
      error instanceof Error ? error.message : "Error al crear PaymentIntent"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
