// Pure line builders for the ventas panel clipboard reports.
// Each function returns the lines to copy; the page owns clipboard + toast.

import {
  Cliente,
  Comparison,
  DayStats,
  FichajesHoy,
  Mesa,
  MethodRow,
  ReportChannelRow,
  ReportMethodRow,
  ReportStats,
  SaleChannel,
  SaleEntry,
  TopSeller,
} from "@/components/panel/ventas/ventas-shared"

interface ChannelRow {
  key: SaleChannel
  label: string
  icon: string
  revenue: number
  count: number
}

function collectionPart(collectionName?: string): string {
  return ` (${collectionName ?? ""})`
}

function collectionSuffix(collectionName?: string): string {
  return ` ${collectionName ?? ""}`
}

export interface GerencialArgs {
  collectionName?: string
  periodLabel: string
  stats: ReportStats
  comisionesReporte: number
  tipoCambio: number
  methods: ReportMethodRow[]
  channels: ReportChannelRow[]
  top: TopSeller[]
  comparison: Comparison
}

export function buildGerencialLines({
  collectionName,
  periodLabel,
  stats,
  comisionesReporte,
  tipoCambio,
  methods,
  channels,
  top,
  comparison,
}: GerencialArgs): string[] {
  const lines = [
    `📊 Reporte gerencial — ${periodLabel}${collectionPart(collectionName)}`,
    `Ingresos: $${stats.revenue.toFixed(0)}`,
    `Costo de venta: $${stats.cost.toFixed(0)}`,
    `Margen bruto: $${stats.margin.toFixed(0)}`,
    `Food cost: ${stats.foodCost.toFixed(1)}%`,
    `Tickets: ${stats.orders} · Ticket promedio: $${stats.avgTicket.toFixed(0)}`,
    `Platillos vendidos: ${stats.units}`,
  ]
  if (stats.discount > 0) lines.push(`Descuentos otorgados: -$${stats.discount.toFixed(0)}`)
  if (comisionesReporte > 0) lines.push(`Comisiones por canal: -$${comisionesReporte.toFixed(0)}`)
  if (tipoCambio !== 1) lines.push(`Aprox. USD: $${(stats.revenue / tipoCambio).toFixed(2)}`)
  if (methods.length > 0) lines.push("", "Por método de pago:", ...methods.map((m) => `${m.icon} ${m.label}: $${m.revenue.toFixed(0)}`))
  if (channels.length > 1) lines.push("", "Por canal:", ...channels.map((c) => `${c.icon} ${c.label}: $${c.revenue.toFixed(0)}`))
  if (top.length > 0) lines.push("", "Top productos:", ...top.map((t, i) => `${i + 1}. ${t.name} — ${t.qty} pz ($${t.revenue.toFixed(0)})`))
  if (comparison.prev.orders > 0 || comparison.prev.revenue > 0) {
    lines.push(
      "",
      `vs período anterior: ingresos ${comparison.revenueDelta >= 0 ? "+" : ""}${comparison.revenueDelta.toFixed(0)}% · tickets ${comparison.ordersDelta >= 0 ? "+" : ""}${comparison.ordersDelta.toFixed(0)}% · ticket prom. ${comparison.avgDelta >= 0 ? "+" : ""}${comparison.avgDelta.toFixed(0)}%`,
    )
  }
  lines.push("", "📈 Registrado en resurte.me")
  return lines
}

export interface ResumenArgs {
  collectionName?: string
  dateLabel: string
  stats: DayStats
  methods: MethodRow[]
  channels: ChannelRow[]
  top: TopSeller[]
  tipoCambio: number
  clientes: Cliente[]
  mesas: Mesa[]
  entries: SaleEntry[]
}

export function buildResumenLines({
  collectionName,
  dateLabel,
  stats,
  methods,
  channels,
  top,
  tipoCambio,
  clientes,
  mesas,
  entries,
}: ResumenArgs): string[] {
  const header = `💰 Resumen de ventas — ${dateLabel}${collectionPart(collectionName)}`
  const lines = [
    `Ingresos: $${stats.revenue.toFixed(0)}`,
    `Costo de venta: $${stats.cost.toFixed(0)}`,
    `Margen bruto: $${stats.margin.toFixed(0)}`,
    `Food cost real: ${stats.foodCost.toFixed(1)}%`,
    `Platillos vendidos: ${stats.units}`,
  ]
  if (stats.discount > 0) lines.push(`Descuentos otorgados: -$${stats.discount.toFixed(0)}`)
  const methodLines = methods.length > 0
    ? ["", "Por método de pago:", ...methods.map((m) => `${m.icon} ${m.label}: $${m.revenue.toFixed(0)} (${m.count} venta${m.count > 1 ? "s" : ""})`)]
    : []
  const channelLines = channels.length > 1
    ? ["", "Por canal:", ...channels.map((c) => `${c.icon} ${c.label}: $${c.revenue.toFixed(0)} (${c.count} venta${c.count > 1 ? "s" : ""})`)]
    : []
  const topLines = top.length > 0
    ? ["", "Top ventas:", ...top.map((t, i) => `${i + 1}. ${t.name} — ${t.qty} pz ($${t.revenue.toFixed(0)})`)]
    : []
  if (tipoCambio !== 1) lines.push(`Aprox. USD: $${(stats.revenue / tipoCambio).toFixed(2)}`)
  const clienteName = (id?: string) => clientes.find((c) => c.id === id)?.nombre || ""
  const mesaLabel = (id?: string) => mesas.find((m) => m.id === id)?.nombre || ""
  const entryLines = entries.length > 0
    ? ["", "Ventas del día:", ...entries.map((e, i) => {
        const mods = e.modificadores && e.modificadores.length > 0 ? ` [+${e.modificadores.map((m) => m.nombre).join(", ")}]` : ""
        const cli = e.clienteId ? ` · ${clienteName(e.clienteId)}` : ""
        const mesaTxt = e.mesaId && mesaLabel(e.mesaId) ? ` · 🪑 ${mesaLabel(e.mesaId)}` : ""
        return `${i + 1}. ${e.dishName}${mods} ×${e.quantity}${cli}${mesaTxt} — $${(e.unitPrice * e.quantity).toFixed(0)}`
      })]
    : []
  return [header, ...lines, ...entryLines, ...methodLines, ...channelLines, ...topLines, "", "📈 Registrado en resurte.me"]
}

export interface CorteArgs {
  collectionName?: string
  dateLabel: string
  stats: DayStats
  methods: MethodRow[]
  channels: ChannelRow[]
  comisionesHoy: number
  mesasOcupadas: number
  tipoCambio: number
  entries: SaleEntry[]
}

export function buildCorteLines({
  collectionName,
  dateLabel,
  stats,
  methods,
  channels,
  comisionesHoy,
  mesasOcupadas,
  tipoCambio,
  entries,
}: CorteArgs): string[] {
  const lines = [
    `🧾 Corte de caja — ${dateLabel}${collectionPart(collectionName)}`,
    "",
    ...methods.filter((m) => m.count > 0)
      .map((m) => `${m.icon} ${m.label}: $${m.revenue.toFixed(0)} (${m.count} venta${m.count > 1 ? "s" : ""})`),
    ...(channels.filter((c) => c.count > 0).length > 1
      ? ["", ...channels.filter((c) => c.count > 0)
          .map((c) => `${c.icon} ${c.label}: $${c.revenue.toFixed(0)} (${c.count} venta${c.count > 1 ? "s" : ""})`)]
      : []),
    ...(stats.discount > 0 ? [`Descuentos otorgados: -$${stats.discount.toFixed(0)}`] : []),
    ...(comisionesHoy > 0 ? [`Comisiones por canal: -$${comisionesHoy.toFixed(0)}`] : []),
    ...(mesasOcupadas > 0 ? [`Mesas ocupadas: ${mesasOcupadas}`] : []),
    ...(tipoCambio !== 1 ? [`Aprox. USD: $${(stats.revenue / tipoCambio).toFixed(2)}`] : []),
    ...(entries.some((e) => e.modificadores?.length) ? ["", "Con modificadores:", ...entries.filter((e) => e.modificadores?.length).map((e) => `${e.dishName} [+${e.modificadores!.map((m) => m.nombre).join(", ")}] ×${e.quantity}`)] : []),
    "",
    `Total: $${stats.revenue.toFixed(0)} · ${stats.units} platillos`,
    "",
    "📈 Registrado en resurte.me",
  ]
  return lines
}

export interface HorasArgs {
  collectionName?: string
  dateLabel: string
  fichajesHoy: FichajesHoy
}

export function buildHorasLines({ collectionName, dateLabel, fichajesHoy }: HorasArgs): string[] {
  return [
    `⏰ Reporte de horas — ${dateLabel}${collectionPart(collectionName)}`,
    ...fichajesHoy.rows.map(
      (r) => `${r.nombre}${r.rol ? ` (${r.rol})` : ""}: ${Math.floor(r.minutos / 60)}h ${Math.round(r.minutos % 60)}min — $${((r.minutos / 60) * r.tarifa).toFixed(0)}${r.abierto ? " (en curso)" : ""}`,
    ),
    `Total: ${Math.floor(fichajesHoy.totalMin / 60)}h ${Math.round(fichajesHoy.totalMin % 60)}min — $${fichajesHoy.totalCosto.toFixed(0)}`,
    "",
    "📈 Registrado en resurte.me",
  ]
}

export interface ClientesArgs {
  collectionName?: string
  clientes: Cliente[]
}

export function buildClientesLines({ collectionName, clientes }: ClientesArgs): string[] {
  const header = `👥 Clientes frecuentes —${collectionSuffix(collectionName)}`
  const lines = clientes.map((c) => `${c.nombre}${c.telefono ? ` · ${c.telefono}` : ""} · ${c.puntos} pts · ${c.visitas} visitas · $${c.totalGastado.toFixed(0)}`)
  return [header, ...lines]
}
