/**
 * Reconciliación de pagos Stripe: busca pedidos con tarjeta cuyo
 * payment_status quedó en un estado no terminal (p.ej. el webhook nunca
 * llegó o falló) hace más de 15 minutos, consulta el PaymentIntent real en
 * Stripe y lo enruta por los MISMOS handlers del webhook
 * (@/lib/stripe-webhook-handlers).
 *
 * Idempotente: el trigger trg_credit_cashback_on_payment (migración 00029)
 * solo abona cashback en la transición a 'paid' y tiene guard anti-doble-
 * abono por wallet_transactions; los handlers también validan monto antes
 * de marcar paid.
 *
 * Cubre DOS fuentes:
 *  - `orders` (marketplace, ids enteros)
 *  - `foodos_orders` (micrositio /r/[slug], ids UUID) — necesario porque los
 *    métodos locales asíncronos (OXXO/SPEI/CoDi) viven minutos u horas en un
 *    estado intermedio y un voucher caducado NO dispara `payment_failed`.
 *
 * Núcleo compartido: lo llaman /api/cron/reconcile-payments (endpoint
 * protegido con CRON_SECRET) y el cron diario consolidado /api/cron/daily
 * (el plan Hobby solo permite crons diarios).
 */

import { createServiceClient } from "@/lib/supabase/service"
import { getStripe } from "@/lib/stripe"
import { logger } from "@/lib/logger"
import {
  handlePaymentIntentSucceeded,
  handlePaymentIntentFailed,
  handlePaymentIntentCanceled,
  handlePaymentIntentProcessing,
  handleFoodosPaymentIntentExpired,
  type StripePaymentIntentLike,
} from "@/lib/stripe-webhook-handlers"

// payment_status terminales: no se tocan. `expired` y `amount_mismatch` son
// estados finales del cobro; `processing` NO es terminal (hay que seguir
// vigilando hasta que se acredite o caduque).
const TERMINAL_STATUSES = [
  "paid",
  "failed",
  "canceled",
  "refunded",
  "expired",
  "amount_mismatch",
] as const
const STALE_MINUTES = 15
const BATCH_LIMIT = 50

/**
 * Ventana de vida de un voucher local (OXXO/SPEI/CoDi). Pasado este tiempo
 * con el intent todavía en `requires_payment_method` sin error de cobro, se
 * considera caducado. Es deliberadamente más largo que el TTL real de Stripe
 * (3 días para OXXO) para no expirar un voucher que aún sea pagable.
 */
const FOODOS_VOUCHER_TTL_HOURS = 96

interface ReconcileResult {
  checked: number
  updated: number
  errors: Array<{ orderId: number | string; error: string }>
}

/** Mapea el PaymentIntent de Stripe al subconjunto que consumen los handlers. */
function toPaymentIntentLike(pi: {
  id: string
  amount_received: number
  currency: string
  metadata: Record<string, string> | null
  payment_method: string | { id: string } | null
  customer: string | { id: string } | null
  receipt_email: string | null
  cancellation_reason?: string | null
}): StripePaymentIntentLike {
  return {
    id: pi.id,
    amount_received: pi.amount_received,
    currency: pi.currency,
    metadata: pi.metadata ?? undefined,
    payment_method: typeof pi.payment_method === "string" ? pi.payment_method : null,
    customer: typeof pi.customer === "string" ? pi.customer : null,
    receipt_email: pi.receipt_email ?? null,
    cancellation_reason: pi.cancellation_reason ?? null,
  }
}

function nonTerminalFilter() {
  return `(${TERMINAL_STATUSES.map((s) => `"${s}"`).join(",")})`
}

export async function reconcileStalePayments(): Promise<
  ReconcileResult & { foodosChecked: number; foodosUpdated: number }
> {
  const supabase = await createServiceClient()
  const cutoff = new Date(Date.now() - STALE_MINUTES * 60 * 1000).toISOString()

  // Los pedidos pagados con Stripe usan payment_method = 'card'
  // (whitelist de POST /api/orders).
  const { data: staleOrders, error } = await supabase
    .from("orders")
    .select("id, stripe_payment_intent_id, payment_status")
    .eq("payment_method", "card")
    .not("payment_status", "in", nonTerminalFilter())
    .lt("created_at", cutoff)
    .order("created_at", { ascending: true })
    .limit(BATCH_LIMIT)

  if (error) {
    logger.error("reconcile-payments: orders fetch error:", error)
    throw new Error(error.message)
  }

  const stripe = getStripe()
  let checked = 0
  let updated = 0
  const errors: Array<{ orderId: number | string; error: string }> = []

  for (const order of staleOrders ?? []) {
    const piId = order.stripe_payment_intent_id as string | null
    if (!piId) {
      // Pedido sin PI ligado: el cliente nunca llegó a crear el intent
      // (abandono antes del modal). Nada que reconciliar.
      logger.warn("reconcile-payments.skipped_no_pi", { order: order.id, payment_status: order.payment_status })
      continue
    }

    checked++
    try {
      const pi = await stripe.paymentIntents.retrieve(piId)
      const piLike = toPaymentIntentLike(pi)

      switch (pi.status) {
        case "succeeded":
          await handlePaymentIntentSucceeded(supabase, piLike)
          updated++
          break
        case "canceled":
          await handlePaymentIntentCanceled(supabase, piLike)
          updated++
          break
        case "requires_payment_method":
          // Estado tras un cobro fallido (last_payment_error presente).
          if (pi.last_payment_error) {
            await handlePaymentIntentFailed(supabase, piLike)
            updated++
          }
          break
        default:
          // processing / requires_action / requires_confirmation /
          // requires_capture: pago aún en curso, se reintenta en la
          // siguiente corrida.
          logger.info("reconcile-payments.pi_in_progress", { order: order.id, status: pi.status })
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown"
      logger.error("reconcile-payments.order_error:", err, { order: order.id })
      errors.push({ orderId: order.id, error: message })
    }
  }

  const foodos = await reconcileStaleFoodosPayments(supabase, stripe, cutoff)

  logger.info("reconcile-payments.done", {
    checked,
    updated,
    errors: errors.length,
    foodosChecked: foodos.checked,
    foodosUpdated: foodos.updated,
  })

  return {
    checked,
    updated,
    errors: [...errors, ...foodos.errors],
    foodosChecked: foodos.checked,
    foodosUpdated: foodos.updated,
  }
}

/**
 * Barrido equivalente para `foodos_orders`. Además de reparar pagos cuyo
 * webhook se perdió, es el ÚNICO mecanismo que detecta la caducidad de un
 * voucher OXXO/SPEI/CoDi: Stripe deja el intent en `requires_payment_method`
 * sin `last_payment_error`, y ese estado no emite ningún evento.
 */
async function reconcileStaleFoodosPayments(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  stripe: ReturnType<typeof getStripe>,
  cutoff: string
): Promise<ReconcileResult> {
  const voucherCutoff = new Date(
    Date.now() - FOODOS_VOUCHER_TTL_HOURS * 60 * 60 * 1000
  ).toISOString()

  const { data: staleFoodos, error } = await supabase
    .from("foodos_orders")
    .select("id, stripe_payment_intent_id, payment_status, created_at")
    .not("stripe_payment_intent_id", "is", null)
    .not("payment_status", "in", nonTerminalFilter())
    .lt("created_at", cutoff)
    .order("created_at", { ascending: true })
    .limit(BATCH_LIMIT)

  if (error) {
    logger.error("reconcile-payments: foodos_orders fetch error:", error)
    return { checked: 0, updated: 0, errors: [{ orderId: "foodos", error: error.message }] }
  }

  let checked = 0
  let updated = 0
  const errors: Array<{ orderId: number | string; error: string }> = []

  for (const order of staleFoodos ?? []) {
    const piId = order.stripe_payment_intent_id as string | null
    if (!piId) continue

    checked++
    try {
      const pi = await stripe.paymentIntents.retrieve(piId)
      const piLike = toPaymentIntentLike(pi)

      switch (pi.status) {
        case "succeeded":
          await handlePaymentIntentSucceeded(supabase, piLike)
          updated++
          break
        case "canceled":
          await handlePaymentIntentCanceled(supabase, piLike)
          updated++
          break
        case "processing":
        case "requires_action":
          // Instrucciones ya entregadas al cliente (voucher/CLABE/QR): se
          // persiste el estado para que el panel y el tracking lo muestren.
          await handlePaymentIntentProcessing(supabase, piLike)
          updated++
          break
        case "requires_payment_method":
          if (pi.last_payment_error) {
            // El cobro fue rechazado.
            await handlePaymentIntentFailed(supabase, piLike)
            updated++
          } else if ((order.created_at as string) < voucherCutoff) {
            // Sin error y sin fondos pasada la ventana del voucher: caducó.
            // Stripe no emite evento en este caso.
            await handleFoodosPaymentIntentExpired(supabase, piLike)
            updated++
          }
          break
        default:
          logger.info("reconcile-payments.foodos_pi_in_progress", {
            order: order.id,
            status: pi.status,
          })
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown"
      logger.error("reconcile-payments.foodos_order_error:", err, { order: order.id })
      errors.push({ orderId: order.id, error: message })
    }
  }

  return { checked, updated, errors }
}
