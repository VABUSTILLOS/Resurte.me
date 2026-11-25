import { NextResponse, type NextRequest } from "next/server"
import { getStripe } from "@/lib/stripe"
import { headers } from "next/headers"
import { createServiceClient } from "@/lib/supabase/service"
import {
  handlePaymentIntentSucceeded,
  handleOrderPaymentLinkSucceeded,
  handlePaymentIntentRefunded,
  handlePaymentIntentFailed,
  handlePaymentIntentCanceled,
  handlePaymentIntentProcessing,
  handleChargeRefunded,
  handleChargeDisputeCreated,
  type StripePaymentIntentLike,
} from "@/lib/stripe-webhook-handlers"
import { logger } from "@/lib/logger"
import { handleConnectAccountUpdated } from "@/lib/stripe-connect"
import { clearPersistedOrderPaymentLink } from "@/lib/stripe-payment-link"
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
        const pi = event.data.object as {
          id: string
          cancellation_reason?: string | null
        }
        await handlePaymentIntentCanceled(supabase, {
          id: pi.id,
          cancellation_reason: pi.cancellation_reason ?? null,
        })
        break
      }

      // Métodos locales asíncronos (OXXO, SPEI, CoDi): el cliente ya tiene
      // las instrucciones de pago y el dinero aún no se acredita.
      // `requires_action` es el estado inmediatamente posterior a
      // confirmar el intent; `processing` el que sigue.
      case "payment_intent.processing":
      case "payment_intent.requires_action": {
        const supabase = await createServiceClient()
        await handlePaymentIntentProcessing(
          supabase,
          event.data.object as { id: string }
        )
        break
      }

      // Link de pago por pedido (Ola 4): la Checkout Session trae la
      // misma metadata que su PaymentIntent. El registro lo hace el
      // mismo handler que procesa payment_intent.succeeded y el
      // libro deduplica por PaymentIntent, así que recibir los dos
      // eventos de la misma compra no abona dos veces. Solo se
      // procesa con la sesión ya pagada: una sesión completada con
      // método asíncrono aún no acreditado la cierra su propio
      // payment_intent.succeeded posterior.
      case "checkout.session.completed": {
        const session = event.data.object as {
          id: string
          payment_status?: string
          payment_intent?: string | null
          amount_total?: number | null
          customer?: string | null
          customer_details?: { email?: string | null } | null
          metadata?: Record<string, string>
        }
        if (
          session.metadata?.order_payment_link === "1" &&
          session.payment_status === "paid" &&
          typeof session.payment_intent === "string"
        ) {
          const supabase = await createServiceClient()
          await handleOrderPaymentLinkSucceeded(supabase, {
            id: session.payment_intent,
            amount_received: session.amount_total ?? 0,
            metadata: { ...(session.metadata ?? {}), checkout_session_id: session.id },
            payment_method: null,
            customer: typeof session.customer === "string" ? session.customer : null,
            receipt_email: session.customer_details?.email ?? null,
          })
        }
        break
      }

      // La sesión del link caducó sin pagarse: el link persistido en
      // el pedido ya no sirve y se limpia para que el panel no lo
      // ofrezca como vigente (best-effort).
      case "checkout.session.expired": {
        const session = event.data.object as {
          id: string
          metadata?: Record<string, string>
        }
        if (session.metadata?.order_payment_link === "1") {
          const supabase = await createServiceClient()
          await clearPersistedOrderPaymentLink(supabase, session.id)
        }
        break
      }

      // Connect: Stripe avisa cada vez que cambia el estado de verificación
      // de una cuenta Express (requisitos pendientes, habilitada, bloqueada).
      // Es la fuente de verdad del enrutamiento de fondos: el restaurante no
      // necesita volver al panel para que su cuenta quede habilitada.
      case "account.updated": {
        const supabase = await createServiceClient()
        await handleConnectAccountUpdated(
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
