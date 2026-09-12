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
  type StripePaymentIntentLike,
} from "@/lib/stripe-webhook-handlers"

// payment_status terminales: no se tocan.
const TERMINAL_STATUSES = ["paid", "failed", "canceled", "refunded"] as const
const STALE_MINUTES = 15
const BATCH_LIMIT = 50

export async function reconcileStalePayments(): Promise<{
  checked: number
  updated: number
  errors: Array<{ orderId: number; error: string }>
}> {
  const supabase = await createServiceClient()
  const cutoff = new Date(Date.now() - STALE_MINUTES * 60 * 1000).toISOString()

  // Los pedidos pagados con Stripe usan payment_method = 'card'
  // (whitelist de POST /api/orders).
  const { data: staleOrders, error } = await supabase
    .from("orders")
    .select("id, stripe_payment_intent_id, payment_status")
    .eq("payment_method", "card")
    .not("payment_status", "in", `(${TERMINAL_STATUSES.map((s) => `"${s}"`).join(",")})`)
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
  const errors: Array<{ orderId: number; error: string }> = []

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
      const piLike: StripePaymentIntentLike = {
        id: pi.id,
        amount_received: pi.amount_received,
        currency: pi.currency,
        metadata: pi.metadata ?? undefined,
        payment_method: typeof pi.payment_method === "string" ? pi.payment_method : null,
        customer: typeof pi.customer === "string" ? pi.customer : null,
        receipt_email: pi.receipt_email ?? null,
      }

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

  logger.info("reconcile-payments.done", { checked, updated, errors: errors.length })
  return { checked, updated, errors }
}
