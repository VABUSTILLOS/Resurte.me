/**
 * Shared money/math helpers (dependency-free, unit-testable).
 *
 * Centralizes the money rounding, discount and es-MX currency/number
 * formatting previously duplicated across the checkout, foodos and
 * comercializacion modules.
 */

/** Redondea a 2 decimales (regla estándar del checkout). */
export function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** Precio con descuento aplicado: `basePrice * (1 - discountPct)`, redondeado. */
export function applyDiscount(basePrice: number, discountPct: number): number {
  return round2(basePrice * (1 - discountPct))
}

/**
 * Formatea un monto como moneda es-MX.
 *
 * Comportamiento por defecto (idéntico al histórico de `foodos.ts`):
 * montos enteros sin decimales (`$100`), montos fraccionarios con 2
 * decimales (`$100.50`). Pasa `opts` para forzar decimales fijos — e.g.
 * `{ minDecimals: 2, maxDecimals: 2 }` reproduce el formato de
 * `comercializacion/commissions.ts` (`$100.00`).
 */
export function formatMoney(
  amount: number,
  currency = "MXN",
  opts?: { minDecimals?: number; maxDecimals?: number },
): string {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency,
    minimumFractionDigits: opts?.minDecimals ?? (amount % 1 === 0 ? 0 : 2),
    maximumFractionDigits: opts?.maxDecimals ?? 2,
  }).format(amount)
}

/** Número con separadores de miles es-MX (mismo output que `toLocaleString("es-MX")`). */
export function formatNumber(n: number): string {
  return n.toLocaleString("es-MX")
}
