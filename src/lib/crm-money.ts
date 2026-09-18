/**
 * Previsto contra real: la aritmética del dinero de un prospecto.
 *
 * El CRM tiene dos cifras que no son la misma y hasta ahora solo se veía una, y
 * solo el vendedor:
 *
 *  - **previsto** — lo que el vendedor declaró al crear el prospecto
 *    (`crm_prospects.estimated_value`, migración `00184`). Es una intención.
 *  - **real** — lo que el cliente vinculado ha pagado de verdad, derivado de
 *    `orders` por `crm_prospects.user_id → orders.user_id` (nunca por
 *    `orders.seller_id`: esa columna existe pero ninguna ruta la escribe, así
 *    que usarla daría cero siempre). Es un hecho.
 *
 * La diferencia entre ambas es la métrica útil, y tiene una regla: **solo se
 * calcula cuando las dos existen**. Si falta una, la diferencia es `null` y la
 * superficie dice «Sin comparación» — no `$0`, que afirmaría que se cumplió lo
 * previsto justo cuando no hay con qué saberlo. Es la misma regla que
 * `sumEstimatedValue` y que el embudo: lo no medido no es cero.
 *
 * Este módulo es puro a propósito (sin React, sin `"use server"`, sin formato de
 * moneda): el formato es de `@/lib/money` y el render del componente. Aquí solo
 * vive lo que se puede probar sin montar un componente — y con vitest limitado a
 * `*.test.ts`, lo que no se pueda probar aquí no se prueba.
 */

import { formatMoney, round2 } from "./money"

/** Ingresos reales y pedidos que los sostienen, tal como los devuelve el vínculo. */
export interface ProspectMoneyInput {
  /** `crm_prospects.estimated_value`. `null` = nadie lo declaró. */
  estimatedValue: number | null
  /**
   * Ingresos pagados del cliente vinculado. `null` cuando el prospecto no tiene
   * cuenta vinculada: no es «cero ventas», es «no hay cliente con el que medir».
   */
  actualRevenue: number | null
  /** Comisión estimada sobre los ingresos reales. Misma condición que `actualRevenue`. */
  actualCommission: number | null
  /** Cuántos pedidos pagados sostienen los ingresos reales. */
  paidOrders: number
  /**
   * `true` si el historial no cupo en la ventana de escaneo del vínculo. Los
   * ingresos son entonces un **mínimo** (`≥`) y `paidOrders` un conteo parcial:
   * el pedido 5001 existe y no está sumado.
   */
  revenueTruncated?: boolean
}

/**
 * Signo de la diferencia. `unknown` no es un error: es «falta un lado».
 */
export type MoneyGapTone = "gain" | "loss" | "even" | "unknown"

export interface ProspectMoneyView {
  /** `null` = sin valor declarado. */
  estimated: number | null
  /** `null` = sin cuenta vinculada con la que medir. */
  actual: number | null
  /** `null` = sin cuenta vinculada. */
  commission: number | null
  /** `actual - estimated`, redondeado. `null` si falta cualquiera de los dos. */
  gap: number | null
  gapTone: MoneyGapTone
  /** `true` cuando hay con qué comparar. */
  comparable: boolean
  paidOrders: number
  /** `true` si `actual` es un mínimo porque la ventana de escaneo se quedó corta. */
  revenueTruncated: boolean
}

/** Texto del tono, para que la superficie no reinterprete el signo por su cuenta. */
export const MONEY_GAP_LABEL: Record<MoneyGapTone, string> = {
  gain: "Por encima de lo previsto",
  loss: "Por debajo de lo previsto",
  even: "Justo lo previsto",
  unknown: "Sin comparación",
}

/**
 * Resuelve las dos cifras y su diferencia.
 *
 * Un valor no finito se trata como ausente en los tres campos: es lo que hace
 * que un `NaN` de la base no se propague al render como `NaN` formateado.
 */
export function prospectMoneyView(input: ProspectMoneyInput): ProspectMoneyView {
  const estimated = asMoneyOrNull(input.estimatedValue)
  const actual = asMoneyOrNull(input.actualRevenue)
  const commission = asMoneyOrNull(input.actualCommission)

  const comparable = estimated !== null && actual !== null
  const gap = comparable ? round2(actual - estimated) : null
  const gapTone: MoneyGapTone =
    gap === null ? "unknown" : gap > 0 ? "gain" : gap < 0 ? "loss" : "even"

  return {
    estimated,
    actual,
    commission,
    gap,
    gapTone,
    comparable,
    paidOrders: Number.isFinite(input.paidOrders) ? input.paidOrders : 0,
    revenueTruncated: input.revenueTruncated === true,
  }
}

/**
 * Lee un `NUMERIC` que puede llegar como texto (PostgREST no siempre lo tipa).
 *
 * Un valor ilegible devuelve `null`, no `NaN`: aguas abajo `NaN` se formatea
 * como «NaN» o se pierde en una comparación, y en ambos casos miente. Vive aquí
 * —y no en `crm-core`— porque el único motivo para tolerar texto en un número
 * es que la columna es dinero.
 */
export function asMoneyOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null
  const n = typeof value === "number" ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

/** Un grupo sin ningún valor declarado no vale `$0`: no está valorado. */
export const NO_ESTIMATE_LABEL = "Sin valor declarado"

/**
 * Etiqueta del valor previsto de un grupo de prospectos.
 *
 * Tres estados, no dos: sin datos, medido, y **medido a medias**. El tercero
 * ocurre cuando la consulta se quedó en la ventana de escaneo y se marca con
 * `≥`, porque el total real es al menos ese número. Pintarlo como exacto sería
 * el mismo error que pintar `$0`: afirmar más de lo que se midió.
 */
export function formatEstimatedTotal(
  sum: { total: number | null },
  truncated = false,
): string {
  if (sum.total === null) return NO_ESTIMATE_LABEL
  const amount = formatMoney(sum.total)
  return truncated ? `≥ ${amount}` : amount
}

/**
 * Etiqueta de un importe **medido** que puede quedarse corto.
 *
 * Mismo criterio que `formatEstimatedTotal` y por el mismo motivo, con una
 * diferencia: aquí no existe el estado «sin valor declarado». Un cero medido es
 * un cero y se pinta como cero —es justo el caso útil, «hay cuenta y no pagó»—.
 * Lo único que cambia la lectura es el truncamiento, y lo hace con `≥`.
 */
export function formatMeasuredAmount(amount: number, truncated = false): string {
  const text = formatMoney(amount)
  return truncated ? `≥ ${text}` : text
}

/**
 * Cuántos prospectos del grupo sostienen la suma, para el `title` de la
 * cabecera. Una suma sobre 3 de 12 fichas es correcta y a la vez incompleta, y
 * eso hay que poder leerlo sin abrir la consola.
 */
export function estimatedCoverageLabel(declared: number, groupSize: number): string {
  if (groupSize === 0) return "Sin prospectos"
  if (declared === 0) return `Ninguno de los ${groupSize} prospectos tiene valor declarado`
  if (declared === groupSize) return `Suma de los ${groupSize} prospectos`
  return `Suma de ${declared} de ${groupSize} prospectos valorados`
}
