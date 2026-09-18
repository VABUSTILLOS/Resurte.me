import { NextResponse, type NextRequest, after } from "next/server"
import { createServiceClient } from "@/lib/supabase/service"
import { createFoodosOrder, type FoodosOrderBody } from "@/lib/foodos-order-create"
import { notifyFoodosOwner } from "@/lib/foodos-owner-notifications"
import { logger } from "@/lib/logger"
import { rateLimited, clientIp, rateLimitResponse } from "@/lib/rate-limit"

// Rate limiting durable (helper compartido en src/lib/rate-limit.ts).
const RATE_LIMIT_MAX = 20
const RATE_LIMIT_WINDOW_SECONDS = 60

/**
 * POST /api/foodos/orders
 *
 * Crea un pedido público del micrositio /r/[slug] sin autenticación
 * (service role bypass de RLS; la migración valida que el restaurante
 * esté activo y el trigger crea/actualiza el cliente).
 *
 * La validación y el cálculo de totales viven en
 * `src/lib/foodos-order-create.ts`, compartidos con el Mesero IA de WhatsApp.
 *
 * Si payment_method es "card", crea un PaymentIntent de Stripe y
 * devuelve el client_secret para que el frontend confirme el pago.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServiceClient()

    const rate = await rateLimited(
      supabase,
      `foodos_orders:${clientIp(request)}`,
      RATE_LIMIT_MAX,
      RATE_LIMIT_WINDOW_SECONDS
    )
    if (!rate.allowed) {
      return rateLimitResponse(rate)
    }

    const body: FoodosOrderBody = await request.json()
    const result = await createFoodosOrder(supabase, body)

    if (!result.ok) {
      return NextResponse.json(
        {
          error: result.error,
          ...(result.detail ? { detail: result.detail } : {}),
          ...(result.code ? { code: result.code } : {}),
        },
        { status: result.status }
      )
    }

    // El PaymentIntent de Stripe para tarjeta lo crea el storefront llamando a
    // POST /api/payments/stripe/create-intent con type: "foodos" y el order_id
    // devuelto aquí (separación de responsabilidades: esta ruta solo registra).

    // Aviso al dueño: este es el único punto donde un pedido FoodOS entra desde
    // fuera. Los flujos de mostrador y mesas no avisan porque los abre el propio
    // dueño. Va en `after()` para no meter tres round-trips en la respuesta que
    // espera el comensal; `notifyFoodosOwner` nunca lanza.
    after(() => {
      void notifyFoodosOwner(result.orderId, "status:pending")
    })

    return NextResponse.json({
      orderId: result.orderId,
      total: result.total,
    })
  } catch (error) {
    logger.error("FoodOS create order error:", error)
    return NextResponse.json(
      { error: "Error interno al crear el pedido" },
      { status: 500 }
    )
  }
}
