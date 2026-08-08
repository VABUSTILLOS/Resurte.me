"use client"

import { useMemo } from "react"
import {
  SaleEntry,
  Empleado,
  Fichaje,
  PaymentMethod,
  SaleChannel,
  DayStats,
  ReportStats,
  TopSeller,
  MethodRow,
  ReportMethodRow,
  ReportChannelRow,
  WeekTrend,
  AllTimeStats,
  FraudAlert,
  FichajesHoy,
  EmpleadoHoy,
  Comparison,
  PAYMENT_METHODS,
  SALE_CHANNELS,
  entryTotal,
} from "@/components/panel/ventas/ventas-shared"
import { dateLabel, todayStr } from "@/lib/panel-utils"
import { ChannelRow } from "@/lib/ventas/reportes"

export interface VentasStatsInput {
  entries: SaleEntry[]
  selectedDate: string
  now: number
  dailyGoal: number
  monthlyGoal: number
  ticketThreshold: number
  reportPeriod: "hoy" | "7d" | "30d"
  comisiones: Record<string, number>
  empleados: Empleado[]
  fichajes: Fichaje[]
}

export interface VentasStats {
  today: string
  monthKey: string
  dayEntries: SaleEntry[]
  mesasOcupadasHoy: Map<string, number>
  dayStats: DayStats
  monthRevenue: number
  dailyGoalPct: number
  monthlyGoalPct: number
  projectedRevenue: number
  onPace: boolean
  topSellers: TopSeller[]
  methodBreakdown: MethodRow[]
  channelBreakdown: ChannelRow[]
  weekTrend: WeekTrend
  allTimeStats: AllTimeStats
  fraudAlerts: FraudAlert[]
  reportEntries: SaleEntry[]
  reportStats: ReportStats
  reportTop: TopSeller[]
  reportMethods: ReportMethodRow[]
  reportChannels: ReportChannelRow[]
  comisionesHoy: number
  comisionesReporte: number
  fichajesHoy: FichajesHoy
  empleadosHoy: EmpleadoHoy[]
  comparison: Comparison
}

export function useVentasStats({
  entries,
  selectedDate,
  now,
  dailyGoal,
  monthlyGoal,
  ticketThreshold,
  reportPeriod,
  comisiones,
  empleados,
  fichajes,
}: VentasStatsInput): VentasStats {
  const today = todayStr()
  const monthKey = today.slice(0, 7)

  const dayEntries = useMemo(() => entries.filter((e) => e.date === selectedDate), [entries, selectedDate])

  // ── Mesas: ocupación del día ──
  const mesasOcupadasHoy = useMemo(() => {
    const occupied = new Map<string, number>() // mesaId -> first createdAt ts
    dayEntries.forEach((e) => {
      if (!e.mesaId) return
      const ts = e.createdAt ? Date.parse(e.createdAt) : now
      const prev = occupied.get(e.mesaId)
      if (prev == null || ts < prev) occupied.set(e.mesaId, ts)
    })
    return occupied
  }, [dayEntries, now])

  const dayStats = useMemo(() => {
    const revenue = dayEntries.reduce((s, e) => s + entryTotal(e), 0)
    const cost = dayEntries.reduce((s, e) => s + e.quantity * e.unitCost, 0)
    const units = dayEntries.reduce((s, e) => s + e.quantity, 0)
    const orders = dayEntries.length
    const discount = dayEntries.reduce(
      (s, e) => s + (e.quantity * e.unitPrice - entryTotal(e)),
      0,
    )
    return { revenue, cost, margin: revenue - cost, units, orders, foodCost: revenue > 0 ? (cost / revenue) * 100 : 0, avgTicket: orders > 0 ? revenue / orders : 0, discount }
  }, [dayEntries])

  const monthRevenue = useMemo(
    () => entries.filter((e) => e.date.startsWith(monthKey)).reduce((s, e) => s + entryTotal(e), 0),
    [entries, monthKey],
  )
  const dailyGoalPct = dailyGoal > 0 ? (dayStats.revenue / dailyGoal) * 100 : 0
  const monthlyGoalPct = monthlyGoal > 0 ? (monthRevenue / monthlyGoal) * 100 : 0
  const hourElapsed = (() => {
    const now = new Date()
    return (now.getHours() + now.getMinutes() / 60) / 24
  })()
  const projectedRevenue = hourElapsed > 0.04 ? dayStats.revenue / hourElapsed : dayStats.revenue
  const onPace = dailyGoal > 0 && projectedRevenue >= dailyGoal

  const topSellers = useMemo(() => {
    const byName = new Map<string, { name: string; qty: number; revenue: number }>()
    dayEntries.forEach((e) => {
      const cur = byName.get(e.dishName) || { name: e.dishName, qty: 0, revenue: 0 }
      cur.qty += e.quantity
      cur.revenue += entryTotal(e)
      byName.set(e.dishName, cur)
    })
    return [...byName.values()].sort((a, b) => b.qty - a.qty).slice(0, 5)
  }, [dayEntries])

  const methodBreakdown = useMemo(() => {
    const byMethod = new Map<PaymentMethod, { revenue: number; count: number }>()
    dayEntries.forEach((e) => {
      const m = (e.paymentMethod || "efectivo") as PaymentMethod
      const cur = byMethod.get(m) || { revenue: 0, count: 0 }
      cur.revenue += entryTotal(e)
      cur.count += 1
      byMethod.set(m, cur)
    })
    return PAYMENT_METHODS.map((m) => ({
      ...m,
      ...(byMethod.get(m.key) || { revenue: 0, count: 0 }),
    }))
  }, [dayEntries])

  const channelBreakdown = useMemo(() => {
    const byChannel = new Map<SaleChannel, { revenue: number; count: number }>()
    dayEntries.forEach((e) => {
      const c = (e.channel || "comedor") as SaleChannel
      const cur = byChannel.get(c) || { revenue: 0, count: 0 }
      cur.revenue += entryTotal(e)
      cur.count += 1
      byChannel.set(c, cur)
    })
    return SALE_CHANNELS.map((c) => ({
      ...c,
      ...(byChannel.get(c.key) || { revenue: 0, count: 0 }),
    }))
  }, [dayEntries])

  const weekTrend = useMemo(() => {
    const days: { label: string; revenue: number; cost: number }[] = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
      const rev = entries.filter((e) => e.date === key).reduce((s, e) => s + entryTotal(e), 0)
      const cost = entries.filter((e) => e.date === key).reduce((s, e) => s + e.quantity * e.unitCost, 0)
      days.push({ label: dateLabel(key), revenue: rev, cost })
    }
    const max = Math.max(...days.map((d) => d.revenue), 1)
    return { days, max }
  }, [entries])

  const allTimeStats = useMemo(() => {
    const revenue = entries.reduce((s, e) => s + entryTotal(e), 0)
    const cost = entries.reduce((s, e) => s + e.quantity * e.unitCost, 0)
    return { revenue, cost, margin: revenue - cost, foodCost: revenue > 0 ? (cost / revenue) * 100 : 0, count: entries.length }
  }, [entries])

  // ── Antifraud heuristics ──────────────────────────────
  const fraudAlerts = useMemo(() => {
    const alerts: FraudAlert[] = []
    dayEntries.forEach((e) => {
      const total = entryTotal(e)
      if (ticketThreshold > 0 && total > ticketThreshold) {
        alerts.push({ entryId: e.id, dishName: e.dishName, reason: `Ticket de $${total.toFixed(0)} supera el umbral de $${ticketThreshold.toFixed(0)}` })
      }
      if (e.quantity >= 20) {
        alerts.push({ entryId: e.id, dishName: e.dishName, reason: `Cantidad de ${e.quantity} unidades` })
      }
      if (e.discount && e.discount.type === "porcentaje" && e.discount.value > 30) {
        alerts.push({ entryId: e.id, dishName: e.dishName, reason: `Descuento del ${e.discount.value}%` })
      }
      if (e.unitPrice <= 0) {
        alerts.push({ entryId: e.id, dishName: e.dishName, reason: "Venta con precio $0" })
      }
    })
    return alerts
  }, [dayEntries, ticketThreshold])

  // ── Management report (period) ──────────────────────
  const reportEntries = useMemo(() => {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - (reportPeriod === "hoy" ? 0 : reportPeriod === "7d" ? 7 : 30))
    const minKey = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, "0")}-${String(cutoff.getDate()).padStart(2, "0")}`
    return reportPeriod === "hoy"
      ? entries.filter((e) => e.date === today)
      : entries.filter((e) => e.date >= minKey)
  }, [entries, reportPeriod, today])

  const reportStats = useMemo(() => {
    const revenue = reportEntries.reduce((s, e) => s + entryTotal(e), 0)
    const cost = reportEntries.reduce((s, e) => s + e.quantity * e.unitCost, 0)
    const units = reportEntries.reduce((s, e) => s + e.quantity, 0)
    const orders = reportEntries.length
    const discount = reportEntries.reduce((s, e) => s + (e.quantity * e.unitPrice - entryTotal(e)), 0)
    return {
      revenue,
      cost,
      margin: revenue - cost,
      units,
      orders,
      discount,
      foodCost: revenue > 0 ? (cost / revenue) * 100 : 0,
      avgTicket: orders > 0 ? revenue / orders : 0,
    }
  }, [reportEntries])

  const reportTop = useMemo(() => {
    const byName = new Map<string, { name: string; qty: number; revenue: number }>()
    reportEntries.forEach((e) => {
      const cur = byName.get(e.dishName) || { name: e.dishName, qty: 0, revenue: 0 }
      cur.qty += e.quantity
      cur.revenue += entryTotal(e)
      byName.set(e.dishName, cur)
    })
    return [...byName.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 5)
  }, [reportEntries])

  const reportMethods = useMemo(() => {
    const byMethod = new Map<PaymentMethod, number>()
    reportEntries.forEach((e) => {
      const m = (e.paymentMethod || "efectivo") as PaymentMethod
      byMethod.set(m, (byMethod.get(m) || 0) + entryTotal(e))
    })
    return PAYMENT_METHODS.map((m) => ({ ...m, revenue: byMethod.get(m.key) || 0 })).filter((m) => m.revenue > 0)
  }, [reportEntries])

  const reportChannels = useMemo(() => {
    const byChannel = new Map<SaleChannel, number>()
    reportEntries.forEach((e) => {
      const c = (e.channel || "comedor") as SaleChannel
      byChannel.set(c, (byChannel.get(c) || 0) + entryTotal(e))
    })
    return SALE_CHANNELS.map((c) => ({ ...c, revenue: byChannel.get(c.key) || 0 })).filter((c) => c.revenue > 0)
  }, [reportEntries])

  // ── Comisiones por canal ──────────────────────────────
  const comisionesHoy = useMemo(() => {
    return dayEntries.reduce((s, e) => {
      const c = (e.channel || "comedor") as SaleChannel
      return s + (entryTotal(e) * (comisiones[c] || 0)) / 100
    }, 0)
  }, [dayEntries, comisiones])

  const comisionesReporte = useMemo(() => {
    return reportEntries.reduce((s, e) => {
      const c = (e.channel || "comedor") as SaleChannel
      return s + (entryTotal(e) * (comisiones[c] || 0)) / 100
    }, 0)
  }, [reportEntries, comisiones])

  // ── Reloj checador ────────────────────────────────────
  const fichajesHoy = useMemo(() => {
    const start = new Date(`${selectedDate}T00:00:00`).getTime()
    const end = new Date(`${selectedDate}T23:59:59`).getTime()
    const byEmp = new Map<string, { nombre: string; rol?: string; tarifa: number; minutos: number; fichajes: number; abierto: boolean }>()
    empleados.forEach((emp) => {
      byEmp.set(emp.id, { nombre: emp.nombre, rol: emp.rol, tarifa: emp.tarifa, minutos: 0, fichajes: 0, abierto: false })
    })
    fichajes.forEach((f) => {
      const t = Date.parse(f.entrada)
      if (Number.isNaN(t) || t < start || t > end) return
      const emp = byEmp.get(f.empleadoId)
      if (!emp) return
      emp.fichajes += 1
      const out = f.salida ? Date.parse(f.salida) : now
      if (!f.salida) emp.abierto = true
      emp.minutos += Math.max(0, (out - t) / 60000)
    })
    const rows = Array.from(byEmp.values()).filter((r) => r.fichajes > 0)
    const totalMin = rows.reduce((s, r) => s + r.minutos, 0)
    const totalCosto = rows.reduce((s, r) => s + (r.minutos / 60) * r.tarifa, 0)
    return { rows, totalMin, totalCosto }
  }, [empleados, fichajes, selectedDate, now])

  const empleadosHoy = useMemo(() => {
    const hoy = todayStr()
    return empleados.map((emp) => {
      const hs = fichajes.filter((f) => f.empleadoId === emp.id && f.entrada.startsWith(hoy))
      const abierto = hs.some((f) => !f.salida)
      const minutos = hs.reduce(
        (s, f) => s + Math.max(0, ((f.salida ? Date.parse(f.salida) : Date.now()) - Date.parse(f.entrada)) / 60000),
        0,
      )
      return { ...emp, minutos, abierto, fichajesHoy: hs.length }
    })
  }, [empleados, fichajes])

  // ── Comparativa contra período anterior ──────────────
  const comparison = useMemo(() => {
    const days = reportPeriod === "hoy" ? 1 : reportPeriod === "7d" ? 7 : 30
    const curStart = new Date()
    curStart.setDate(curStart.getDate() - (days - 1))
    curStart.setHours(0, 0, 0, 0)
    const curStartKey = `${curStart.getFullYear()}-${String(curStart.getMonth() + 1).padStart(2, "0")}-${String(curStart.getDate()).padStart(2, "0")}`
    const prevStart = new Date(curStart)
    prevStart.setDate(prevStart.getDate() - days)
    const prevStartKey = `${prevStart.getFullYear()}-${String(prevStart.getMonth() + 1).padStart(2, "0")}-${String(prevStart.getDate()).padStart(2, "0")}`
    const prevEnd = new Date(curStart.getTime() - 1)
    const prevEndKey = `${prevEnd.getFullYear()}-${String(prevEnd.getMonth() + 1).padStart(2, "0")}-${String(prevEnd.getDate()).padStart(2, "0")}`
    const stats = (list: SaleEntry[]) => {
      const revenue = list.reduce((s, e) => s + entryTotal(e), 0)
      const orders = list.length
      return { revenue, orders, avgTicket: orders > 0 ? revenue / orders : 0 }
    }
    const cur = stats(entries.filter((e) => e.date >= curStartKey && e.date <= today))
    const prev = stats(entries.filter((e) => e.date >= prevStartKey && e.date <= prevEndKey))
    const delta = (a: number, b: number) => (b > 0 ? ((a - b) / b) * 100 : a > 0 ? 100 : 0)
    return {
      cur,
      prev,
      revenueDelta: delta(cur.revenue, prev.revenue),
      ordersDelta: delta(cur.orders, prev.orders),
      avgDelta: delta(cur.avgTicket, prev.avgTicket),
    }
  }, [reportPeriod, entries, today])

  return {
    today,
    monthKey,
    dayEntries,
    mesasOcupadasHoy,
    dayStats,
    monthRevenue,
    dailyGoalPct,
    monthlyGoalPct,
    projectedRevenue,
    onPace,
    topSellers,
    methodBreakdown,
    channelBreakdown,
    weekTrend,
    allTimeStats,
    fraudAlerts,
    reportEntries,
    reportStats,
    reportTop,
    reportMethods,
    reportChannels,
    comisionesHoy,
    comisionesReporte,
    fichajesHoy,
    empleadosHoy,
    comparison,
  }
}
