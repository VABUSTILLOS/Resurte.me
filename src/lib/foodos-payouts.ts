// ============================================================
// Dispersiones FoodOS — lógica pura
// ============================================================
// Módulo sin dependencias de servidor ni de React: lo importan la server
// action del admin, la ruta de API y el componente cliente.
//
// CONTEXTO (decisión C.2 del plan de mejoras)
//
// `STRIPE_CONNECT_ENABLED` no existe en producción. Por eso
// `buildDestinationChargeParams()` devuelve `{}`, el cargo se hace contra la
// cuenta de Resurte.me y **el 100 % del dinero con tarjeta de FoodOS queda en
// custodia de la plataforma**, con `DEFAULT_PLATFORM_FEE_PERCENT = 0`. Ese
// dinero había que dispersarlo a mano sin ninguna forma de registrar que ya se
// hizo: la obligación no era calculable, no era liquidable y la comisión
// retenida no quedaba en ningún lado.
//
// La migración 00157 cerró eso con `foodos_payouts` (libro append-only) y
// `foodos_payout_balances()`. **El saldo pendiente lo calcula la base**:
//
//     outstanding = cobrado_en_custodia − dispersado − comisión_retenida
//
// donde `cobrado_en_custodia` son los pedidos pagados con
// `connected_account_id IS NULL`. Ese cálculo vive en un solo lugar para que la
// pantalla, el CSV y cualquier reporte no puedan divergir.
//
// Este módulo NO recalcula el saldo. Solo valida la entrada del formulario y
// resume lo que la base ya respondió.
// ============================================================

import { formatMoney, round2 } from "@/lib/money"
import type { FoodosConnectState } from "@/types/foodos"

/** Comprobante de la transferencia: mínimo para poder rastrearla. */
export const MIN_PAYOUT_REFERENCE = 4
/** Motivo de una dispersión negativa: mínimo para que quede explicada. */
export const MIN_PAYOUT_NOTE = 5
/** Tope de `NUMERIC(14,2)`. Se valida aquí para no depender del error de la base. */
export const MAX_PAYOUT_AMOUNT = 999_999_999_999.99

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string }

/** Una fila de `foodos_payout_balances()` — la única definición del saldo. */
export interface PayoutBalanceRow {
  restaurantId: string
  restaurantName: string
  restaurantSlug: string
  platformFeePercent: number
  stripeAccountId: string | null
  connectChargeable: boolean
  grossCollected: number
  custodyOrderCount: number
  settledTotal: number
  feeTotal: number
  outstanding: number
  payoutCount: number
  lastPayoutAt: string | null
}

/** Una fila de `foodos_payouts`. */
export interface PayoutRow {
  id: number
  restaurantId: string
  periodStart: string | null
  periodEnd: string | null
  settledAmount: number
  feeAmount: number
  reference: string
  notes: string | null
  paidAt: string
}

export interface PayoutSummary {
  restaurants: number
  /** Restaurantes con saldo pendiente a favor. */
  owed: number
  /** Suma de lo pendiente de dispersar. */
  outstanding: number
  /** Suma de lo cobrado en custodia (histórico). */
  grossCollected: number
  settledTotal: number
  feeTotal: number
  /** Restaurantes con saldo negativo: se les dispersó de más. */
  overpaid: number
  overpaidAmount: number
  /** Cuentas Connect listas para cobrar en su propio nombre. */
  chargeableRestaurants: number
}

export interface PayoutValue {
  restaurantId: string
  periodStart: string | null
  periodEnd: string | null
  settledAmount: number
  feeAmount: number
  reference: string
  notes: string | null
}

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const MIN_YEAR = 2000
const MAX_YEAR = 2100

const MONTH_SHORT = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
] as const

/**
 * Valida una fecha ISO y su calendario real.
 *
 * `ISO_DATE_RE` sola acepta `2026-02-30`; la reconstrucción con `Date.UTC`
 * rueda al 2 de marzo y delata el imposible. Es un validador de formato, no un
 * día de negocio: no recorta ningún instante, así que no aplica el contrato de
 * `@/lib/local-date` (por eso no usa `toISOString`).
 */
export function parseIsoDate(raw: unknown): string | null {
  if (typeof raw !== "string") return null
  const match = ISO_DATE_RE.exec(raw.trim())
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) return null
  if (month < 1 || month > 12) return null
  if (day < 1 || day > 31) return null
  const probe = new Date(Date.UTC(year, month - 1, day))
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null
  }
  return `${match[1]}-${match[2]}-${match[3]}`
}

function humanDate(iso: string): string {
  const match = ISO_DATE_RE.exec(iso)
  if (!match) return iso
  const month = MONTH_SHORT[Number(match[2]) - 1] ?? "?"
  return `${Number(match[3])} ${month} ${match[1]}`
}

/**
 * Etiqueta legible del periodo dispersado.
 *
 * El periodo es opcional (se puede dispersar a cuenta sin declarar rango), así
 * que los huecos tienen nombre propio en vez de imprimirse vacíos.
 */
export function formatPayoutPeriodLabel(
  periodStart: string | null,
  periodEnd: string | null
): string {
  const start = parseIsoDate(periodStart)
  const end = parseIsoDate(periodEnd)
  if (!start && !end) return "Sin periodo declarado"
  if (start && !end) return `Desde el ${humanDate(start)}`
  if (!start && end) return `Hasta el ${humanDate(end)}`
  if (!start || !end) return "Sin periodo declarado"

  const sameMonth = start.slice(0, 7) === end.slice(0, 7)
  if (sameMonth) {
    const day = Number(ISO_DATE_RE.exec(start)?.[3] ?? "0")
    return `${day} al ${humanDate(end)}`
  }
  const sameYear = start.slice(0, 4) === end.slice(0, 4)
  if (sameYear) {
    const month = MONTH_SHORT[Number(start.slice(5, 7)) - 1] ?? "?"
    return `${Number(start.slice(8, 10))} ${month} al ${humanDate(end)}`
  }
  return `${humanDate(start)} al ${humanDate(end)}`
}

/**
 * Lee un monto escrito por una persona.
 *
 * Acepta `1234.5`, `$1,234.50` y `1.234,50`. La coma es ambigua en es-MX
 * (miles o decimales), así que solo se trata como decimal cuando va sola y con
 * uno o dos dígitos detrás; en cualquier otro caso se asume separador de miles.
 */
export function parseAmountInput(raw: unknown): number | null {
  if (typeof raw === "number") {
    return Number.isFinite(raw) ? round2(raw) : null
  }
  if (typeof raw !== "string") return null

  let text = raw.trim().replace(/[$MXN\s]/gi, "")
  if (text.length === 0) return null

  const negative = text.startsWith("-")
  if (negative || text.startsWith("+")) text = text.slice(1)

  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(text)) {
    text = text.replace(/,/g, "")
  } else if (/^\d+,\d{1,2}$/.test(text)) {
    text = text.replace(",", ".")
  } else {
    text = text.replace(/,/g, "")
  }

  if (!/^\d+(\.\d+)?$/.test(text)) return null
  const value = Number(text)
  if (!Number.isFinite(value)) return null
  return round2(negative ? -value : value)
}

/**
 * Valida el alta de una dispersión.
 *
 * Reproduce en el cliente las mismas reglas que `record_foodos_payout`, con
 * los mismos mensajes: así el error que ve el admin no depende de quién
 * contestó primero. La base sigue siendo la autoridad —esta función no conoce
 * el saldo pendiente, que solo ella calcula.
 */
export function validatePayoutInput(input: {
  restaurantId: unknown
  periodStart?: unknown
  periodEnd?: unknown
  settledAmount: unknown
  feeAmount?: unknown
  reference: unknown
  notes?: unknown
}): ValidationResult<PayoutValue> {
  const restaurantId = typeof input.restaurantId === "string" ? input.restaurantId.trim() : ""
  if (!UUID_RE.test(restaurantId)) {
    return { ok: false, error: "Restaurante inválido" }
  }

  const rawStart = input.periodStart
  const rawEnd = input.periodEnd
  const hasStart = typeof rawStart === "string" && rawStart.trim().length > 0
  const hasEnd = typeof rawEnd === "string" && rawEnd.trim().length > 0
  const periodStart = hasStart ? parseIsoDate(rawStart) : null
  const periodEnd = hasEnd ? parseIsoDate(rawEnd) : null
  if (hasStart && !periodStart) return { ok: false, error: "Fecha inicial inválida" }
  if (hasEnd && !periodEnd) return { ok: false, error: "Fecha final inválida" }
  if (periodStart && periodEnd && periodEnd < periodStart) {
    return { ok: false, error: "El fin del periodo no puede ser anterior al inicio" }
  }

  const settledAmount = parseAmountInput(input.settledAmount)
  if (settledAmount === null) {
    return { ok: false, error: "El monto de la dispersión no es un número válido" }
  }
  if (settledAmount === 0) {
    return { ok: false, error: "El monto de la dispersión no puede ser cero" }
  }
  if (Math.abs(settledAmount) > MAX_PAYOUT_AMOUNT) {
    return { ok: false, error: "El monto de la dispersión es demasiado grande" }
  }

  const feeAmount = parseAmountInput(input.feeAmount ?? 0)
  if (feeAmount === null) {
    return { ok: false, error: "La comisión retenida no es un número válido" }
  }
  if (feeAmount < 0) {
    return { ok: false, error: "La comisión retenida no puede ser negativa" }
  }
  if (feeAmount > MAX_PAYOUT_AMOUNT) {
    return { ok: false, error: "La comisión retenida es demasiado grande" }
  }

  const reference = typeof input.reference === "string" ? input.reference.trim() : ""
  if (reference.length < MIN_PAYOUT_REFERENCE) {
    return {
      ok: false,
      error: `La dispersión exige un comprobante de al menos ${MIN_PAYOUT_REFERENCE} caracteres`,
    }
  }

  const rawNotes = typeof input.notes === "string" ? input.notes.trim() : ""
  if (settledAmount < 0 && rawNotes.length < MIN_PAYOUT_NOTE) {
    return {
      ok: false,
      error: `Una dispersión negativa exige explicar por qué (mínimo ${MIN_PAYOUT_NOTE} caracteres)`,
    }
  }

  return {
    ok: true,
    value: {
      restaurantId,
      periodStart,
      periodEnd,
      settledAmount,
      feeAmount,
      reference,
      notes: rawNotes.length > 0 ? rawNotes : null,
    },
  }
}

/** Totales de la pantalla. Suma lo que la base ya calculó; no lo recalcula. */
export function summarizePayoutBalances(rows: readonly PayoutBalanceRow[]): PayoutSummary {
  let outstanding = 0
  let grossCollected = 0
  let settledTotal = 0
  let feeTotal = 0
  let owed = 0
  let overpaid = 0
  let overpaidAmount = 0
  let chargeableRestaurants = 0

  for (const row of rows) {
    outstanding += row.outstanding
    grossCollected += row.grossCollected
    settledTotal += row.settledTotal
    feeTotal += row.feeTotal
    if (row.outstanding > 0) owed += 1
    if (row.outstanding < 0) {
      overpaid += 1
      overpaidAmount += row.outstanding
    }
    if (row.connectChargeable) chargeableRestaurants += 1
  }

  return {
    restaurants: rows.length,
    owed,
    outstanding: round2(outstanding),
    grossCollected: round2(grossCollected),
    settledTotal: round2(settledTotal),
    feeTotal: round2(feeTotal),
    overpaid,
    overpaidAmount: round2(overpaidAmount),
    chargeableRestaurants,
  }
}

/**
 * Quién cobra el dinero de un restaurante.
 *
 * Son dos ejes independientes y confundirlos fue el punto medio que C.2
 * mandó cerrar: una cuenta Connect puede estar `active` y aun así recibir cero,
 * porque el enrutado depende de `STRIPE_CONNECT_ENABLED`. Por eso el estado de
 * custodia no se deriva del estado de la cuenta solo.
 */
export type CustodyMode = "direct" | "onboarding" | "platform"

export function custodyMode(
  state: FoodosConnectState,
  routingEnabled: boolean
): CustodyMode {
  if (!routingEnabled) return "platform"
  return state === "active" ? "direct" : "onboarding"
}

export const CUSTODY_LABEL: Record<CustodyMode, string> = {
  direct: "Cobro directo",
  onboarding: "Custodia · onboarding",
  platform: "Custodia · plataforma",
}

export const CUSTODY_TONE: Record<CustodyMode, string> = {
  direct: "bg-emerald-50 text-emerald-700",
  onboarding: "bg-amber-50 text-amber-700",
  platform: "bg-sky-50 text-sky-700",
}

export const CUSTODY_HELP: Record<CustodyMode, string> = {
  direct: "Stripe cobra en la cuenta del restaurante: no hay nada que dispersar.",
  onboarding:
    "Connect está encendido pero esta cuenta todavía no cobra; su dinero cae en Resurte.me.",
  platform:
    "Connect está apagado: el 100 % del dinero con tarjeta cae en Resurte.me y se dispersa a mano.",
}

/** Estado de la cuenta Connect, en palabras. */
export const CONNECT_STATE_LABEL: Record<FoodosConnectState, string> = {
  not_connected: "Sin cuenta Stripe",
  pending: "Onboarding a medias",
  restricted: "Cuenta restringida",
  active: "Cuenta lista",
}

/** Monto con dos decimales fijos: los saldos se concilian contra el banco. */
export function formatPayoutAmount(amount: number): string {
  return formatMoney(amount, "MXN", { minDecimals: 2, maxDecimals: 2 })
}

/** `$1,234.50 (pendiente)` — el signo importa: negativo es dinero de más. */
export function formatOutstanding(amount: number): string {
  const formatted = formatPayoutAmount(amount)
  if (amount > 0) return formatted
  if (amount < 0) return `${formatted} dispersado de más`
  return `${formatted} — al día`
}
