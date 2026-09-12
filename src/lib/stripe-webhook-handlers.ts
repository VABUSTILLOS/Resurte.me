import { after } from "next/server"
import { confirmPaymentToCustomer, notifyCustomerStatusUpdate } from "@/lib/workflows"
import { sendOrderStatusEmail } from "@/lib/order-emails"
import { isAmountSufficient, toCents } from "@/lib/payment-validation"
import { logger } from "@/lib/logger"
import type { createServiceClient } from "@/lib/supabase/service"

/**
 * Handlers por evento de Stripe, extraídos de /api/webhooks/stripe para
 * reutilizarlos en la reconciliación (cron /api/cron/reconcile-payments).
 * La ruta webhook conserva la verificación de firma y el dispatch.
 *
 * LÓGICA DE DINERO: preservar el comportamiento EXACTO del webhook original.
 */

export type ServiceClient = Awaited<ReturnType<typeof createServiceClient>>

/** Subconjunto del PaymentIntent de Stripe que los handlers consumen. */
export interface StripePaymentIntentLike {
  id: string
  amount_received: number
  currency?: string
  metadata?: Record<string, string>
  payment_method?: string | null
  customer?: string | null
  receipt_email?: string | null
}

/**
 * payment_intent.succeeded: marca el pedido como pagado (validando el monto),
 * repara el lookup canónico por metadata.order_id si hace falta, procesa
 * upsells 1-click y pedidos FoodOS ligados al mismo intent.
 */
export async function handlePaymentIntentSucceeded(
  supabase: ServiceClient,
  paymentIntent: StripePaymentIntentLike
): Promise<void> {
  logger.info("stripe.payment.succeeded", { paymentIntent: paymentIntent.id, amount: paymentIntent.amount_received })

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
    // Idempotencia: Stripe puede re-entregar payment_intent.succeeded.
    // Si la orden YA está pagada, no repetir el update ni reenviar las
    // notificaciones de WhatsApp (el cashback ya está protegido por el
    // trigger, pero los workflows no).
    if (lookupOrder.payment_status === "paid") {
      logger.info("stripe.payment.succeeded.duplicate", { order: lookupOrder.id })
    } else if (isAmountSufficient(paymentIntent.amount_received, lookupOrder.total)) {
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
          customer_email: lookupOrder.customer_email ?? paymentIntent.receipt_email ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", lookupOrder.id)
        .neq("payment_status", "paid")

      // Trigger WhatsApp: payment confirmation + status update.
      // Se ejecutan con after() para que corran después de enviar la
      // respuesta (Stripe espera 2xx rápido) pero DENTRO de la vida
      // del serverless function — a diferencia de fire-and-forget,
      // no se cancelan al resolver el response.
      after(() => {
        confirmPaymentToCustomer(lookupOrder.id).catch((e) =>
          logger.error("Workflow: payment_confirmed failed:", e)
        )
        notifyCustomerStatusUpdate(lookupOrder.id, "confirmed").catch((e) =>
          logger.error("Workflow: status_update failed:", e)
        )
        // Email del hito "confirmed": cuando el pago confirma la orden sin
        // pasar por el panel admin, onOrderStatusChange no corre y el cliente
        // no recibía el correo. Dedupe en email_logs evita doble envío si el
        // admin también dispara el cambio de estado.
        sendOrderStatusEmail(lookupOrder.id, "confirmed").catch((e) =>
          logger.error("Email: order_status_confirmed failed:", e)
        )
      })
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
}

/** payment_intent.refunded: marca orders y foodos_orders como refunded. */
export async function handlePaymentIntentRefunded(
  supabase: ServiceClient,
  paymentIntent: { id: string }
): Promise<void> {
  logger.info("stripe.refund.succeeded", { paymentIntent: paymentIntent.id })

  await supabase
    .from("orders")
    .update({ payment_status: "refunded", updated_at: new Date().toISOString() })
    .eq("stripe_payment_intent_id", paymentIntent.id)
  await supabase
    .from("foodos_orders")
    .update({ payment_status: "refunded", updated_at: new Date().toISOString() })
    .eq("stripe_payment_intent_id", paymentIntent.id)
}

/** payment_intent.payment_failed: marca orders, foodos_orders y upsells. */
export async function handlePaymentIntentFailed(
  supabase: ServiceClient,
  paymentIntent: { id: string }
): Promise<void> {
  logger.info("stripe.payment.failed", { paymentIntent: paymentIntent.id })

  await supabase
    .from("orders")
    .update({ payment_status: "failed", updated_at: new Date().toISOString() })
    .eq("stripe_payment_intent_id", paymentIntent.id)
  await supabase
    .from("foodos_orders")
    .update({ payment_status: "failed", updated_at: new Date().toISOString() })
    .eq("stripe_payment_intent_id", paymentIntent.id)
  await supabase
    .from("order_upsells")
    .update({ status: "failed" })
    .eq("stripe_payment_intent_id", paymentIntent.id)
  // Devuelve el uso del cupón: el pago no se completó, el cliente no
  // debe perderlo (crítico para cupones personales de recompra de 1 uso).
  await releaseCouponForPaymentIntent(supabase, paymentIntent.id)
}

/**
 * payment_intent.canceled: marca failed solo si el pedido NO está pagado
 * (nunca degrada un pago confirmado); los upsells pasan a canceled.
 */
export async function handlePaymentIntentCanceled(
  supabase: ServiceClient,
  paymentIntent: { id: string }
): Promise<void> {
  logger.info("stripe.payment.canceled", { paymentIntent: paymentIntent.id })

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
    // Mismo criterio que payment_failed: el cupón vuelve a estar disponible.
    await releaseCouponForPaymentIntent(supabase, paymentIntent.id)
  }
  await supabase
    .from("order_upsells")
    .update({ status: "canceled" })
    .eq("stripe_payment_intent_id", paymentIntent.id)
}

/**
 * charge.refunded: Stripe no emite payment_intent.refunded — los reembolsos
 * llegan por esta vía. Marca orders y foodos_orders como refunded; el trigger
 * reverse_cashback_on_cancel() (00065) revierte el cashback abonado.
 */
export async function handleChargeRefunded(
  supabase: ServiceClient,
  charge: { id: string; payment_intent?: string | null; amount_refunded?: number }
): Promise<void> {
  const piId = typeof charge.payment_intent === "string" ? charge.payment_intent : null
  logger.info("stripe.charge.refunded", { charge: charge.id, paymentIntent: piId })
  if (!piId) return

  await supabase
    .from("orders")
    .update({ payment_status: "refunded", updated_at: new Date().toISOString() })
    .eq("stripe_payment_intent_id", piId)
  await supabase
    .from("foodos_orders")
    .update({ payment_status: "refunded", updated_at: new Date().toISOString() })
    .eq("stripe_payment_intent_id", piId)
}

/**
 * charge.dispute.created: contracargo — el banco retira los fondos. Se marca
 * la orden como disputed (solo si estaba pagada; el trigger 00065 revierte
 * el cashback) y queda el rastro en el log para seguimiento operativo.
 */
export async function handleChargeDisputeCreated(
  supabase: ServiceClient,
  dispute: { id: string; payment_intent?: string | null; amount?: number; reason?: string }
): Promise<void> {
  const piId = typeof dispute.payment_intent === "string" ? dispute.payment_intent : null
  logger.error("stripe.dispute.created", {
    dispute: dispute.id,
    paymentIntent: piId,
    amount: dispute.amount,
    reason: dispute.reason,
  })
  if (!piId) return

  await supabase
    .from("orders")
    .update({ payment_status: "disputed", updated_at: new Date().toISOString() })
    .eq("stripe_payment_intent_id", piId)
    .eq("payment_status", "paid")
}

/**
 * Devuelve el uso del cupón de la orden ligada a un PaymentIntent cuando el
 * cobro no se completó (payment_failed / canceled). El cupón se reservó al
 * crear la orden (POST /api/orders) y sin esta liberación el cliente lo
 * pierde por un rechazo bancario — peor caso: cupones personales de recompra
 * con max_uses = 1.
 *
 * Mismo patrón de concurrencia optimista que releaseCoupon() en
 * /api/orders: el UPDATE es condicional al used_count leído para no pisar
 * una reserva concurrente. Best-effort: nunca rompe el webhook.
 */
async function releaseCouponForPaymentIntent(
  supabase: ServiceClient,
  paymentIntentId: string
) {
  try {
    const { data: order } = await supabase
      .from("orders")
      .select("id, coupon_code")
      .eq("stripe_payment_intent_id", paymentIntentId)
      .maybeSingle()
    if (!order?.coupon_code) return

    const { data: coupon } = await supabase
      .from("coupons")
      .select("id, used_count")
      .eq("code", order.coupon_code)
      .maybeSingle()
    if (!coupon || coupon.used_count <= 0) return

    const { data: released } = await supabase
      .from("coupons")
      .update({ used_count: coupon.used_count - 1 })
      .eq("id", coupon.id)
      .eq("used_count", coupon.used_count)
      .select("id")

    if (released && released.length > 0) {
      logger.info("stripe.coupon.released", {
        order: order.id,
        coupon: order.coupon_code,
      })
    }
  } catch (e) {
    logger.error("stripe.coupon.release_failed:", e)
  }
}
