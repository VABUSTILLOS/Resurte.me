// ============================================================
// Corte de caja y arqueo: puro, sin DOM y sin base de datos.
//
// Es el módulo que decide **cuánto efectivo debería haber en el cajón** y
// **cuánto falta o sobra**. Todo se calcula en centavos enteros y se devuelve
// en pesos: sumar 0.1 + 0.2 en punto flotante da 0.30000000000000004, y un
// arqueo que no cuadra por un centavo inventa un faltante que nadie cometió.
// ============================================================

import type { FoodosPaymentBreakdown } from "@/types/foodos"

/**
 * El arqueo se compara en centavos enteros, así que no hace falta tolerancia:
 * un centavo de diferencia es una diferencia real y debe verse.
 */
const NO_DIFFERENCE_CENTS = 0

export interface Denomination {  /** Valor en pesos. */
  value: number
  /** Cómo se rotula en el conteo. */
  label: string
  kind: "bill" | "coin"
}

/**
 * Denominaciones vigentes en México, de mayor a menor. El orden importa: es el
 * mismo en el que el cajero cuenta, y así el conteo en pantalla coincide con el
 * que hace con las manos.
 */
export const MXN_DENOMINATIONS: Denomination[] = [
  { value: 1000, label: "$1,000", kind: "bill" },
  { value: 500, label: "$500", kind: "bill" },
  { value: 200, label: "$200", kind: "bill" },
  { value: 100, label: "$100", kind: "bill" },
  { value: 50, label: "$50", kind: "bill" },
  { value: 20, label: "$20", kind: "bill" },
  { value: 10, label: "$10", kind: "coin" },
  { value: 5, label: "$5", kind: "coin" },
  { value: 2, label: "$2", kind: "coin" },
  { value: 1, label: "$1", kind: "coin" },
  { value: 0.5, label: "50¢", kind: "coin" },
]

export function toCents(amount: number): number {
  return Math.round(amount * 100)
}

export function fromCents(cents: number): number {
  return cents / 100
}

/** Conteo por denominación (`{ 500: 3, 20: 12 }`) → total en pesos. */
export function sumDenominations(counts: Record<string | number, number | undefined>): number {
  let cents = 0
  for (const denom of MXN_DENOMINATIONS) {
    const raw = counts[denom.value]
    if (!raw) continue
    // Un conteo negativo no existe y una fracción de billete tampoco: si llega
    // basura del formulario, se ignora en lugar de contaminar el arqueo.
    if (!Number.isFinite(raw) || raw <= 0) continue
    cents += toCents(denom.value) * Math.floor(raw)
  }
  return fromCents(cents)
}

export interface ExpectedCashInput {
  /** Fondo con el que se abrió el turno. */
  openingFloat: number
  /** Ventas cobradas en efectivo dentro del turno. */
  cashSales: number
  /** Entradas de efectivo (fondo extra, cobros ajenos). */
  cashIn: number
  /** Salidas de efectivo (gastos, retiros, retiros a bóveda). */
  cashOut: number
}

/**
 * Efectivo que el sistema espera encontrar en el cajón al cerrar:
 * `fondo + ventas en efectivo + entradas − salidas`.
 */
export function computeExpectedCash(input: ExpectedCashInput): number {
  const cents =
    toCents(input.openingFloat) +
    toCents(input.cashSales) +
    toCents(input.cashIn) -
    toCents(input.cashOut)
  return fromCents(cents)
}

export type ArqueoStatus = "ok" | "short" | "over"

export interface Arqueo {
  expectedCash: number
  declaredCash: number
  /** Declarado − esperado. Negativo es faltante. */
  difference: number
  status: ArqueoStatus
}

export function arqueoStatus(difference: number): ArqueoStatus {
  const cents = toCents(difference)
  if (cents === NO_DIFFERENCE_CENTS) return "ok"
  return cents < 0 ? "short" : "over"
}

export function computeArqueo(input: ExpectedCashInput & { declaredCash: number }): Arqueo {
  const expectedCash = computeExpectedCash(input)
  const difference = fromCents(toCents(input.declaredCash) - toCents(expectedCash))
  return {
    expectedCash,
    declaredCash: input.declaredCash,
    difference,
    status: arqueoStatus(difference),
  }
}

/** Etiqueta corta del estado del arqueo, para la tabla de historial. */
export function arqueoLabel(status: ArqueoStatus): string {
  return status === "ok" ? "Cuadró" : status === "short" ? "Faltante" : "Sobrante"
}

// ------------------------------------------------------------
// Ventas en efectivo del turno
// ------------------------------------------------------------

/**
 * Lo mínimo que necesita una venta para saber cuánto entró en efectivo.
 * Estructural, no nominal: así se puede probar sin fabricar un `FoodosOrder`.
 */
export interface CashSaleLike {
  total: number
  payment_method: string | null
  payment_status: string | null
  payment_breakdown?: FoodosPaymentBreakdown | null
}

/**
 * Cuánto de esta venta entró en efectivo.
 *
 * Con pago combinado manda el desglose: sólo la parte en efectivo llega al
 * cajón. Sin desglose, un pedido cobrado en efectivo entra completo.
 */
export function cashPartOfSale(sale: CashSaleLike): number {
  const parts = sale.payment_breakdown?.parts
  if (parts && parts.length > 0) {
    const cashCents = parts
      .filter((part) => part.method === "cash")
      .reduce((sum, part) => sum + toCents(part.amount), 0)
    return fromCents(cashCents)
  }
  return sale.payment_method === "cash" ? sale.total : 0
}

/**
 * Ventas en efectivo del turno. Sólo cuentan las **pagadas**: un pedido
 * pendiente todavía no puso un peso en el cajón, y contarlo inflaría el
 * esperado hasta hacer aparecer un faltante imaginario.
 */
export function cashSalesFromOrders(orders: CashSaleLike[]): number {
  const cents = orders
    .filter((order) => order.payment_status === "paid")
    .reduce((sum, order) => sum + toCents(cashPartOfSale(order)), 0)
  return fromCents(cents)
}

/**
 * Ventas en efectivo del turno **por método**, para el desglose del corte.
 * Devuelve pesos por método; los métodos sin monto no aparecen.
 */
export function salesByMethod(orders: CashSaleLike[]): Record<string, number> {
  const cents: Record<string, number> = {}
  for (const order of orders) {
    if (order.payment_status !== "paid") continue
    const parts = order.payment_breakdown?.parts
    if (parts && parts.length > 0) {
      for (const part of parts) {
        cents[part.method] = (cents[part.method] ?? 0) + toCents(part.amount)
      }
    } else if (order.payment_method) {
      cents[order.payment_method] = (cents[order.payment_method] ?? 0) + toCents(order.total)
    }
  }
  return Object.fromEntries(
    Object.entries(cents)
      .filter(([, value]) => value !== 0)
      .map(([method, value]) => [method, fromCents(value)]),
  )
}

// ------------------------------------------------------------
// Historial: fila lista para la tabla y el CSV
// ------------------------------------------------------------

export interface ShiftLike {
  id: string
  status: string
  opening_float: number
  opened_at: string
  closed_at: string | null
  declared_cash: number | null
  expected_cash: number | null
  difference: number | null
  notes: string | null
  opened_by: string | null
  closed_by: string | null
  branch_id: string | null
}

export interface ShiftHistoryRow {
  id: string
  status: string
  openedAt: string
  closedAt: string | null
  openingFloat: number
  declaredCash: number | null
  expectedCash: number | null
  difference: number | null
  arqueo: ArqueoStatus | null
  notes: string | null
}

/**
 * Normaliza un turno para mostrarlo. `arqueo` es `null` mientras el turno
 * sigue abierto: decir "Cuadró" en un corte que no ha cerrado sería mentira.
 */
export function shiftHistoryRow(shift: ShiftLike): ShiftHistoryRow {
  const difference = shift.difference
  return {
    id: shift.id,
    status: shift.status,
    openedAt: shift.opened_at,
    closedAt: shift.closed_at,
    openingFloat: shift.opening_float,
    declaredCash: shift.declared_cash,
    expectedCash: shift.expected_cash,
    difference,
    arqueo:
      shift.status === "closed" && typeof difference === "number"
        ? arqueoStatus(difference)
        : null,
    notes: shift.notes,
  }
}

export function shiftHistoryRows(shifts: ShiftLike[]): ShiftHistoryRow[] {
  return shifts.map(shiftHistoryRow)
}

/**
 * CSV del historial de cortes. Se separa de la tabla a propósito: el CSV es el
 * documento que el contador archiva, así que lleva fechas ISO en hora de México
 * y columnas en el mismo orden para todos los turnos.
 */
export function shiftHistoryCsv(rows: ShiftHistoryRow[]): { headers: string[]; rows: (string | number)[][] } {
  const headers = [
    "turno",
    "estado",
    "abierto",
    "cerrado",
    "fondo_inicial",
    "esperado",
    "contado",
    "diferencia",
    "arqueo",
    "notas",
  ]
  return {
    headers,
    rows: rows.map((row) => [
      row.id.slice(0, 8).toUpperCase(),
      row.status === "open" ? "Abierto" : "Cerrado",
      formatShiftDate(row.openedAt),
      row.closedAt ? formatShiftDate(row.closedAt) : "",
      row.openingFloat,
      row.expectedCash ?? "",
      row.declaredCash ?? "",
      row.difference ?? "",
      row.arqueo ? arqueoLabel(row.arqueo) : "",
      row.notes ?? "",
    ]),
  }
}

/**
 * Fecha del corte en hora de Ciudad de México, igual que el folio
 * (`foodos_next_folio`) y el ticket. Un corte de las 23:50 no puede quedar
 * archivado con la fecha del día siguiente.
 */
export function formatShiftDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: "America/Mexico_City",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date)
}
