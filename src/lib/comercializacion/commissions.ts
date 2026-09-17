/**
 * Tasa de comisión del vendedor y formato de dinero de la pantalla.
 *
 * La tasa se configura vía la env var SELLER_COMMISSION_RATE (ej: "0.05" =
 * 5%). Aquí solo se lee: el cálculo y el pago viven en el ledger de 00155
 * (`commission_periods` + `accrue_commission_period`), que congela la tasa en
 * el primer devengo y guarda el estado de cada periodo.
 *
 * Por eso esta constante es la tasa *vigente*, no la de un periodo ya
 * devengado: para saber cuánto se pagó hay que leer el periodo, no
 * recalcularlo. La única excepción es la estimación de «pendientes de
 * devengar» en /admin/comisiones, que es explícitamente una previsión.
 */
import { formatMoney as sharedFormatMoney } from "@/lib/money"

export function getCommissionRate(): number {
  const raw = process.env.SELLER_COMMISSION_RATE
  if (!raw) return 0.05
  const parsed = Number(raw)
  if (Number.isNaN(parsed) || parsed < 0) return 0.05
  return parsed
}

export function formatMoney(n: number): string {
  // Decimales fijos (2) — mismo output que el formato histórico de este módulo.
  return sharedFormatMoney(n, "MXN", { minDecimals: 2, maxDecimals: 2 })
}
