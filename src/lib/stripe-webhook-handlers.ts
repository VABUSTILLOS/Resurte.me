import { after } from "next/server"
import { confirmPaymentToCustomer, notifyCustomerStatusUpdate } from "@/lib/workflows"
import { sendOrderStatusEmail } from "@/lib/order-emails"
import { notifyCashbackCredited } from "@/lib/notifications"
import { isAmountSufficient, toCents } from "@/lib/payment-validation"
import { resolveRefundOutcome } from "@/lib/refund"
import { logger } from "@/lib/logger"
import { missingOptionalOrderColumn, type OrderQueryResult } from "@/lib/admin/order-selects"
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
        // Cashback abonado por el trigger trg_credit_cashback_on_payment:
        // esta vía (tarjeta) no pasa por el panel, así que sin este aviso el
        // saldo subía sin explicación en la campana. El monto lo lee el helper
        // del monedero real y el índice único (order_id, type) dedupe.
        notifyCashbackCredited(lookupOrder.id).catch((e) =>
          logger.error("Notify: cashback_credited failed:", e)
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
  // Devuelve el uso del cupón: el pago no se completó, el cliente no
  // debe perderlo (crítico para cupones personales de recompra de 1 uso).
  await releaseCouponForPaymentIntent(supabase, paymentIntent.id)
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
    // Mismo criterio que payment_failed: el cupón vuelve a estar disponible.
    await releaseCouponForPaymentIntent(supabase, paymentIntent.id)
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

  // `orders.payment_status` es un enum: un valor ausente del enum hace fallar
  // el UPDATE sin lanzar excepción. Sin este log el pedido se quedaba en
  // 'pending' en silencio — exactamente la deriva que motivó la migración
  // 00153. No se relanza: la reconciliación periódica reintenta los 'pending'.
  const { error: ordersError } = await supabase
    .from("orders")
    .update({ payment_status: "processing", updated_at: new Date().toISOString() })
    .eq("stripe_payment_intent_id", paymentIntent.id)
    .eq("payment_status", "pending")
  if (ordersError) {
    logger.error("stripe.payment.processing.orders", {
      paymentIntent: paymentIntent.id,
      error: ordersError.message,
    })
  }

  // `foodos_orders.payment_status` es TEXT, no enum: este UPDATE no podía
  // fallar por deriva. Se registra igual para no perder el diagnóstico.
  const { error: foodosError } = await supabase
    .from("foodos_orders")
    .update({ payment_status: "processing" })
    .eq("stripe_payment_intent_id", paymentIntent.id)
    .eq("payment_status", "pending")
  if (foodosError) {
    logger.error("stripe.foodos.payment.processing", {
      paymentIntent: paymentIntent.id,
      error: foodosError.message,
    })
  }
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

/**
 * charge.refunded: Stripe no emite payment_intent.refunded — los reembolsos
 * llegan por esta vía. Marca orders y foodos_orders con el estado que
 * corresponde; el trigger reverse_cashback_on_cancel() (00065) revierte el
 * cashback **sólo** cuando el reembolso es total.
 *
 * ── Qué cambió y por qué ──
 *
 * Antes marcaba `refunded` sin mirar el importe, aunque recibía
 * `amount_refunded`. Un reembolso parcial de $50 sobre un pedido de $800
 * quedaba como `refunded`, y `refunded` se lee en todo el esquema como "este
 * cobro ya no existe": el trigger 00135 devolvía el cashback **completo** de
 * una compra que el cliente pagó casi entera. El importe se recibía y se
 * tiraba a la basura.
 *
 * Ahora el estado lo decide `resolveRefundOutcome` —la misma función que usa
 * `POST /api/admin/orders/[id]/refund`— y el importe acumulado se guarda en
 * `refunded_amount_cents`, que es lo que hace auditable un reembolso parcial.
 *
 * ── Lo que este webhook NO puede arreglar ──
 *
 * `reverse_transfer` y `refund_application_fee` se deciden al **crear** el
 * reembolso; aquí ya es tarde. Un reembolso hecho a mano desde el Dashboard de
 * Stripe sin esas banderas le devuelve el dinero al cliente con fondos de la
 * plataforma mientras el restaurante conserva su liquidación: el webhook lo
 * registra, no lo revierte. Por eso el camino normal es
 * `POST /api/admin/orders/[id]/refund`, que sí las aplica
 * (`buildRefundParams`). Si el log muestra `charge.refunded` sin un
 * `admin.refund.created` correspondiente, el reembolso se hizo por fuera y hay
 * que revisar la transferencia a mano.
 *
 * `amount_refunded` es **acumulativo** y el evento puede reentregarse, así que
 * `resolveRefundOutcome` satura el acumulado en el total en vez de sumarlo: un
 * reenvío no infla la cifra.
 */
export async function handleChargeRefunded(
  supabase: ServiceClient,
  charge: {
    id: string
    payment_intent?: string | null
    amount?: number
    amount_refunded?: number
    refunded?: boolean
  }
): Promise<void> {
  const piId = typeof charge.payment_intent === "string" ? charge.payment_intent : null
  logger.info("stripe.charge.refunded", {
    charge: charge.id,
    paymentIntent: piId,
    amountRefunded: charge.amount_refunded,
    fullyRefunded: charge.refunded,
  })
  if (!piId) return

  // `amount` es el cobrado; `amount_refunded` el devuelto. Si Stripe no manda
  // `amount` (cargo de otro tipo), se cae a `refunded` como única señal, que
  // es lo que hacía el código anterior.
  const chargedCents = typeof charge.amount === "number" ? charge.amount : null
  const refundedCents =
    typeof charge.amount_refunded === "number" ? charge.amount_refunded : null

  let status: string = "refunded"
  if (chargedCents !== null && refundedCents !== null) {
    status = resolveRefundOutcome({
      totalCents: chargedCents,
      // El evento ya trae el acumulado: se pasa 0 para no sumarlo dos veces.
      alreadyRefundedCents: 0,
      refundAmountCents: refundedCents,
    }).status
  } else if (charge.refunded === false) {
    // Sin importes y con `refunded: false`, no hay reembolso que registrar.
    return
  }

  const patch: Record<string, unknown> = {
    payment_status: status,
    updated_at: new Date().toISOString(),
  }
  if (refundedCents !== null) patch.refunded_amount_cents = refundedCents

  await supabase.from("orders").update(patch).eq("stripe_payment_intent_id", piId)

  const foodosPatch: Record<string, unknown> = { payment_status: status }
  if (refundedCents !== null) foodosPatch.refunded_amount_cents = refundedCents
  await supabase
    .from("foodos_orders")
    .update(foodosPatch)
    .eq("stripe_payment_intent_id", piId)
}

/**
 * charge.dispute.created: contracargo — el banco retira los fondos. Se marca
 * la orden como disputed (solo si estaba pagada; el trigger 00065 revierte
 * el cashback) y queda el rastro en el log para seguimiento operativo.
 *
 * ── Quién pierde el dinero en un contracargo, según cómo se cobró ──
 *
 * En un *destination charge* la cuenta conectada es la que **recibe** los
 * fondos, pero la responsable del contracargo ante Stripe es **la plataforma**:
 * el banco retira el importe de la cuenta de la plataforma, no de la del
 * restaurante. Eso deja dos agujeros que este webhook no puede cerrar por sí
 * solo y que conviene tener escritos:
 *
 *  1. **El restaurante se queda su liquidación.** Si ya se le transfirió y el
 *     contracargo prospera, la plataforma absorbe el importe completo. Nada en
 *     el esquema descuenta esa pérdida del saldo del restaurante ni la resta de
 *     `foodos_payout_balances()` (00157). Mientras no exista ese asiento, el
 *     reporte de dispersiones sobreestima lo que se le debe.
 *
 *  2. **`payment_status = 'disputed'` es una foto, no un saldo.** El estado no
 *     distingue "en revisión" de "perdido": Stripe resuelve semanas después con
 *     `charge.dispute.closed`, que hoy **no tiene handler**. Una disputa
 *     ganada deja la orden marcada para siempre y el dinero nunca vuelve a
 *     contarse.
 *
 * Por eso el importe y el motivo se registran aquí en lugar de descartarse:
 * son el único rastro con el que se puede cuadrar una disputa a mano mientras
 * `charge.dispute.closed` no esté implementado.
 *
 * La actualización exige `payment_status = 'paid'` para no pisar un estado
 * posterior (un `refunded` o un `partially_refunded` ganados por un webhook
 * fuera de orden). El `updated_at` se escribe explícitamente porque el trigger
 * 00135 no lo toca.
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
    // Marca para el seguimiento: en destination charges la pérdida es de la
    // plataforma, no del restaurante que recibió la transferencia.
    platform_liability: true,
    resolution_pending: true,
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
    const fetchOrder = async (select: string) =>
      (await supabase
        .from("orders")
        .select(select)
        .eq("stripe_payment_intent_id", paymentIntentId)
        .maybeSingle()) as unknown as OrderQueryResult<{ id: number; coupon_code?: string | null }>

    let { data: order, error: orderError } = await fetchOrder("id, coupon_code")

    // 42703 = orders.coupon_code aún no existe (migración 00114 sin aplicar):
    // sin el reintento la confirmación de pago fallaba al liberar el cupón.
    if (missingOptionalOrderColumn(orderError) === "coupon_code") {
      logger.warn("stripe.coupon.release_skipped", {
        reason: "orders.coupon_code no existe",
      })
      ;({ data: order, error: orderError } = await fetchOrder("id"))
    }
    if (orderError) {
      logger.warn("stripe.coupon.release_skipped", { reason: orderError.message })
      return
    }
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
