// Shared types and constants for the ventas panel.
// Both the page and the extracted section components import from here so the
// prop contracts stay in sync. No logic changes — mechanical extraction only.

export interface SaleEntry {
  id: string
  dishId: string
  dishName: string
  quantity: number
  date: string // YYYY-MM-DD
  unitPrice: number
  unitCost: number
  paymentMethod?: PaymentMethod
  channel?: SaleChannel
  discount?: { type: "monto" | "porcentaje"; value: number }
  clienteId?: string
  mesaId?: string
  modificadores?: { nombre: string; precio: number }[]
  createdAt?: string // ISO timestamp, set on addEntry
  stockDeducted?: boolean // true si la venta descontó insumos del inventario (para revertir al borrar)
}

export interface Cliente {
  id: string
  nombre: string
  telefono?: string
  puntos: number
  visitas: number
  totalGastado: number
  createdAt: string
}

export interface Mesa {
  id: string
  nombre: string
  capacidad: number
  zona?: string
}

export interface Empleado {
  id: string
  nombre: string
  rol?: string
  tarifa: number
}

export interface Fichaje {
  id: string
  empleadoId: string
  entrada: string // ISO timestamp
  salida?: string // ISO timestamp
}

export interface TarjetaRegalo {
  id: string
  codigo: string
  monto: number
  saldo: number
  estado: "activa" | "agotada"
  creada: string
}

export const PAYMENT_METHODS = [
  { key: "efectivo", label: "Efectivo", icon: "💵" },
  { key: "tarjeta", label: "Tarjeta", icon: "💳" },
  { key: "transferencia", label: "Transferencia", icon: "🏦" },
  { key: "regalo", label: "Regalo", icon: "🎁" },
] as const

export type PaymentMethod = (typeof PAYMENT_METHODS)[number]["key"]

export const SALE_CHANNELS = [
  { key: "comedor", label: "Comedor", icon: "🍽️" },
  { key: "rapido", label: "Rápido", icon: "⚡" },
  { key: "para-llevar", label: "Para llevar", icon: "🥡" },
  { key: "domicilio", label: "Domicilio", icon: "🛵" },
] as const

export type SaleChannel = (typeof SALE_CHANNELS)[number]["key"]

/**
 * Campos mínimos para totalizar una venta. `SaleEntry` y el `HubVenta` del hub
 * encajan aquí, así que ambos comparten un único cálculo en vez de mantener dos
 * copias que se desincronizan.
 */
export interface TotalsEntry {
  date: string
  quantity: number
  unitPrice: number
  discount?: { type: "monto" | "porcentaje"; value: number }
}

/** Total de una venta de mostrador, nunca negativo. Fuente única. */
export function entryTotal(e: TotalsEntry): number {
  let total = e.quantity * e.unitPrice
  if (e.discount) {
    total -= e.discount.type === "porcentaje" ? (total * e.discount.value) / 100 : e.discount.value
  }
  return Math.max(0, total)
}

export interface CounterSummary {
  count: number
  revenue: number
}

/**
 * Ventas de mostrador de un día (`YYYY-MM-DD`). Fuente única del "mostrador de
 * hoy" que comparten /panel/ventas y el hub: antes cada superficie filtraba y
 * sumaba por su cuenta.
 */
export function counterSummary(
  entries: readonly TotalsEntry[],
  day: string
): CounterSummary {
  if (!day) return { count: 0, revenue: 0 }
  let count = 0
  let revenue = 0
  for (const e of entries) {
    if (!e.date.startsWith(day)) continue
    count += 1
    revenue += entryTotal(e)
  }
  return { count, revenue }
}

// ── Derived stat shapes (memoized values passed as props) ──
export interface DayStats {
  revenue: number
  cost: number
  margin: number
  units: number
  orders: number
  foodCost: number
  avgTicket: number
  discount: number
}

export interface ReportStats {
  revenue: number
  cost: number
  margin: number
  units: number
  orders: number
  discount: number
  foodCost: number
  avgTicket: number
}

export interface TopSeller {
  name: string
  qty: number
  revenue: number
}

export interface MethodRow {
  key: PaymentMethod
  label: string
  icon: string
  revenue: number
  count: number
}

export interface ReportMethodRow {
  key: PaymentMethod
  label: string
  icon: string
  revenue: number
}

export interface ReportChannelRow {
  key: SaleChannel
  label: string
  icon: string
  revenue: number
}

export interface WeekTrend {
  days: { label: string; revenue: number; cost: number }[]
  max: number
}

export interface FraudAlert {
  entryId: string
  dishName: string
  reason: string
}

interface ComparisonPeriod {
  revenue: number
  orders: number
  avgTicket: number
}

export interface Comparison {
  cur: ComparisonPeriod
  prev: ComparisonPeriod
  revenueDelta: number
  ordersDelta: number
  avgDelta: number
}

interface FichajeRow {
  nombre: string
  rol?: string
  tarifa: number
  minutos: number
  fichajes: number
  abierto: boolean
}

export interface FichajesHoy {
  rows: FichajeRow[]
  totalMin: number
  totalCosto: number
}

export interface EmpleadoHoy extends Empleado {
  minutos: number
  abierto: boolean
  fichajesHoy: number
}

export interface AllTimeStats {
  revenue: number
  cost: number
  margin: number
  foodCost: number
  count: number
}
