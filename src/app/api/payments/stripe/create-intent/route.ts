import { z } from "zod"
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
// Esquema del body. `type` queda como string libre para preservar el
// comportamiento previo (cualquier valor distinto de "foodos" → "main").
// El monto NUNCA viene del body: se deriva del total del pedido en la BD.
const createIntentSchema = z.object({
  order_id: z.union([z.number(), z.string()]),
  type: z.string().optional(),
  guest_token: z.string().optional(),
  save_card: z.boolean().optional(),
  customer_email: z.string().optional(),
})

export async function POST(request: NextRequest) {
  try {
    const rawBody: unknown = await request.json()
    const parsed = createIntentSchema.safeParse(rawBody)
    if (!parsed.success) {
      const fields: Record<string, string> = {}
      for (const issue of parsed.error.issues) {
        const path = issue.path.join(".") || "_"
        if (!fields[path]) fields[path] = issue.message
      }
      return NextResponse.json(
        { error: "Cuerpo de la petición inválido", fields },
        { status: 400 }
      )
    }
    const { order_id, type = "main", guest_token, save_card, customer_email } = parsed.data

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
