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
  cancellation_reason?: string | null
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
    .select("id, user_id, total, customer_email")
    .eq("stripe_payment_intent_id", paymentIntent.id)
    .maybeSingle()

  let lookupOrder = order
  let lookupError = error
  if ((!order && !error) || error) {
    const orderIdFromMetadata = Number(paymentIntent.metadata?.order_id)
    if (Number.isFinite(orderIdFromMetadata) && orderIdFromMetadata > 0) {
      const fb = await supabase
        .from("orders")
        .select("id, user_id, total, customer_email")
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
  //
  // Igual que en `orders`, se busca por stripe_payment_intent_id (canonical) y
  // si no está persistido se hace fallback por metadata.foodos_order_id: el PI
  // siempre lo lleva y Stripe lo preserva en el evento, así que un fallo
  // silencioso al guardar la columna no pierde el cobro.
  const { data: foodosOrder, error: foodosError } = await supabase
    .from("foodos_orders")
    .select("id, total")
    .eq("stripe_payment_intent_id", paymentIntent.id)
    .maybeSingle()

  let lookupFoodosOrder = foodosOrder
  let lookupFoodosError = foodosError
  if (!foodosOrder && !foodosError) {
    const foodosOrderId = paymentIntent.metadata?.foodos_order_id
    if (foodosOrderId) {
      const fb = await supabase
        .from("foodos_orders")
        .select("id, total")
        .eq("id", foodosOrderId)
        .maybeSingle()
      if (fb.data && !fb.error) {
        lookupFoodosOrder = fb.data
        lookupFoodosError = null
        // Repara el dato canónico para que el tracking del cliente y la
        // reconciliación encuentren el pedido por el PI.
        await supabase
          .from("foodos_orders")
          .update({ stripe_payment_intent_id: paymentIntent.id })
          .eq("id", fb.data.id)
      }
    }
  }

  if (lookupFoodosError) {
    logger.error("Failed to fetch foodos order payment:", lookupFoodosError.message)
  } else if (lookupFoodosOrder) {
    if (isAmountSufficient(paymentIntent.amount_received, lookupFoodosOrder.total)) {
      await supabase
        .from("foodos_orders")
        .update({ payment_status: "paid" })
        .eq("id", lookupFoodosOrder.id)
      logger.info("stripe.foodos.payment.succeeded", { order: lookupFoodosOrder.id })
    } else {
      await supabase
        .from("foodos_orders")
        .update({
          payment_status: "amount_mismatch",
        })
        .eq("id", lookupFoodosOrder.id)
      logger.error(
        `⚠️ FoodOS amount mismatch: order ${lookupFoodosOrder.id} expected ${toCents(lookupFoodosOrder.total)}, received ${paymentIntent.amount_received}`
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
    .update({ payment_status: "refunded" })
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
    .update({ payment_status: "failed" })
    .eq("stripe_payment_intent_id", paymentIntent.id)
  await supabase
    .from("order_upsells")
    .update({ status: "failed" })
    .eq("stripe_payment_intent_id", paymentIntent.id)
}

/**
 * payment_intent.canceled: marca failed solo si el pedido NO está pagado
 * (nunca degrada un pago confirmado); los upsells pasan a canceled.
 *
 * `cancellation_reason === "expired"` indica que un método asíncrono
 * (OXXO/SPEI/CoDi) caducó sin acreditarse; en FoodOS se refleja como
 * `expired` en vez de `failed` para que el panel distinga "el cliente
 * nunca pagó el voucher" de "el cobro fue rechazado".
 */
export async function handlePaymentIntentCanceled(
  supabase: ServiceClient,
  paymentIntent: { id: string; cancellation_reason?: string | null }
): Promise<void> {
  logger.info("stripe.payment.canceled", {
    paymentIntent: paymentIntent.id,
    reason: paymentIntent.cancellation_reason ?? null,
  })

  const expired = paymentIntent.cancellation_reason === "expired"

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

  // FoodOS: mismo guard (nunca degradar un pago acreditado).
  const { data: foodosOrder } = await supabase
    .from("foodos_orders")
    .select("id, payment_status")
    .eq("stripe_payment_intent_id", paymentIntent.id)
    .maybeSingle()

  if (foodosOrder && foodosOrder.payment_status !== "paid") {
    await supabase
      .from("foodos_orders")
      .update({
        payment_status: expired ? "expired" : "failed",
      })
      .eq("id", foodosOrder.id)
  }

  await supabase
    .from("order_upsells")
    .update({ status: "canceled" })
    .eq("stripe_payment_intent_id", paymentIntent.id)
}

/**
 * payment_intent.processing / payment_intent.requires_action: el cliente ya
 * recibió las instrucciones de un método asíncrono (voucher OXXO, CLABE SPEI,
 * QR CoDi) y el dinero aún no se acredita.
 *
 * El guard `.eq("payment_status", "pending")` hace la transición idempotente
 * y, sobre todo, evita degradar un pedido ya pagado cuando Stripe re-entrega
 * el evento fuera de orden.
 */
export async function handlePaymentIntentProcessing(
  supabase: ServiceClient,
  paymentIntent: { id: string }
): Promise<void> {
  logger.info("stripe.payment.processing", { paymentIntent: paymentIntent.id })

  await supabase
    .from("orders")
    .update({ payment_status: "processing", updated_at: new Date().toISOString() })
    .eq("stripe_payment_intent_id", paymentIntent.id)
    .eq("payment_status", "pending")

  await supabase
    .from("foodos_orders")
    .update({ payment_status: "processing" })
    .eq("stripe_payment_intent_id", paymentIntent.id)
    .eq("payment_status", "pending")
}

/**
 * Expiración de un voucher FoodOS detectada por el cron de reconciliación
 * (Stripe deja el intent en `requires_payment_method` sin `last_payment_error`
 * cuando un OXXO/SPEI caduca, y ese estado no dispara `payment_failed`).
 *
 * Solo toca `foodos_orders`: los pedidos del marketplace conservan la
 * semántica existente de `handlePaymentIntentFailed`.
 */
export async function handleFoodosPaymentIntentExpired(
  supabase: ServiceClient,
  paymentIntent: { id: string }
): Promise<void> {
  logger.warn("stripe.foodos.payment.expired", { paymentIntent: paymentIntent.id })

  await supabase
    .from("foodos_orders")
    .update({ payment_status: "expired" })
    .eq("stripe_payment_intent_id", paymentIntent.id)
    .in("payment_status", ["pending", "processing"])
}
