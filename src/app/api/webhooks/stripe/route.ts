import { NextResponse, type NextRequest } from "next/server"
import { getStripe } from "@/lib/stripe"
import { headers } from "next/headers"
import { createServiceClient } from "@/lib/supabase/service"
import {
  handlePaymentIntentSucceeded,
  handlePaymentIntentRefunded,
  handlePaymentIntentFailed,
  handlePaymentIntentCanceled,
  handleChargeRefunded,
  handleChargeDisputeCreated,
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
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
    if (!webhookSecret) throw new Error("STRIPE_WEBHOOK_SECRET no está configurado")
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      webhookSecret
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

      // Los reembolsos se notifican por charge.refunded (Stripe no emite
      // payment_intent.refunded). El trigger reverse_cashback_on_cancel()
      // (00065) revierte el cashback abonado.
      case "charge.refunded": {
        const supabase = await createServiceClient()
        await handleChargeRefunded(
          supabase,
          event.data.object as {
            id: string
            payment_intent?: string | null
            amount_refunded?: number
          }
        )
        break
      }

      // Contracargos: el banco retira los fondos. Se marca la orden como
      // disputada (el trigger 00065 revierte el cashback) y queda el rastro
      // en el log para seguimiento operativo.
      case "charge.dispute.created": {
        const supabase = await createServiceClient()
        await handleChargeDisputeCreated(
          supabase,
          event.data.object as {
            id: string
            payment_intent?: string | null
            amount?: number
            reason?: string
          }
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
