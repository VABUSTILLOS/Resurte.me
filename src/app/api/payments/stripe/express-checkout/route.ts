import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"
import { logger } from "@/lib/logger"
import {
  chargeOrderWithSavedCard,
  PaymentIntentError,
} from "@/lib/payments"
import { rateLimited, rateLimitResponse, clientIp } from "@/lib/rate-limit"

/**
 * POST /api/payments/stripe/express-checkout
 *
 * Cobra un pedido PENDIENTE de forma off-session con la tarjeta guardada del
 * usuario (Express Checkout / compra recurrente con 1 clic). Solo para
 * usuarios autenticados.
 * Body: { order_id: number|string }
 *
 * Respuestas:
 *  · { status: "succeeded", paymentIntentId }        → cobrado, webhook confirma
 *  · { status: "requires_action", clientSecret }     → 3DS/SCA pendiente
 *  · { status: "declined" }                          → banco rechazó (fail-open)
 *  · { status: "no_saved_card" }                     → sin tarjeta guardada
 *
 * El monto se deriva SIEMPRE del total del pedido en la BD (nunca del body).
 * La orden queda pendiente e intacta si el cargo falla o no hay tarjeta.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { order_id } = body

    if (order_id === undefined || order_id === null) {
      return NextResponse.json({ error: "order_id es requerido" }, { status: 400 })
    }

    const supabaseClient = await createClient()
    const {
      data: { user },
    } = await supabaseClient.auth.getUser()

    if (!user) {
      return NextResponse.json(
        { error: "Debes iniciar sesión para usar el pago rápido" },
        { status: 401 }
      )
    }

    // Rate limit: 10 requests per minute per user
    const ip = clientIp(request)
    const rlKey = `express-checkout:${user.id}:${ip}`
    const rl = await rateLimited(await createServiceClient(), rlKey, 10, 60)
    if (!rl.allowed) {
      return rateLimitResponse(rl)
    }

    const result = await chargeOrderWithSavedCard({
      orderId: Number(order_id),
      userId: user.id,
    })

    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof PaymentIntentError) {
      logger.error("express-checkout error:", error.message)
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    logger.error("Stripe express-checkout error:", error)
    const message =
      error instanceof Error ? error.message : "Error al procesar el pago rápido"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
