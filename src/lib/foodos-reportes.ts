/**
 * Reportes del punto de venta: tablero, cierre diario y desglose por turno.
 *
 * Módulo puro a propósito. El tablero lo consumía todo dentro del componente
 * React, y ahí es imposible probar la regla que más se equivoca en un POS:
 * **los ingresos se cuentan por `payment_status = "paid"`, nunca por número de
 * filas**. Una mesa abierta deja una fila por cada envío a cocina (comandas
 * operativas que nunca se cobran) y una fila final al cerrar la cuenta; sumar
 * filas infla las ventas del día con dinero que no existe.
 */

import { dayKeyOf, DEFAULT_TIMEZONE } from "@/lib/local-date"
import type { FoodosOrder, FoodosOrderChannel } from "@/types/foodos"
import { cashPartOfSale, fromCents, toCents } from "./foodos-cash"

const DAY_MS = 86_400_000

/** Bucket de las ventas que no pasaron por caja (web, QR, marketplace). */
export const NO_SHIFT = "sin_turno"

/** Bucket de los pedidos sin sucursal asignada. */
export const NO_BRANCH = "sin_sucursal"

/**
 * Orden canónico de los canales. Es el orden en el que se pintan las barras,
 * y va de lo más digital a lo más presencial para que el dueño lea de un
 * vistazo cuánto de su venta ya no depende del salón.
 */
export const FOODOS_REPORT_CHANNELS: FoodosOrderChannel[] = [
  "web",
  "qr",
  "whatsapp",
  "marketplace",
  "mostrador",
  "mesero",
]

/**
 * Etiquetas de canal. `mesero` dice "Mesa" y no "Mesero" porque lo que el
 * dueño quiere distinguir es el servicio en mesa, no quién lo levantó.
 */
export const CHANNEL_LABELS: Record<FoodosOrderChannel, string> = {
  web: "Web",
  qr: "QR",
  whatsapp: "WhatsApp",
  marketplace: "HoyQueComemos",
  mostrador: "Mostrador",
  mesero: "Mesa",
}

/** Etiqueta de un canal desconocido: el canal tal cual, nunca un hueco. */
export function channelLabel(channel: string): string {
  return CHANNEL_LABELS[channel as FoodosOrderChannel] ?? channel
}

/** True si el pedido ya puso dinero. Es la única fuente de ingresos. */
export function isPaidOrder(order: Pick<FoodosOrder, "payment_status">): boolean {
  return order.payment_status === "paid"
}

/**
 * Turno al que se cargó el pedido. Los pedidos que no pasaron por caja no
 * tienen turno, y se agrupan aparte para que el arqueo no los reclame.
 */
export function orderShiftKey(order: Pick<FoodosOrder, "pos_shift_id">): string {
  return order.pos_shift_id ?? NO_SHIFT
}

export interface ReportFilters {
  /** Ventana en días hacia atrás desde `now`. */
  days: number
  /** Sucursal seleccionada; `null` = todas. */
  branchId?: string | null
  /** Turno seleccionado (`NO_SHIFT` incluido); `null` = todos. */
  shiftId?: string | null
}

/**
 * Pedidos que entran al reporte: no cancelados, dentro de la ventana y que
 * pasan los filtros de sucursal y turno. Los cancelados se excluyen siempre:
 * un pedido cancelado no vendió nada aunque haya llegado a `paid` por error
 * de captura, y el reporte no es el lugar para reconciliar eso.
 */
export function filterReportOrders(
  orders: FoodosOrder[],
  filters: ReportFilters,
  now: number
): FoodosOrder[] {
  const cutoff = now - filters.days * DAY_MS
  const branchId = filters.branchId ?? null
  const shiftId = filters.shiftId ?? null
  return orders.filter((order) => {
    if (order.status === "cancelled") return false
    const at = new Date(order.created_at).getTime()
    if (Number.isNaN(at) || at < cutoff) return false
    if (branchId && order.branch_id !== branchId) return false
    if (shiftId && orderShiftKey(order) !== shiftId) return false
    return true
  })
}

export interface DayBucket {
  key: string
  label: string
  count: number
  revenue: number
}

export interface ChannelBucket {
  channel: string
  label: string
  count: number
  revenue: number
  /** Porcentaje de pedidos sobre el total del periodo (0–100). */
  share: number
}

export interface ShiftBucket {
  shiftId: string
  count: number
  revenue: number
  /** Ventas en efectivo del turno, para cuadrar contra el arqueo. */
  cash: number
}

/** Sucursal: cuántos pedidos y cuánto dinero. El conteo solo no dice nada. */
export interface BranchBucket {
  /** `NO_BRANCH` cuando el pedido no tiene sucursal asignada. */
  branchId: string
  count: number
  revenue: number
}

export interface TopItem {
  itemId: string
  name: string
  qty: number
  revenue: number
}

export interface FoodosReport {
  orderCount: number
  paidCount: number
  pendingCount: number
  revenue: number
  avgTicket: number
  tips: number
  discounts: number
  byDay: DayBucket[]
  byChannel: ChannelBucket[]
  byShift: ShiftBucket[]
  byBranch: BranchBucket[]
  topItems: TopItem[]
  comboRevenue: number
  comboShare: number
}

/**
 * Etiqueta corta del día en la zona del restaurante. Se deriva de la llave
 * `YYYY-MM-DD` y no del instante original: un pedido de las 23:50 en México es
 * el día siguiente en UTC, y el tablero no puede rotular la barra con el día
 * equivocado.
 */
export function dayBucketLabel(key: string): string {
  const [year, month, day] = key.split("-").map(Number)
  if (!year || !month || !day) return key
  // Mediodía UTC del día pedido cae dentro del mismo día en México (UTC-6).
  const date = new Date(Date.UTC(year, month - 1, day, 18))
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: DEFAULT_TIMEZONE,
    weekday: "short",
  }).format(date)
}

/** Llaves `YYYY-MM-DD` de los últimos `days` días, del más viejo al más nuevo. */
export function reportDayKeys(days: number, now: number, timezone = DEFAULT_TIMEZONE): string[] {
  const keys: string[] = []
  for (let i = days - 1; i >= 0; i--) {
    keys.push(dayKeyOf(timezone, new Date(now - i * DAY_MS)))
  }
  return keys
}

/**
 * Métricas del periodo. Todo el dinero se acumula en centavos y se convierte
 * al final: sumar pesos flotantes hace que un cierre de 900 pedidos no cuadre
 * con la caja por un centavo.
 */
export function computeReport(
  orders: FoodosOrder[],
  filters: ReportFilters,
  now: number
): FoodosReport {
  const scoped = filterReportOrders(orders, filters, now)
  const paid = scoped.filter(isPaidOrder)

  const revenueCents = paid.reduce((sum, o) => sum + toCents(o.total), 0)
  const tipsCents = paid.reduce((sum, o) => sum + toCents(o.tip), 0)
  const discountsCents = paid.reduce((sum, o) => sum + toCents(o.discount), 0)

  const keys = reportDayKeys(filters.days, now)
  const dayIndex = new Map(keys.map((key) => [key, { count: 0, revenueCents: 0 }]))
  const channelIndex = new Map<string, { count: number; revenueCents: number }>()
  const shiftIndex = new Map<string, { count: number; revenueCents: number; cashCents: number }>()
  const branchIndex = new Map<string, { count: number; revenueCents: number }>()

  for (const order of scoped) {
    const key = dayKeyOf(DEFAULT_TIMEZONE, new Date(order.created_at))
    const day = dayIndex.get(key)
    if (day) day.count += 1

    const channel = channelIndex.get(order.channel) ?? { count: 0, revenueCents: 0 }
    channel.count += 1
    channelIndex.set(order.channel, channel)

    const branchKey = order.branch_id ?? NO_BRANCH
    const branch = branchIndex.get(branchKey) ?? { count: 0, revenueCents: 0 }
    branch.count += 1
    branchIndex.set(branchKey, branch)

    const shift = shiftIndex.get(orderShiftKey(order)) ?? {
      count: 0,
      revenueCents: 0,
      cashCents: 0,
    }
    shift.count += 1
    shiftIndex.set(orderShiftKey(order), shift)

    if (!isPaidOrder(order)) continue
    if (day) day.revenueCents += toCents(order.total)
    channel.revenueCents += toCents(order.total)
    branch.revenueCents += toCents(order.total)
    shift.revenueCents += toCents(order.total)
    shift.cashCents += toCents(cashPartOfSale(order))
  }

  // El desglose por canal siempre trae los seis canales, aunque estén en cero:
  // una barra ausente se lee como "no lo medimos", y aquí sí se mide.
  const extraChannels = [...channelIndex.keys()].filter(
    (c) => !FOODOS_REPORT_CHANNELS.includes(c as FoodosOrderChannel)
  )
  const byChannel: ChannelBucket[] = [...FOODOS_REPORT_CHANNELS, ...extraChannels].map((channel) => {
    const bucket = channelIndex.get(channel) ?? { count: 0, revenueCents: 0 }
    return {
      channel,
      label: channelLabel(channel),
      count: bucket.count,
      revenue: fromCents(bucket.revenueCents),
      share: scoped.length ? (bucket.count / scoped.length) * 100 : 0,
    }
  })

  const itemIndex = new Map<string, TopItem & { revenueCents: number }>()
  for (const order of paid) {
    for (const item of order.items) {
      const itemId = item.item_id || item.name
      const current =
        itemIndex.get(itemId) ?? { itemId, name: item.name, qty: 0, revenue: 0, revenueCents: 0 }
      current.qty += item.qty
      current.revenueCents += toCents(item.price) * item.qty
      itemIndex.set(itemId, current)
    }
  }
  const topItems = [...itemIndex.values()]
    .map((item) => ({ ...item, revenue: fromCents(item.revenueCents) }))
    .sort((a, b) => b.qty - a.qty || b.revenue - a.revenue)
    .slice(0, 5)

  const comboRevenueCents = paid.reduce(
    (sum, order) =>
      sum +
      order.items
        .filter((item) => item.combo_id)
        .reduce((lineSum, item) => lineSum + toCents(item.price) * item.qty, 0),
    0
  )

  const byShift: ShiftBucket[] = [...shiftIndex.entries()]
    .map(([shiftId, bucket]) => ({
      shiftId,
      count: bucket.count,
      revenue: fromCents(bucket.revenueCents),
      cash: fromCents(bucket.cashCents),
    }))
    // Los turnos reales primero, del que más vendió al que menos; `sin_turno`
    // al final porque no es un turno, es la ausencia de uno.
    .sort((a, b) => {
      if (a.shiftId === NO_SHIFT) return 1
      if (b.shiftId === NO_SHIFT) return -1
      return b.revenue - a.revenue
    })

  const revenue = fromCents(revenueCents)
  return {
    orderCount: scoped.length,
    paidCount: paid.length,
    pendingCount: scoped.length - paid.length,
    revenue,
    // El ticket promedio se divide entre los pedidos **pagados**: dividir entre
    // todos mezcla comandas abiertas con ventas y baja el promedio sin motivo.
    avgTicket: paid.length ? fromCents(Math.round(revenueCents / paid.length)) : 0,
    tips: fromCents(tipsCents),
    discounts: fromCents(discountsCents),
    byDay: keys.map((key) => {
      const bucket = dayIndex.get(key) ?? { count: 0, revenueCents: 0 }
      return {
        key,
        label: dayBucketLabel(key),
        count: bucket.count,
        revenue: fromCents(bucket.revenueCents),
      }
    }),
    byChannel,
    byShift,
    // Sucursales ordenadas por dinero, con las ventas sin sucursal al final:
    // el dueño compara locales entre sí, y "sin sucursal" no es un local.
    byBranch: [...branchIndex.entries()]
      .map(([branchId, bucket]) => ({
        branchId,
        count: bucket.count,
        revenue: fromCents(bucket.revenueCents),
      }))
      .sort((a, b) => {
        if (a.branchId === NO_BRANCH) return 1
        if (b.branchId === NO_BRANCH) return -1
        return b.revenue - a.revenue
      }),
    topItems,
    comboRevenue: fromCents(comboRevenueCents),
    comboShare: revenueCents ? (comboRevenueCents / revenueCents) * 100 : 0,
  }
}

export interface ShiftOption {
  id: string
  label: string
}

export interface ShiftLike {
  id: string
  status: string
  opened_at: string
  closed_at: string | null
  branch_id: string | null
  opening_float: number
  declared_cash: number | null
  expected_cash: number | null
  difference: number | null
}

/**
 * Fecha y hora del corte en hora de México, corta, para el selector de turno.
 *
 * El sufijo de sucursal sólo se agrega si el turno **tiene** sucursal: un
 * turno del local sin sucursal no puede quedar rotulado con el nombre de una
 * sucursal que no es la suya, aunque el llamador se lo pase por error.
 */
export function shiftOptionLabel(shift: ShiftLike, branchName?: string | null): string {
  const opened = new Date(shift.opened_at)
  const stamp = Number.isNaN(opened.getTime())
    ? "—"
    : new Intl.DateTimeFormat("es-MX", {
        timeZone: DEFAULT_TIMEZONE,
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(opened)
  const suffix = shift.status === "open" ? " (abierto)" : ""
  const branch = shift.branch_id && branchName ? ` · ${branchName}` : ""
  return `${stamp}${branch}${suffix}`
}

export function shiftOptions(
  shifts: ShiftLike[],
  branchNames: Map<string, string>
): ShiftOption[] {
  return shifts.map((shift) => ({
    id: shift.id,
    label: shiftOptionLabel(shift, shift.branch_id ? branchNames.get(shift.branch_id) ?? null : null),
  }))
}

export interface ShiftCloseRow {
  id: string
  label: string
  status: string
  orderCount: number
  revenue: number
  cashSales: number
  expectedCash: number | null
  declaredCash: number | null
  difference: number | null
  /** `null` mientras el turno siga abierto: un corte sin cerrar no cuadra. */
  arqueo: "ok" | "short" | "over" | null
}

export interface DailyClose {
  dayKey: string
  orderCount: number
  paidCount: number
  revenue: number
  pending: number
  tips: number
  discounts: number
  byPayment: { method: string; count: number; total: number }[]
  byChannel: { channel: string; label: string; count: number; revenue: number }[]
  byFulfillment: { fulfillment: string; count: number }[]
  shifts: ShiftCloseRow[]
  orders: FoodosOrder[]
}

export const FULFILLMENT_LABELS: Record<string, string> = {
  delivery: "A domicilio",
  pickup: "Para llevar",
  dine_in: "En el local",
}

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "Efectivo",
  card: "Tarjeta",
  transfer: "Transferencia",
  branch: "En sucursal",
  whatsapp: "WhatsApp",
  oxxo: "OXXO",
  mixed: "Combinado",
}

export function paymentMethodLabel(method: string): string {
  return PAYMENT_METHOD_LABELS[method] ?? method
}

/**
 * Cierre del día del restaurante.
 *
 * "Hoy" es el día del restaurante, no el del navegador: una tablet con el reloj
 * en UTC mostraría el cierre del día equivocado. Y cada turno lleva su propio
 * esperado/contado, porque el faltante de la mañana no se puede esconder en el
 * sobrante de la noche.
 */
export function computeDailyClose(
  orders: FoodosOrder[],
  shifts: ShiftLike[],
  opts: { now: number; shiftId?: string | null; timezone?: string }
): DailyClose {
  const timezone = opts.timezone ?? DEFAULT_TIMEZONE
  const dayKey = dayKeyOf(timezone, new Date(opts.now))
  const shiftId = opts.shiftId ?? null

  const today = orders.filter((order) => {
    if (order.status === "cancelled") return false
    if (dayKeyOf(timezone, new Date(order.created_at)) !== dayKey) return false
    if (shiftId && orderShiftKey(order) !== shiftId) return false
    return true
  })

  const paymentIndex = new Map<string, { count: number; totalCents: number }>()
  const channelIndex = new Map<string, { count: number; revenueCents: number }>()
  const fulfillmentIndex = new Map<string, number>()
  const shiftIndex = new Map<string, { count: number; revenueCents: number; cashCents: number }>()
  let revenueCents = 0
  let pendingCents = 0
  let tipsCents = 0
  let discountsCents = 0

  for (const order of today) {
    const paid = isPaidOrder(order)
    const cents = toCents(order.total)

    if (paid) {
      revenueCents += cents
      tipsCents += toCents(order.tip)
      discountsCents += toCents(order.discount)
    } else {
      pendingCents += cents
    }

    // El método de pago se desglosa por partes cuando el cobro fue combinado:
    // si no, el corte diría "combinado" y el cajero no sabría cuánto entró en
    // efectivo.
    const parts = order.payment_breakdown?.parts
    if (paid && parts && parts.length > 0) {
      for (const part of parts) {
        const bucket = paymentIndex.get(part.method) ?? { count: 0, totalCents: 0 }
        bucket.count += 1
        bucket.totalCents += toCents(part.amount)
        paymentIndex.set(part.method, bucket)
      }
    } else {
      const method = order.payment_method ?? "branch"
      const bucket = paymentIndex.get(method) ?? { count: 0, totalCents: 0 }
      bucket.count += 1
      if (paid) bucket.totalCents += cents
      paymentIndex.set(method, bucket)
    }

    const channel = channelIndex.get(order.channel) ?? { count: 0, revenueCents: 0 }
    channel.count += 1
    if (paid) channel.revenueCents += cents
    channelIndex.set(order.channel, channel)

    fulfillmentIndex.set(order.fulfillment, (fulfillmentIndex.get(order.fulfillment) ?? 0) + 1)

    const shiftKey = orderShiftKey(order)
    const shift = shiftIndex.get(shiftKey) ?? { count: 0, revenueCents: 0, cashCents: 0 }
    shift.count += 1
    if (paid) {
      shift.revenueCents += cents
      shift.cashCents += toCents(cashPartOfSale(order))
    }
    shiftIndex.set(shiftKey, shift)
  }

  const shiftRows: ShiftCloseRow[] = shifts
    .filter((shift) => !shiftId || shift.id === shiftId)
    .map((shift) => {
      const bucket = shiftIndex.get(shift.id) ?? { count: 0, revenueCents: 0, cashCents: 0 }
      const difference = shift.difference
      return {
        id: shift.id,
        label: shiftOptionLabel(shift),
        status: shift.status,
        orderCount: bucket.count,
        revenue: fromCents(bucket.revenueCents),
        cashSales: fromCents(bucket.cashCents),
        expectedCash: shift.expected_cash,
        declaredCash: shift.declared_cash,
        difference,
        arqueo:
          shift.status === "closed" && typeof difference === "number"
            ? difference < 0
              ? "short"
              : difference > 0
                ? "over"
                : "ok"
            : null,
      }
    })

  const extraChannels = [...channelIndex.keys()].filter(
    (c) => !FOODOS_REPORT_CHANNELS.includes(c as FoodosOrderChannel)
  )

  return {
    dayKey,
    orderCount: today.length,
    paidCount: today.filter(isPaidOrder).length,
    revenue: fromCents(revenueCents),
    pending: fromCents(pendingCents),
    tips: fromCents(tipsCents),
    discounts: fromCents(discountsCents),
    byPayment: [...paymentIndex.entries()]
      .map(([method, bucket]) => ({
        method,
        count: bucket.count,
        total: fromCents(bucket.totalCents),
      }))
      .sort((a, b) => b.total - a.total),
    byChannel: [...FOODOS_REPORT_CHANNELS, ...extraChannels]
      .map((channel) => {
        const bucket = channelIndex.get(channel) ?? { count: 0, revenueCents: 0 }
        return {
          channel,
          label: channelLabel(channel),
          count: bucket.count,
          revenue: fromCents(bucket.revenueCents),
        }
      })
      .filter((row) => row.count > 0),
    byFulfillment: [...fulfillmentIndex.entries()]
      .map(([fulfillment, count]) => ({ fulfillment, count }))
      .sort((a, b) => b.count - a.count),
    shifts: shiftRows,
    orders: today,
  }
}

/**
 * CSV del cierre. Es el documento que el contador archiva, así que lleva el
 * folio y el turno: sin ellos no se puede amarrar un renglón del CSV con el
 * corte de caja que lo respalda.
 */
export function dailyCloseCsv(close: DailyClose, shiftLabels: Map<string, string>): string {
  const header = [
    "folio",
    "hora",
    "canal",
    "servicio",
    "metodo_pago",
    "estado_pago",
    "turno",
    "subtotal",
    "descuento",
    "envio",
    "propina",
    "total",
  ]
  const rows = close.orders.map((order) => [
    order.folio ?? order.id.slice(0, 8),
    new Date(order.created_at).toLocaleTimeString("es-MX", {
      timeZone: DEFAULT_TIMEZONE,
      hour: "2-digit",
      minute: "2-digit",
    }),
    order.channel,
    order.fulfillment,
    order.payment_method ?? "branch",
    order.payment_status,
    shiftLabels.get(orderShiftKey(order)) ?? "",
    order.subtotal,
    order.discount,
    order.delivery_fee,
    order.tip,
    order.total,
  ])
  return [header, ...rows]
    .map((row) => row.map((cell) => csvCell(cell)).join(","))
    .join("\n")
}

/**
 * Una celda de CSV. Las notas y los nombres de cliente llevan comas y comillas
 * con una frecuencia que rompe cualquier exportación ingenua, así que todo se
 * entrecomilla y las comillas internas se duplican (RFC 4180).
 */
export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ""
  const text = String(value)
  return `"${text.replace(/"/g, '""')}"`
}
