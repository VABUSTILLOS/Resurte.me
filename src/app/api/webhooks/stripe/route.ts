import { NextResponse, type NextRequest } from "next/server"
import { getStripe } from "@/lib/stripe"
import { headers } from "next/headers"
import { createServiceClient } from "@/lib/supabase/service"
import { confirmPaymentToCustomer, notifyCustomerStatusUpdate } from "@/lib/workflows"

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
    console.error("Stripe webhook signature error:", message)
    return NextResponse.json({ error: message }, { status: 400 })
  }

  try {
    switch (event.type) {
      case "payment_intent.succeeded": {
        const paymentIntent = event.data.object as {
          id: string
          amount_received: number
          currency?: string
          metadata?: Record<string, string>
        }
        console.log("✅ Payment succeeded:", paymentIntent.id, "amount:", paymentIntent.amount_received)

        const supabase = await createServiceClient()

        // Update payment status (pedidos B2B de Resurte)
        const { data: order, error } = await supabase
          .from("orders")
          .update({
            payment_status: "paid",
            status: "confirmed",
            updated_at: new Date().toISOString(),
          })
          .eq("stripe_payment_intent_id", paymentIntent.id)
          .select("id, user_id")
          .single()

        // Actualiza pedidos FoodOS (micrositio /r/[slug]) del mismo intent,
        // solo si el monto recibido coincide con el total del pedido.
        const { data: foodosOrder, error: foodosError } = await supabase
          .from("foodos_orders")
          .select("id, total")
          .eq("stripe_payment_intent_id", paymentIntent.id)
          .maybeSingle()

        if (foodosError) {
          console.error("Failed to fetch foodos order payment:", foodosError.message)
        } else if (foodosOrder) {
          const expectedCents = Math.round(Number(foodosOrder.total) * 100)
          if (paymentIntent.amount_received >= expectedCents) {
            await supabase
              .from("foodos_orders")
              .update({ payment_status: "paid", updated_at: new Date().toISOString() })
              .eq("id", foodosOrder.id)
            console.log("✅ FoodOS payment succeeded for order:", foodosOrder.id)
          } else {
            await supabase
              .from("foodos_orders")
              .update({
                payment_status: "amount_mismatch",
                updated_at: new Date().toISOString(),
              })
              .eq("id", foodosOrder.id)
            console.error(
              `⚠️ FoodOS amount mismatch: order ${foodosOrder.id} expected ${expectedCents}, received ${paymentIntent.amount_received}`
            )
          }
        }

        if (error) {
          console.error("Failed to update order payment:", error.message)
        } else if (order) {
          // Trigger WhatsApp: payment confirmation + status update
          confirmPaymentToCustomer(order.id).catch((e) =>
            console.error("Workflow: payment_confirmed failed:", e)
          )
          notifyCustomerStatusUpdate(order.id, "confirmed").catch((e) =>
            console.error("Workflow: status_update failed:", e)
          )
        }
        break
      }

      case "payment_intent.payment_failed": {
        const paymentIntent = event.data.object as { id: string }
        console.log("❌ Payment failed:", paymentIntent.id)

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
        console.log("🚫 Payment canceled:", paymentIntent.id)

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
        console.log(`Unhandled event type: ${event.type}`)
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error("Stripe webhook handler error:", error)
    return NextResponse.json(
      { error: "Webhook handler failed" },
      { status: 500 }
    )
  }
}
