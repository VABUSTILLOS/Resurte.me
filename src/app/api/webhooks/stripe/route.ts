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
 *
 * Eventos soportados:
 *  - payment_intent.succeeded / payment_failed / canceled
 *  - charge.refunded (los reembolsos NO llegan como payment_intent.refunded;
 *    suscribir charge.refunded en el Dashboard de Stripe)
 *  - charge.dispute.created / charge.dispute.funds_withdrawn
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
        // Primero se busca por stripe_payment_intent_id (canonical). Si la
        // columna no se persistió (fallo silencioso del update al crear el
        // intent), se hace fallback por metadata.order_id, que el PI siempre
        // lleva y Stripe preserva en el evento.
        const { data: order, error } = await supabase
          .from("orders")
          .select("id, user_id, total, customer_email, payment_status")
          .eq("stripe_payment_intent_id", paymentIntent.id)
          .maybeSingle()

        let lookupOrder = order
        let lookupError = error
        if ((!order && !error) || error) {
          const orderIdFromMetadata = Number(paymentIntent.metadata?.order_id)
          if (Number.isFinite(orderIdFromMetadata) && orderIdFromMetadata > 0) {
            const fb = await supabase
              .from("orders")
              .select("id, user_id, total, customer_email, payment_status")
              .eq("id", orderIdFromMetadata)
              .maybeSingle()
            if (fb.data && !fb.error) {
              lookupOrder = fb.data
              lookupError = null
              // Repara el dato canónico para que futuros eventos (o el panel
              // de admin) encuentren la orden por el PI.
              await supabase
                .from("orders")
                .update({ stripe_payment_intent_id: paymentIntent.id })
                .eq("id", lookupOrder.id)
            }
          }
        }
        if (lookupError) {
          logger.error("Failed to fetch order payment:", lookupError.message)
        }

        if (!lookupError && lookupOrder) {
          if (isAmountSufficient(paymentIntent.amount_received, lookupOrder.total)) {
            // Idempotencia (A4): Stripe re-entrega eventos. El UPDATE es
            // condicional (payment_status != 'paid') y los workflows solo se
            // disparan si esta entrega fue la que transicionó el pedido a
            // pagado — las re-entregas no reenvían WhatsApps al cliente.
            const { data: paidRows, error: paidUpdateError } = await supabase
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
                customer_email: lookupOrder.customer_email ?? paymentIntent.receipt_email ?? null,
                updated_at: new Date().toISOString(),
              })
              .eq("id", lookupOrder.id)
              .neq("payment_status", "paid")
              .select("id")

            if (paidUpdateError) {
              logger.error("Failed to mark order paid:", paidUpdateError.message)
            }

            // Trigger WhatsApp: payment confirmation + status update.
            // Se ejecutan con after() para que corran después de enviar la
            // respuesta (Stripe espera 2xx rápido) pero DENTRO de la vida
            // del serverless function — a diferencia de fire-and-forget,
            // no se cancelan al resolver el response.
            if (paidRows && paidRows.length > 0) {
              after(() => {
                confirmPaymentToCustomer(lookupOrder.id).catch((e) =>
                  logger.error("Workflow: payment_confirmed failed:", e)
                )
                notifyCustomerStatusUpdate(lookupOrder.id, "confirmed").catch((e) =>
                  logger.error("Workflow: status_update failed:", e)
                )
              })
            }
          } else {
            await supabase
              .from("orders")
              .update({
                payment_status: "amount_mismatch",
                updated_at: new Date().toISOString(),
              })
              .eq("id", lookupOrder.id)
            logger.error(
              `⚠️ Amount mismatch: order ${lookupOrder.id} expected ${toCents(lookupOrder.total)}, received ${paymentIntent.amount_received}`
            )
          }
        }

        // Upsells 1-click: si este intent corresponde a un order_upsells, se
        // marca como pagado y se insertan sus items (item_type='upsell').
        // NUNCA se toca orders.total ni el payment_status de la orden base:
        // el cargo base ya fue validado y el cashback se calculó con él.
        const { data: upsellRow, error: upsellError } = await supabase
          .from("order_upsells")
          .select("id, order_id, product_id, quantity, unit_price, status")
          .eq("stripe_payment_intent_id", paymentIntent.id)
          .maybeSingle()

        if (upsellError) {
          logger.error("Failed to fetch order_upsells:", upsellError.message)
        } else if (upsellRow) {
          if (upsellRow.status !== "paid") {
            await supabase
              .from("order_upsells")
              .update({
                status: "paid",
                paid_at: new Date().toISOString(),
              })
              .eq("id", upsellRow.id)

            // Idempotente: Stripe puede re-entregar el webhook; no duplicar items.
            const { data: existingUpsellItem } = await supabase
              .from("order_items")
              .select("id")
              .eq("order_id", upsellRow.order_id)
              .eq("product_id", upsellRow.product_id)
              .eq("quantity", upsellRow.quantity)
              .eq("unit_price", upsellRow.unit_price)
              .eq("item_type", "upsell")
              .maybeSingle()

            if (!existingUpsellItem) {
              await supabase.from("order_items").insert({
                order_id: upsellRow.order_id,
                product_id: upsellRow.product_id,
                quantity: upsellRow.quantity,
                unit_price: upsellRow.unit_price,
                item_type: "upsell",
              })
            }
          }
          logger.info("stripe.upsell.payment.succeeded", { order_upsell: upsellRow.id })
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

      // Stripe NO emite payment_intent.refunded: los reembolsos llegan como
      // charge.refunded (ver el case de abajo). Este branch se conserva por
      // compatibilidad pero nunca se ejecuta con el catálogo actual de eventos.
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

      case "charge.refunded": {
        // C1: la vía real por la que Stripe notifica reembolsos. El objeto
        // charge trae payment_intent como campo (id del PI de la orden).
        const charge = event.data.object as {
          id: string
          payment_intent?: string | null
          amount: number
          amount_refunded: number
          refunded?: boolean
        }
        const pi = typeof charge.payment_intent === "string" ? charge.payment_intent : null
        logger.info("stripe.charge.refunded", {
          charge: charge.id,
          paymentIntent: pi,
          amount_refunded: charge.amount_refunded,
        })
        if (!pi) break

        const fullyRefunded = charge.refunded === true || charge.amount_refunded >= charge.amount
        if (!fullyRefunded) {
          // Reembolso parcial: la orden sigue pagada; se registra para
          // revisión manual (no hay estado 'partially_refunded' en el schema).
          logger.info("stripe.charge.refunded.partial", { paymentIntent: pi, amount_refunded: charge.amount_refunded })
          break
        }

        const supabase = await createServiceClient()
        // Solo órdenes actualmente pagadas: al transicionar a 'refunded' el
        // trigger trg_reverse_cashback (00027 + 00065) revierte el cashback
        // que generó la compra — deduplicado por transacción 'Reversión%'.
        await supabase
          .from("orders")
          .update({ payment_status: "refunded", updated_at: new Date().toISOString() })
          .eq("stripe_payment_intent_id", pi)
          .eq("payment_status", "paid")
        await supabase
          .from("foodos_orders")
          .update({ payment_status: "refunded", updated_at: new Date().toISOString() })
          .eq("stripe_payment_intent_id", pi)
          .eq("payment_status", "paid")
        break
      }

      case "charge.dispute.created":
      case "charge.dispute.funds_withdrawn": {
        // C2: un contracargo marca la orden como 'disputed' y el trigger
        // (00065) revierte el cashback pendiente de resolución. Si la
        // disputa se gana, el admin regresa la orden a 'paid' desde el panel.
        const dispute = event.data.object as {
          id: string
          payment_intent?: string | null
        }
        const pi = typeof dispute.payment_intent === "string" ? dispute.payment_intent : null
        logger.warn("stripe.dispute", { type: eventType, dispute: dispute.id, paymentIntent: pi })
        if (!pi) break

        const supabase = await createServiceClient()
        await supabase
          .from("orders")
          .update({ payment_status: "disputed", updated_at: new Date().toISOString() })
          .eq("stripe_payment_intent_id", pi)
          .eq("payment_status", "paid")
        await supabase
          .from("foodos_orders")
          .update({ payment_status: "disputed", updated_at: new Date().toISOString() })
          .eq("stripe_payment_intent_id", pi)
          .eq("payment_status", "paid")
        break
      }

      case "payment_intent.payment_failed": {
        const paymentIntent = event.data.object as { id: string }
        logger.info("stripe.payment.failed", { paymentIntent: paymentIntent.id })

        const supabase = await createServiceClient()
        // A2: al fallar el cobro se libera el cupón reservado al crear la
        // orden — un rechazo bancario no debe quemar el cupón del cliente
        // (crítico en cupones personales de un solo uso).
        const { data: failedOrder } = await supabase
          .from("orders")
          .select("id, coupon_code, payment_status")
          .eq("stripe_payment_intent_id", paymentIntent.id)
          .maybeSingle()

        if (failedOrder) {
          if (failedOrder.payment_status !== "paid") {
            await supabase
              .from("orders")
              .update({ payment_status: "failed", updated_at: new Date().toISOString() })
              .eq("id", failedOrder.id)
            await releaseOrderCoupon(supabase, failedOrder.coupon_code)
          }
        } else {
          await supabase
            .from("orders")
            .update({ payment_status: "failed", updated_at: new Date().toISOString() })
            .eq("stripe_payment_intent_id", paymentIntent.id)
        }
        await supabase
          .from("foodos_orders")
          .update({ payment_status: "failed", updated_at: new Date().toISOString() })
          .eq("stripe_payment_intent_id", paymentIntent.id)
        await supabase
          .from("order_upsells")
          .update({ status: "failed" })
          .eq("stripe_payment_intent_id", paymentIntent.id)
        break
      }

      case "payment_intent.canceled": {
        const paymentIntent = event.data.object as { id: string }
        logger.info("stripe.payment.canceled", { paymentIntent: paymentIntent.id })

        const supabase = await createServiceClient()
        const { data: order } = await supabase
          .from("orders")
          .select("id, payment_status, coupon_code")
          .eq("stripe_payment_intent_id", paymentIntent.id)
          .single()

        if (order && order.payment_status !== "paid") {
          await supabase
            .from("orders")
            .update({ payment_status: "failed", updated_at: new Date().toISOString() })
            .eq("stripe_payment_intent_id", paymentIntent.id)
          // A2: misma liberación de cupón que en payment_failed.
          await releaseOrderCoupon(supabase, order.coupon_code)
        }
        await supabase
          .from("order_upsells")
          .update({ status: "canceled" })
          .eq("stripe_payment_intent_id", paymentIntent.id)
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

type ServiceClient = Awaited<ReturnType<typeof createServiceClient>>

/**
 * Libera el uso del cupón de una orden cuyo pago falló o fue cancelado (A2).
 * El cupón se consume al CREAR la orden (reserva optimista); sin esta
 * liberación, un rechazo bancario quemaba cupones — incluidos los
 * personales de recompra/reactivación de un solo uso.
 *
 * Decremento condicional (used_count = valor leído) para no pisar
 * reservas concurrentes de otros pedidos, con un reintento único si
 * otro proceso movió el contador entre la lectura y el update.
 */
async function releaseOrderCoupon(supabase: ServiceClient, couponCode: string | null) {
  if (!couponCode) return

  const { data: coupon } = await supabase
    .from("coupons")
    .select("id, used_count")
    .ilike("code", couponCode)
    .maybeSingle()

  if (!coupon || coupon.used_count <= 0) return

  const { data: released } = await supabase
    .from("coupons")
    .update({ used_count: coupon.used_count - 1 })
    .eq("id", coupon.id)
    .eq("used_count", coupon.used_count)
    .select("id")

  if (!released || released.length === 0) {
    const { data: fresh } = await supabase
      .from("coupons")
      .select("id, used_count")
      .eq("id", coupon.id)
      .single()
    if (fresh && fresh.used_count > 0) {
      await supabase
        .from("coupons")
        .update({ used_count: fresh.used_count - 1 })
        .eq("id", fresh.id)
        .eq("used_count", fresh.used_count)
    }
  }
}
