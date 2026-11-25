import { toCents } from "@/lib/payment-validation"
import { logger } from "@/lib/logger"
import type { createServiceClient } from "@/lib/supabase/service"

/**
 * Libro de pagos por pedido (Ola 4, migración 00233).
 *
 * Un pedido puede recibir VARIOS pagos: el anticipo con link de
 * Stripe, un abono en efectivo, el resto contra entrega… Cada pago
 * es una fila de `order_payments` y el saldo es derivado:
 * `total − Σ(amount de filas 'recorded')`. No hay columna de saldo
 * que mantener: dos fuentes del mismo número divergen.
 *
 * Invariantes:
 *  - El monto de cada pago sale de la BD o del webhook de Stripe,
 *    nunca del cuerpo que manda el cliente.
 *  - `orders.payment_status` sigue siendo el estado oficial y solo
 *    pasa a `paid` cuando el libro cubre el total. Un abono parcial
 *    NO marca pagado ni libera el pedido por sí solo.
 *  - Compatibilidad hacia atrás: un pedido con `payment_status =
 *    'paid'` por las vías previas (checkout web, confirmación
 *    manual) se lee como cubierto aunque el libro esté vacío; un
 *    pedido pendiente sin filas tiene saldo = total.
 *  - Sin la migración 00233 la tabla no existe (42P01/PGRST205):
 *    las lecturas degradan a «sin libro» y los registros devuelven
 *    `schemaMissing` para que el llamador decida (el webhook cae a
 *    su comportamiento previo; el panel avisa).
 */

export type ServiceClient = Awaited<ReturnType<typeof createServiceClient>>

export type OrderPaymentMethod =
  | "card"
  | "spei"
  | "oxxo"
  | "cash_on_delivery"
  | "mercado_pago"
  | "codi"
  | "stripe"

export const ORDER_PAYMENT_METHODS: readonly OrderPaymentMethod[] = [
  "card",
  "spei",
  "oxxo",
  "cash_on_delivery",
  "mercado_pago",
  "codi",
  "stripe",
]

export type OrderPaymentOrigin = "stripe_link" | "manual"

export interface OrderPaymentRow {
  id: string
  order_id: number
  amount: number
  method: string
  origin: string
  status: "recorded" | "voided"
  stripe_payment_intent_id: string | null
  stripe_checkout_session_id: string | null
  note: string | null
  created_by: string | null
  created_at: string
}

/** Fila mínima de `orders` que el libro necesita para cuadrar saldos. */
export interface OrderForPayments {
  id: number
  total: number | string
  payment_status: string
  status: string
}

export interface PaymentBalance {
  /** Lo abonado que cuenta: filas registradas, o el total si el estado ya es `paid`. */
  paidAmount: number
  /** Lo que falta por pagar. Nunca negativo. */
  balance: number
  /** El libro, por sí solo, cubre el total. */
  coveredByPayments: boolean
  /** El pedido ya figura pagado en `orders.payment_status`. */
  isPaidStatus: boolean
}

export interface OrderPaymentSummary extends PaymentBalance {
  /** false cuando la tabla `order_payments` no existe (migración sin aplicar). */
  available: boolean
  total: number
  payments: OrderPaymentRow[]
}

/** ¿El error es «la tabla order_payments no existe»? (Postgres 42P01 / PostgREST PGRST205). */
export function isMissingPaymentsTable(error: { code?: string } | null | undefined): boolean {
  return error?.code === "42P01" || error?.code === "PGRST205"
}

/** Σ de abonos vigentes, en centavos (el dinero se suma en enteros, no en flotantes). */
export function sumRecordedPaymentsCents(
  payments: readonly Pick<OrderPaymentRow, "amount" | "status">[]
): number {
  return payments
    .filter((p) => p.status === "recorded")
    .reduce((acc, p) => acc + toCents(p.amount), 0)
}

/**
 * Saldo de un pedido a partir de su total, su estado de pago y su
 * libro. Función pura: la usan el panel, la página de seguimiento,
 * el generador del link y los tests comparten UNA regla.
 */
export function computePaymentBalance(input: {
  total: number | string
  paymentStatus: string
  payments: readonly Pick<OrderPaymentRow, "amount" | "status">[]
}): PaymentBalance {
  const totalCents = toCents(input.total)
  const paidCents = sumRecordedPaymentsCents(input.payments)
  const isPaidStatus = input.paymentStatus === "paid"
  const coveredByPayments = totalCents > 0 && paidCents >= totalCents
  // Compatibilidad: pagado por una vía previa = cubierto aunque el
  // libro no lo refleje completo; lo abonado nunca se muestra por
  // encima del total.
  const effectivePaidCents = isPaidStatus ? totalCents : Math.min(paidCents, totalCents)
  return {
    paidAmount: effectivePaidCents / 100,
    balance: Math.max(0, totalCents - effectivePaidCents) / 100,
    coveredByPayments,
    isPaidStatus,
  }
}

/** Lee el libro de un pedido. Sin la tabla: `available: false` y lista vacía. */
export async function listOrderPayments(
  supabase: ServiceClient,
  orderId: number
): Promise<{ available: boolean; payments: OrderPaymentRow[] }> {
  const { data, error } = await supabase
    .from("order_payments")
    .select(
      "id, order_id, amount, method, origin, status, stripe_payment_intent_id, stripe_checkout_session_id, note, created_by, created_at"
    )
    .eq("order_id", orderId)
    .order("created_at", { ascending: true })

  if (error) {
    if (isMissingPaymentsTable(error)) return { available: false, payments: [] }
    logger.error("order-payments.list_failed", { orderId, error: error.message })
    return { available: false, payments: [] }
  }
  const payments = (data ?? []).map((row) => ({
    ...row,
    amount: Number(row.amount),
  })) as OrderPaymentRow[]
  return { available: true, payments }
}

/** Resumen completo (libro + saldo) de un pedido. */
export async function getOrderPaymentSummary(
  supabase: ServiceClient,
  order: OrderForPayments
): Promise<OrderPaymentSummary> {
  const { available, payments } = await listOrderPayments(supabase, order.id)
  const balance = computePaymentBalance({
    total: order.total,
    paymentStatus: order.payment_status,
    payments,
  })
  return { available, total: Number(order.total) || 0, payments, ...balance }
}

export interface RecordOrderPaymentInput {
  amount: number
  method: OrderPaymentMethod
  origin: OrderPaymentOrigin
  stripePaymentIntentId?: string | null
  stripeCheckoutSessionId?: string | null
  note?: string | null
  createdBy?: string | null
}

export interface RecordOrderPaymentResult {
  /** El pago quedó en el libro (o ya estaba, por idempotencia). */
  recorded: boolean
  /** El PaymentIntent ya tenía su fila: re-entrega del webhook, no es un pago nuevo. */
  alreadyRecorded: boolean
  /** La tabla no existe: el llamador decide la degradación. */
  schemaMissing: boolean
  /** Este registro hizo que el pedido pasara a `paid` en este momento. */
  becamePaid: boolean
  summary: OrderPaymentSummary | null
  error?: string
}

/**
 * Registra un pago en el libro y, si el libro ya cubre el total,
 * voltea el pedido a pagado (`payment_status = 'paid'`; el estado
 * del pedido solo se mueve de `pending` a `confirmed`, como hace
 * el webhook de tarjeta: un pedido ya en preparación no retrocede).
 *
 * Idempotente para Stripe: el índice único parcial sobre
 * `stripe_payment_intent_id` convierte la re-entrega del webhook
 * en `alreadyRecorded`, sin duplicar el abono.
 *
 * Nunca lanza: un fallo del libro no debe tumbar el webhook ni el
 * panel; se devuelve en el resultado y se registra en el log.
 */
export async function recordOrderPayment(
  supabase: ServiceClient,
  order: OrderForPayments,
  input: RecordOrderPaymentInput
): Promise<RecordOrderPaymentResult> {
  const base: RecordOrderPaymentResult = {
    recorded: false,
    alreadyRecorded: false,
    schemaMissing: false,
    becamePaid: false,
    summary: null,
  }

  const { data: inserted, error: insertError } = await supabase
    .from("order_payments")
    .insert({
      order_id: order.id,
      amount: input.amount,
      method: input.method,
      origin: input.origin,
      stripe_payment_intent_id: input.stripePaymentIntentId ?? null,
      stripe_checkout_session_id: input.stripeCheckoutSessionId ?? null,
      note: input.note ?? null,
      created_by: input.createdBy ?? null,
    })
    .select("id")
    .maybeSingle()

  if (insertError) {
    if (isMissingPaymentsTable(insertError)) {
      return { ...base, schemaMissing: true }
    }
    // 23505 = el índice único del PaymentIntent: ya estaba registrado.
    if (insertError.code === "23505" && input.stripePaymentIntentId) {
      const summary = await getOrderPaymentSummary(supabase, order)
      return { ...base, recorded: true, alreadyRecorded: true, summary }
    }
    logger.error("order-payments.record_failed", {
      orderId: order.id,
      error: insertError.message,
    })
    return { ...base, error: insertError.message }
  }
  if (!inserted) {
    return { ...base, error: "insert_sin_fila" }
  }

  const summary = await getOrderPaymentSummary(supabase, order)
  let becamePaid = false
  if (summary.coveredByPayments && order.payment_status !== "paid") {
    const patch: Record<string, unknown> = {
      payment_status: "paid",
      updated_at: new Date().toISOString(),
    }
    if (order.status === "pending") patch.status = "confirmed"
    const { data: updated, error: updateError } = await supabase
      .from("orders")
      .update(patch)
      .eq("id", order.id)
      .neq("payment_status", "paid")
      .select("id")
    if (updateError) {
      logger.error("order-payments.mark_paid_failed", {
        orderId: order.id,
        error: updateError.message,
      })
    } else {
      becamePaid = (updated?.length ?? 0) > 0
    }
  }

  return { ...base, recorded: true, becamePaid, summary }
}

export interface VoidOrderPaymentResult {
  voided: boolean
  /** El pedido figuraba pagado solo por este libro y volvió a `pending`. */
  revertedPaid: boolean
  summary: OrderPaymentSummary | null
  error?: string
}

/**
 * Anula un pago registrado por error (el staff se equivocó de monto
 * o de pedido). La fila no se borra: pasa a `voided` y deja de
 * sumar. Si el pedido estaba `paid` únicamente gracias al libro,
 * el estado de pago vuelve a `pending` (el estado del pedido no se
 * toca: devolver el cobro no regresa el pedido a la cocina).
 */
export async function voidOrderPayment(
  supabase: ServiceClient,
  order: OrderForPayments,
  paymentId: string
): Promise<VoidOrderPaymentResult> {
  const { data: updated, error } = await supabase
    .from("order_payments")
    .update({ status: "voided" })
    .eq("id", paymentId)
    .eq("order_id", order.id)
    .eq("status", "recorded")
    .select("id")

  if (error) {
    if (isMissingPaymentsTable(error)) {
      return { voided: false, revertedPaid: false, summary: null, error: "schema_missing" }
    }
    logger.error("order-payments.void_failed", { orderId: order.id, error: error.message })
    return { voided: false, revertedPaid: false, summary: null, error: error.message }
  }
  if (!updated || updated.length === 0) {
    return { voided: false, revertedPaid: false, summary: null, error: "not_found" }
  }

  let summary = await getOrderPaymentSummary(supabase, order)
  let revertedPaid = false
  if (order.payment_status === "paid" && !summary.coveredByPayments) {
    const { data: reverted, error: revertError } = await supabase
      .from("orders")
      .update({ payment_status: "pending", updated_at: new Date().toISOString() })
      .eq("id", order.id)
      .eq("payment_status", "paid")
      .select("id")
    if (revertError) {
      logger.error("order-payments.revert_paid_failed", {
        orderId: order.id,
        error: revertError.message,
      })
    } else {
      revertedPaid = (reverted?.length ?? 0) > 0
      if (revertedPaid) {
        // El resumen se recalcula con el estado ya revertido: con
        // `paid` el saldo derivado es cero por la regla de
        // compatibilidad y el llamador leería «sin saldo» de un
        // pedido que acaba de volver a deber todo.
        summary = await getOrderPaymentSummary(supabase, {
          ...order,
          payment_status: "pending",
        })
      }
    }
  }

  return { voided: true, revertedPaid, summary }
}
