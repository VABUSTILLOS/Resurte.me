import { NextResponse, type NextRequest } from "next/server"
import { getStripe } from "@/lib/stripe"
import { headers } from "next/headers"
import { createServiceClient } from "@/lib/supabase/service"
import {
  handlePaymentIntentSucceeded,
  handlePaymentIntentRefunded,
  handlePaymentIntentFailed,
  handlePaymentIntentCanceled,
  type StripePaymentIntentLike,
} from "@/lib/stripe-webhook-handlers"
import { logger } from "@/lib/logger"
/**
 * POST /api/webhooks/stripe
 *
 * Recibe eventos de Stripe y:
 *  1. Actualiza el payment_status del pedido en Supabase
 *  2. Dispara workflows de WhatsApp (confirmación de pago, status update)
 *
 * La lógica por evento vive en @/lib/stripe-webhook-handlers (reutilizada
 * por el cron de reconciliación); aquí solo se verifica la firma y se
 * despacha el evento.
 */
export async function POST(request: NextRequest) {
  const body = await request.text()
  const signature = (await headers()).get("stripe-signature") ?? ""

  let event

  try {
    const stripe = getStripe()
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid signature"
    logger.error("Stripe webhook signature error:", message)
    return NextResponse.json({ error: message }, { status: 400 })
  }

  try {
    const eventType = event.type as string
    switch (eventType) {
      case "payment_intent.succeeded": {
        const supabase = await createServiceClient()
        await handlePaymentIntentSucceeded(
          supabase,
          event.data.object as StripePaymentIntentLike
        )
        break
      }

      case "payment_intent.refunded": {
        const supabase = await createServiceClient()
        await handlePaymentIntentRefunded(
          supabase,
          event.data.object as { id: string }
        )
        break
      }

      case "payment_intent.payment_failed": {
        const supabase = await createServiceClient()
        await handlePaymentIntentFailed(
          supabase,
          event.data.object as { id: string }
        )
        break
      }

      case "payment_intent.canceled": {
        const supabase = await createServiceClient()
        await handlePaymentIntentCanceled(
          supabase,
          event.data.object as { id: string }
        )
        break
      }

      default:
        logger.warn("stripe.unhandled_event", { type: event.type })
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    logger.error("Stripe webhook handler error:", error)
    return NextResponse.json(
      { error: "Webhook handler failed" },
      { status: 500 }
    )
  }
}
