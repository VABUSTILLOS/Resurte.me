// ============================================================
// Ledger de comisiones — lógica pura
// ============================================================
// Módulo sin dependencias de servidor ni de React: lo importan tanto las
// server actions del admin como el componente cliente de /admin/comisiones.
//
// El ledger vive en Postgres (`commission_periods` / `commission_adjustments`,
// migración 00155). Aquí solo está lo que no necesita la base: el mapeo
// mes ↔ periodo, las validaciones de entrada y el resumen para pantalla.
//
// IMPORTANTE: `amount_due` es una columna GENERADA en la base
// (`round(revenue * rate + adjustments, 2)`). Ese cálculo es la única fuente
// de verdad. `previewAmountDue()` existe solo para mostrar un anticipo antes
// de guardar; nunca debe usarse para pagar ni para conciliar.
// ============================================================

import { DEFAULT_TIMEZONE, localDateParts } from "@/lib/local-date"
import { round2 } from "@/lib/money"

export const COMMISSION_STATUSES = ["devengada", "pagada", "cancelada"] as const
export type CommissionStatus = (typeof COMMISSION_STATUSES)[number]

/** Motivo de un ajuste: mínimo razonable para que quede explicado. */
export const MIN_ADJUSTMENT_REASON = 5
/** Referencia de pago: mínimo razonable para poder rastrear el depósito. */
export const MIN_PAYMENT_REFERENCE = 4

export interface PeriodRange {
  periodStart: string
  periodEnd: string
}

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string }

// El mes admite uno o dos dígitos: `2026-9` se normaliza a `2026-09`.
const MONTH_KEY_RE = /^(\d{4})-(\d{1,2})$/
const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const MONTH_NAMES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
] as const

const pad = (n: number) => String(n).padStart(2, "0")

/** Años aceptados en una clave de mes. Evita basura como `0000-13`. */
const MIN_YEAR = 2000
const MAX_YEAR = 2100

function parseMonthKey(value: unknown): { year: number; month: number } | null {
  if (typeof value !== "string") return null
  const match = MONTH_KEY_RE.exec(value.trim())
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  if (!Number.isInteger(year) || !Number.isInteger(month)) return null
  if (month < 1 || month > 12) return null
  if (year < MIN_YEAR || year > MAX_YEAR) return null
  return { year, month }
}

/** `2026-9` → `"2026-09"`; cualquier cosa inválida → `null`. */
export function normalizeMonthKey(value: unknown): string | null {
  const parsed = parseMonthKey(value)
  if (!parsed) return null
  return `${parsed.year}-${pad(parsed.month)}`
}

/**
 * Primer y último día del mes, como `YYYY-MM-DD`.
 *
 * El último día se deriva de `Date.UTC(año, mes, 0)`, que es el día anterior
 * al primero del mes siguiente: eso respeta febrero bisiesto sin tabla de
 * días por mes. El rango es de días locales (la base lo convierte a
 * timestamptz con la zona del restaurante en `accrue_commission_period`).
 */
export function periodRangeForMonthKey(monthKey: unknown): PeriodRange | null {
  const parsed = parseMonthKey(monthKey)
  if (!parsed) return null
  const lastDay = new Date(Date.UTC(parsed.year, parsed.month, 0)).getUTCDate()
  const key = `${parsed.year}-${pad(parsed.month)}`
  return {
    periodStart: `${key}-01`,
    periodEnd: `${key}-${pad(lastDay)}`,
  }
}

/** `"2026-09-30"` → `"2026-09"`. Fecha malformada → `null`. */
export function monthKeyOfDate(value: unknown): string | null {
  if (typeof value !== "string") return null
  const match = ISO_DATE_RE.exec(value.trim())
  if (!match) return null
  const month = Number(match[2])
  if (month < 1 || month > 12) return null
  return `${match[1]}-${pad(month)}`
}

/** Etiqueta legible del periodo: `"2026-09-01"` → `"Septiembre 2026"`. */
export function formatPeriodLabel(periodStart: string): string {
  const monthKey = monthKeyOfDate(periodStart)
  if (!monthKey) return periodStart
  const year = monthKey.slice(0, 4)
  const month = Number(monthKey.slice(5, 7))
  const name = MONTH_NAMES[month - 1]
  if (!name) return periodStart
  const label = `${name} ${year}`
  return label.charAt(0).toUpperCase() + label.slice(1)
}

/**
 * Los últimos `count` meses como claves `YYYY-MM`, del más reciente al más
 * antiguo, según el día local del restaurante (no UTC).
 */
export function recentMonthKeys(count: number, now: Date = new Date()): string[] {
  const total = Math.max(1, Math.min(60, Math.floor(count)))
  const { year, month } = localDateParts(DEFAULT_TIMEZONE, now)
  const keys: string[] = []
  let y = year
  let m = month
  for (let i = 0; i < total; i += 1) {
    keys.push(`${y}-${pad(m)}`)
    m -= 1
    if (m < 1) {
      m = 12
      y -= 1
    }
  }
  return keys
}

/**
 * Anticipo del monto a pagar. **La base es la autoridad**: esto solo sirve
 * para mostrar el número antes de guardar. Si difieren, gana la base.
 */
export function previewAmountDue(
  revenue: number,
  rate: number,
  adjustments: number
): number {
  return round2(revenue * rate + adjustments)
}

export interface CommissionPeriodLike {
  status: CommissionStatus
  revenue: number
  amountDue: number
}

export interface CommissionSummary {
  devengadaAmount: number
  devengadaCount: number
  pagadaAmount: number
  pagadaCount: number
  canceladaCount: number
  revenueTotal: number
}

/**
 * Totales del ledger para un conjunto de periodos.
 *
 * Los periodos cancelados no suman dinero (quedaron anulados) pero sí se
 * cuentan, para que el total de filas cuadre con lo que se ve en pantalla.
 */
export function summarizePeriods(
  periods: readonly CommissionPeriodLike[]
): CommissionSummary {
  const summary: CommissionSummary = {
    devengadaAmount: 0,
    devengadaCount: 0,
    pagadaAmount: 0,
    pagadaCount: 0,
    canceladaCount: 0,
    revenueTotal: 0,
  }
  for (const period of periods) {
    const amount = Number.isFinite(period.amountDue) ? period.amountDue : 0
    const revenue = Number.isFinite(period.revenue) ? period.revenue : 0
    if (period.status === "devengada") {
      summary.devengadaAmount += amount
      summary.devengadaCount += 1
      summary.revenueTotal += revenue
    } else if (period.status === "pagada") {
      summary.pagadaAmount += amount
      summary.pagadaCount += 1
      summary.revenueTotal += revenue
    } else {
      summary.canceladaCount += 1
    }
  }
  summary.devengadaAmount = round2(summary.devengadaAmount)
  summary.pagadaAmount = round2(summary.pagadaAmount)
  summary.revenueTotal = round2(summary.revenueTotal)
  return summary
}

function parseRate(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null
  const parsed = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(parsed)) return null
  if (parsed < 0 || parsed > 1) return null
  return parsed
}

function parseMoney(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null
  const parsed = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(parsed)) return null
  return round2(parsed)
}

export interface AccrualValue {
  sellerId: string
  periodStart: string
  periodEnd: string
  rate: number
}

/**
 * Valida una solicitud de devengo (`accrue_commission_period`).
 *
 * La tasa es opcional: si no viene se usa la global (`SELLER_COMMISSION_RATE`)
 * más abajo en la action, no aquí, para que este módulo siga siendo puro.
 */
export function validateAccrualInput(input: {
  sellerId: unknown
  monthKey: unknown
  rate?: unknown
}): ValidationResult<Omit<AccrualValue, "rate"> & { rate: number | null }> {
  const sellerId =
    typeof input.sellerId === "string" ? input.sellerId.trim() : ""
  if (!UUID_RE.test(sellerId)) {
    return { ok: false, error: "Elige un vendedor válido" }
  }

  const range = periodRangeForMonthKey(input.monthKey)
  if (!range) {
    return { ok: false, error: "El periodo debe tener el formato AAAA-MM" }
  }

  let rate: number | null = null
  if (input.rate !== undefined && input.rate !== null && input.rate !== "") {
    rate = parseRate(input.rate)
    if (rate === null) {
      return { ok: false, error: "La tasa debe ser un número entre 0 y 1" }
    }
  }

  return { ok: true, value: { sellerId, ...range, rate } }
}

export interface AdjustmentValue {
  amount: number
  reason: string
}

/** Valida un ajuste: monto distinto de cero y motivo explicado. */
export function validateAdjustmentInput(input: {
  amount: unknown
  reason: unknown
}): ValidationResult<AdjustmentValue> {
  const amount = parseMoney(input.amount)
  if (amount === null) {
    return { ok: false, error: "El ajuste debe ser un número" }
  }
  if (amount === 0) {
    return { ok: false, error: "El ajuste no puede ser cero" }
  }

  const reason = typeof input.reason === "string" ? input.reason.trim() : ""
  if (reason.length < MIN_ADJUSTMENT_REASON) {
    return {
      ok: false,
      error: `Explica el ajuste (mínimo ${MIN_ADJUSTMENT_REASON} caracteres)`,
    }
  }

  return { ok: true, value: { amount, reason } }
}

export interface PaymentValue {
  reference: string
  notes: string | null
}

/**
 * Valida un pago. La referencia solo es obligatoria cuando hay algo que
 * pagar: cerrar un periodo en cero no necesita comprobante.
 */
export function validatePaymentInput(
  input: { reference: unknown; notes?: unknown },
  amountDue: number
): ValidationResult<PaymentValue> {
  const reference =
    typeof input.reference === "string" ? input.reference.trim() : ""

  if (amountDue > 0 && reference.length < MIN_PAYMENT_REFERENCE) {
    return {
      ok: false,
      error: `Registra la referencia del pago (mínimo ${MIN_PAYMENT_REFERENCE} caracteres)`,
    }
  }

  const rawNotes = typeof input.notes === "string" ? input.notes.trim() : ""
  return {
    ok: true,
    value: { reference, notes: rawNotes.length > 0 ? rawNotes : null },
  }
}

export interface CancellationValue {
  reason: string
}

/** Valida una cancelación: el motivo es obligatorio. */
export function validateCancellationInput(input: {
  reason: unknown
}): ValidationResult<CancellationValue> {
  const reason = typeof input.reason === "string" ? input.reason.trim() : ""
  if (reason.length < MIN_ADJUSTMENT_REASON) {
    return {
      ok: false,
      error: `Explica por qué cancelas el periodo (mínimo ${MIN_ADJUSTMENT_REASON} caracteres)`,
    }
  }
  return { ok: true, value: { reason } }
}

/** Normaliza el estado que devuelve la base; desconocido → `null`. */
export function parseCommissionStatus(value: unknown): CommissionStatus | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return (COMMISSION_STATUSES as readonly string[]).includes(trimmed)
    ? (trimmed as CommissionStatus)
    : null
}
