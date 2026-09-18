/**
 * Regla única del reembolso: cuánto queda reembolsable y a qué estado pasa el
 * pedido.
 *
 * Vive aparte porque la aplican **dos** caminos y tienen que coincidir:
 *
 *  - `POST /api/admin/orders/[id]/refund` — el reembolso que inicia el admin
 *    desde el panel, con el importe que Stripe devuelve al crearlo.
 *  - `handleChargeRefunded` — el webhook, que reconcilia cualquier reembolso,
 *    incluido el que alguien haga a mano desde el Dashboard de Stripe.
 *
 * El webhook no puede limitarse a marcar `refunded`: un reembolso parcial de
 * $50 sobre un pedido de $800 marcado como `refunded` no es sólo impreciso, es
 * destructivo. `refunded` se lee en todo el esquema como "este cobro ya no
 * existe" — el trigger `reverse_cashback_on_cancel()` (00135) devuelve el
 * cashback completo al monedero y `reversible_payment_confirmation` (00146) lo
 * trata como reversión total. El cliente pagó $750 de esos $800; su cashback
 * no tiene por qué desaparecer.
 *
 * Funciones puras y sin I/O: se prueban sin Stripe ni Supabase.
 */

/** Estados desde los que todavía se puede reembolsar. */
export const REFUNDABLE_PAYMENT_STATUSES = ["paid", "partially_refunded"] as const

export type RefundablePaymentStatus = (typeof REFUNDABLE_PAYMENT_STATUSES)[number]

export function isRefundableStatus(status: string): status is RefundablePaymentStatus {
  return (REFUNDABLE_PAYMENT_STATUSES as readonly string[]).includes(status)
}

export interface RefundOutcome {
  /** `refunded` sólo cuando ya no queda nada por devolver. */
  status: "refunded" | "partially_refunded"
  /** Centavos reembolsados acumulados tras aplicar este reembolso. */
  refundedAmountCents: number
}

/**
 * Aplica un reembolso (parcial o total) sobre lo ya reembolsado.
 *
 * `totalCents` es lo cobrado, no `orders.total`: el pedido puede haberse
 * creado con un total distinto del que Stripe acabó cobrando (propina añadida
 * después, cupón aplicado en el PaymentIntent). Comparar contra el importe
 * realmente cobrado es lo único que evita declarar "total" un reembolso que
 * dejó dinero sin devolver.
 *
 * Los acumulados se **saturan** en `totalCents` en lugar de sumar sin límite:
 * Stripe puede reenviar el mismo `charge.refunded` y `amount_refunded` es
 * acumulativo, así que la entrada ya viene completa; sumarle otra vez el
 * importe del evento inflaría la cifra sin que nadie lo note.
 */
export function resolveRefundOutcome(params: {
  totalCents: number
  alreadyRefundedCents?: number | null
  refundAmountCents: number
}): RefundOutcome {
  const total = Math.max(0, Math.trunc(params.totalCents))
  const already = Math.max(0, Math.trunc(params.alreadyRefundedCents ?? 0))
  const applied = Math.max(0, Math.trunc(params.refundAmountCents))
  const accumulated = Math.min(total, already + applied)

  return {
    status: total > 0 && accumulated >= total ? "refunded" : "partially_refunded",
    refundedAmountCents: accumulated,
  }
}

/**
 * Cuánto se puede reembolsar todavía. Devuelve 0 cuando no queda nada.
 */
export function refundableCents(
  totalCents: number,
  alreadyRefundedCents?: number | null
): number {
  const total = Math.max(0, Math.trunc(totalCents))
  const already = Math.max(0, Math.trunc(alreadyRefundedCents ?? 0))
  return Math.max(0, total - already)
}
