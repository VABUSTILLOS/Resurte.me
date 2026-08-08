import { after, NextResponse, type NextRequest } from "next/server"
import { getStripe } from "@/lib/stripe"
import { headers } from "next/headers"
import { createServiceClient } from "@/lib/supabase/service"
import { confirmPaymentToCustomer, notifyCustomerStatusUpdate } from "@/lib/workflows"
import { isAmountSufficient, toCents } from "@/lib/payment-validation"
import { logger } from "@/lib/logger"
/**
 * POST /api/webhooks/stripe
 *
 * Recibe eventos de Stripe y:
 *  1. Actualiza el payment_status del pedido en Supabase
 *  2. Dispara workflows de WhatsApp (confirmación de pago, status update)
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
        const paymentIntent = event.data.object as {
          id: string
          amount_received: number
          currency?: string
          metadata?: Record<string, string>
          payment_method?: string | null
          customer?: string | null
          receipt_email?: string | null
        }
        logger.info("stripe.payment.succeeded", { paymentIntent: paymentIntent.id, amount: paymentIntent.amount_received })

        const supabase = await createServiceClient()

        // Valida el monto recibido contra el total del pedido antes de marcar
        // como pagado. Evita marcar como pagado un intent con monto distinto
        // (p.ej. cliente manipuló el total del body al crear el intent).
        const { data: order, error } = await supabase
          .from("orders")
          .select("id, user_id, total, customer_email")
          .eq("stripe_payment_intent_id", paymentIntent.id)
          .maybeSingle()

        if (!error && order) {
          if (isAmountSufficient(paymentIntent.amount_received, order.total)) {
            await supabase
              .from("orders")
              .update({
                payment_status: "paid",
                status: "confirmed",
                // Persiste el método de pago + customer de Stripe para poder
                // cobrar 1-click upsells off-session después.
                stripe_payment_method_id: paymentIntent.payment_method ?? null,
                stripe_customer_id: paymentIntent.customer ?? null,
                // El email capturado en el drawer llega por esta vía al pedido
                // aunque la sesión del cliente ya no exista.
                customer_email: order.customer_email ?? paymentIntent.receipt_email ?? null,
                updated_at: new Date().toISOString(),
              })
              .eq("id", order.id)

            // Trigger WhatsApp: payment confirmation + status update.
            // Se ejecutan con after() para que corran después de enviar la
            // respuesta (Stripe espera 2xx rápido) pero DENTRO de la vida
            // del serverless function — a diferencia de fire-and-forget,
            // no se cancelan al resolver el response.
            after(() => {
              confirmPaymentToCustomer(order.id).catch((e) =>
                logger.error("Workflow: payment_confirmed failed:", e)
              )
              notifyCustomerStatusUpdate(order.id, "confirmed").catch((e) =>
                logger.error("Workflow: status_update failed:", e)
              )
            })
          } else {
            await supabase
              .from("orders")
              .update({
                payment_status: "amount_mismatch",
                updated_at: new Date().toISOString(),
              })
              .eq("id", order.id)
            logger.error(
              `⚠️ Amount mismatch: order ${order.id} expected ${toCents(order.total)}, received ${paymentIntent.amount_received}`
            )
          }
        } else if (error) {
          logger.error("Failed to fetch order payment:", error.message)
        }

        // Actualiza pedidos FoodOS (micrositio /r/[slug]) del mismo intent,
        // solo si el monto recibido coincide con el total del pedido.
        const { data: foodosOrder, error: foodosError } = await supabase
          .from("foodos_orders")
          .select("id, total")
          .eq("stripe_payment_intent_id", paymentIntent.id)
          .maybeSingle()

        if (foodosError) {
          logger.error("Failed to fetch foodos order payment:", foodosError.message)
        } else if (foodosOrder) {
          if (isAmountSufficient(paymentIntent.amount_received, foodosOrder.total)) {
            await supabase
              .from("foodos_orders")
              .update({ payment_status: "paid", updated_at: new Date().toISOString() })
              .eq("id", foodosOrder.id)
            logger.info("stripe.foodos.payment.succeeded", { order: foodosOrder.id })
          } else {
            await supabase
              .from("foodos_orders")
              .update({
                payment_status: "amount_mismatch",
                updated_at: new Date().toISOString(),
              })
              .eq("id", foodosOrder.id)
            logger.error(
              `⚠️ FoodOS amount mismatch: order ${foodosOrder.id} expected ${toCents(foodosOrder.total)}, received ${paymentIntent.amount_received}`
            )
          }
        }
        break
      }

      case "payment_intent.refunded": {
        const paymentIntent = event.data.object as { id: string }
        logger.info("stripe.refund.succeeded", { paymentIntent: paymentIntent.id })

        const supabase = await createServiceClient()
        await supabase
          .from("orders")
          .update({ payment_status: "refunded", updated_at: new Date().toISOString() })
          .eq("stripe_payment_intent_id", paymentIntent.id)
        await supabase
          .from("foodos_orders")
          .update({ payment_status: "refunded", updated_at: new Date().toISOString() })
          .eq("stripe_payment_intent_id", paymentIntent.id)
        break
      }

      case "payment_intent.payment_failed": {
        const paymentIntent = event.data.object as { id: string }
        logger.info("stripe.payment.failed", { paymentIntent: paymentIntent.id })

        const supabase = await createServiceClient()
        await supabase
          .from("orders")
          .update({ payment_status: "failed", updated_at: new Date().toISOString() })
          .eq("stripe_payment_intent_id", paymentIntent.id)
        await supabase
          .from("foodos_orders")
          .update({ payment_status: "failed", updated_at: new Date().toISOString() })
          .eq("stripe_payment_intent_id", paymentIntent.id)
        break
      }

      case "payment_intent.canceled": {
        const paymentIntent = event.data.object as { id: string }
        logger.info("stripe.payment.canceled", { paymentIntent: paymentIntent.id })

        const supabase = await createServiceClient()
        const { data: order } = await supabase
          .from("orders")
          .select("id, payment_status")
          .eq("stripe_payment_intent_id", paymentIntent.id)
          .single()

        if (order && order.payment_status !== "paid") {
          await supabase
            .from("orders")
            .update({ payment_status: "failed", updated_at: new Date().toISOString() })
            .eq("stripe_payment_intent_id", paymentIntent.id)
        }
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
