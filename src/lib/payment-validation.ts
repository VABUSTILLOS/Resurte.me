/**
 * Validación de montos y lógica de cashback — funciones PURAS (sin I/O).
 *
 * Concentra la lógica de dinero que hoy vive duplicada entre la webhook de
 * Stripe, createPaymentIntentForOrder y el trigger SQL de cashback, para
 * poder testearla unitariamente y mantener una única fuente de verdad.
 */

import type { CashbackTier } from "@/types"

/** Convierte un total en pesos a centavos para Stripe. */
export function toCents(total: number | string | null | undefined): number {
  return Math.round(Number(total ?? 0) * 100)
}

/**
 * Valida que el monto recibido por Stripe cubra el total esperado del pedido.
 * Usa >= para tolerar propinas o ajustes menores (nunca menos del total).
 *
 * Fail-closed: si el total esperado falta o no es positivo, rechaza — nunca
 * aprueba un pago sin referencia de monto válida.
 */
export function isAmountSufficient(
  amountReceivedCents: number,
  expectedTotal: number | string | null | undefined
): boolean {
  const expectedCents = toCents(expectedTotal)
  if (expectedCents <= 0) return false
  return amountReceivedCents >= expectedCents
}

export interface CashbackTierResult {
  name: CashbackTier
  /** Porcentaje como fracción (0.05 = 5%). */
  pct: number
}

/**
 * Determina el nivel de cashback a partir de las semanas calificadas del mes.
 *
 * Espejo de la lógica del trigger SQL credit_cashback_on_payment (migración
 * 00029/00036). Mantener AMBOS sincronizados.
 *
 * Regla:
 *  - 0–1 semanas calificadas → Verde  (5%)
 *  - 2 semanas                → Plata  (10%)
 *  - 3 semanas                → Oro    (15%)
 *  - 4+ semanas               → Diamante (20%)
 */
export function getCashbackTier(qualifyingWeeks: number): CashbackTierResult {
  if (qualifyingWeeks <= 1) {
    return { name: "Verde", pct: 0.05 }
  }
  if (qualifyingWeeks === 2) {
    return { name: "Plata", pct: 0.1 }
  }
  if (qualifyingWeeks === 3) {
    return { name: "Oro", pct: 0.15 }
  }
  return { name: "Diamante", pct: 0.2 }
}

/**
 * Calcula el monto de cashback redondeado a 2 decimales (misma regla que el
 * ROUND(...) del trigger SQL).
 */
export function calculateCashbackAmount(
  orderTotal: number,
  qualifyingWeeks: number
): number {
  const { pct } = getCashbackTier(qualifyingWeeks)
  return Math.round(orderTotal * pct * 100) / 100
}
