"use client"

import { useState, useMemo, useEffect } from "react"
import { useRestaurant } from "@/contexts/restaurant-context"
import { useLocalStorage, useSharedDishes } from "@/hooks/use-local-storage"
import { usePanelConfig } from "@/lib/panel-config"
import { useToast } from "@/components/toast"
import { normalizeName } from "@/lib/normalize"
import { uid } from "@/lib/ids"
import { convertQty } from "@/lib/panel-units"
import { todayStr, dateLabel } from "@/lib/panel-utils"
import { t } from "@/lib/i18n/es"
import Link from "next/link"
import { ArrowLeft, Copy, Flame, AlertCircle, Receipt } from "lucide-react"
import {
  SaleEntry,
  Cliente,
  Mesa,
  Empleado,
  Fichaje,
  TarjetaRegalo,
  PAYMENT_METHODS,
  PaymentMethod,
  SALE_CHANNELS,
  SaleChannel,
  entryTotal,
} from "@/components/panel/ventas/ventas-shared"
import SalesGoals from "@/components/panel/ventas/SalesGoals"
import SaleForm, { SaleFormData } from "@/components/panel/ventas/SaleForm"
import FrequentCustomers from "@/components/panel/ventas/FrequentCustomers"
import DiningTables from "@/components/panel/ventas/DiningTables"
import RelojChecador from "@/components/panel/ventas/RelojChecador"
import GiftCards from "@/components/panel/ventas/GiftCards"
import AntifraudAlerts from "@/components/panel/ventas/AntifraudAlerts"
import DayStats from "@/components/panel/ventas/DayStats"
import CorteCaja from "@/components/panel/ventas/CorteCaja"
import ManagementReport from "@/components/panel/ventas/ManagementReport"
import WeekTrend from "@/components/panel/ventas/WeekTrend"
import TopSellers from "@/components/panel/ventas/TopSellers"
import EntriesList from "@/components/panel/ventas/EntriesList"
import AllTimeTip from "@/components/panel/ventas/AllTimeTip"
import DeleteConfirmModal from "@/components/panel/ventas/DeleteConfirmModal"

interface InventoryItemLike {
  id: string
  name: string
  stock: number
  minStock: number
  unit: string
  pricePerUnit: number
  category?: string
}

interface StockMovementLike {
  fecha: string
  itemId: string
  itemName: string
  tipo: "entrada" | "salida" | "ajuste"
  delta: number
  motivo: string
}

export default function VentasPage() {
  const { selectedCollection } = useRestaurant()
  const slug = selectedCollection?.slug || null
  const { toast } = useToast()
  const [sharedDishes] = useSharedDishes(slug)

  const [entries, setEntries] = useLocalStorage<SaleEntry[]>("ventas-entries", [], slug)
  const panelCfg = usePanelConfig(slug)
  const [inventarioItems, setInventarioItems] = useLocalStorage<InventoryItemLike[]>("inventario-items", [], slug)
  const [, setMovements] = useLocalStorage<StockMovementLike[]>("inventario-movimientos", [], slug)
  const [deductStock, setDeductStock] = useLocalStorage<boolean>("ventas-descontar-stock", false, slug)
  const [dailyGoal, setDailyGoal] = useLocalStorage<number>("ventas-meta-dia", 0, slug)
  const [monthlyGoal, setMonthlyGoal] = useLocalStorage<number>("ventas-meta-mes", 0, slug)
  const [ticketThreshold, setTicketThreshold] = useLocalStorage<number>("ventas-umbral-ticket", 3000, slug)
  const [clientes, setClientes] = useLocalStorage<Cliente[]>("clientes", [], slug)
  const [puntosTasa, setPuntosTasa] = useLocalStorage<number>("ventas-puntos-tasa", 100, slug)
  const [puntosCanje, setPuntosCanje] = useLocalStorage<number>("ventas-puntos-canje", 1, slug)
  const [tipoCambio, setTipoCambio] = useLocalStorage<number>("ventas-tipo-cambio", 1, slug)
  const [mesas, setMesas] = useLocalStorage<Mesa[]>("mesas", [], slug)
  const [empleados, setEmpleados] = useLocalStorage<Empleado[]>("reloj-empleados", [], slug)
  const [fichajes, setFichajes] = useLocalStorage<Fichaje[]>("reloj-fichajes", [], slug)
  const [tarjetas, setTarjetas] = useLocalStorage<TarjetaRegalo[]>("tarjetas-regalo", [], slug)
  const [comisiones, setComisiones] = useLocalStorage<Record<string, number>>("ventas-comisiones", {}, slug)
  // Keep comanda statuses in sync: deleting a sale must remove its comanda status
  const [, setComandaStatuses] = useLocalStorage<Record<string, unknown>>("comanda-statuses", {}, slug)
  // Live tick for "tiempo ocupado" / fichajes abiertos
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60000)
    return () => clearInterval(t)
  }, [])
  const [showGoals, setShowGoals] = useState(false)
  const [showClientes, setShowClientes] = useState(false)
  const [showMesas, setShowMesas] = useState(false)
  const [showReloj, setShowReloj] = useState(false)
  const [showTarjetas, setShowTarjetas] = useState(false)
  const [mesaName, setMesaName] = useState("")
  const [mesaCapacidad, setMesaCapacidad] = useState("")
  const [mesaZona, setMesaZona] = useState("")
  const [mesaEditId, setMesaEditId] = useState<string | null>(null)
  const [mesaDeleteId, setMesaDeleteId] = useState<string | null>(null)
  const [empNombre, setEmpNombre] = useState("")
  const [empRol, setEmpRol] = useState("")
  const [empTarifa, setEmpTarifa] = useState("")
  const [empEditId, setEmpEditId] = useState<string | null>(null)
  const [empDeleteId, setEmpDeleteId] = useState<string | null>(null)
  const [tarjetaMonto, setTarjetaMonto] = useState("")
  const [clienteName, setClienteName] = useState("")
  const [clientePhone, setClientePhone] = useState("")
  const [clientePts, setClientePts] = useState("")
  const [clienteEditId, setClienteEditId] = useState<string | null>(null)
  const [clienteDeleteId, setClienteDeleteId] = useState<string | null>(null)
  const [goalFormDia, setGoalFormDia] = useState("")
  const [goalFormMes, setGoalFormMes] = useState("")
  const [selectedDate, setSelectedDate] = useState(todayStr())
  const [showAll, setShowAll] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [reportPeriod, setReportPeriod] = useState<"hoy" | "7d" | "30d">("hoy")

  // ── Derived ────────────────────────────────────────────
  const dishCost = (id: string) => {
    const dish = sharedDishes.find((d) => d.id === id)
    if (!dish) return 0
    return dish.ingredients.reduce((s, i) => s + i.quantity * i.unitPrice, 0)
  }
  const dishPrice = (id: string) => sharedDishes.find((d) => d.id === id)?.sellingPrice || 0

  const dayEntries = useMemo(() => entries.filter((e) => e.date === selectedDate), [entries, selectedDate])

  // ── Mesas: ocupación del día y mesas libres para el formulario ──
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

  // ── Sales goals (daily / monthly) ─────────────────────
  const today = todayStr()
  const monthKey = today.slice(0, 7)
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

  const saveGoals = () => {
    const d = parseFloat(goalFormDia)
    const m = parseFloat(goalFormMes)
    if (!Number.isNaN(d) && d >= 0) setDailyGoal(d)
    if (!Number.isNaN(m) && m >= 0) setMonthlyGoal(m)
    setShowGoals(false)
    toast("Metas de venta guardadas", "success")
  }

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
    const alerts: { entryId: string; dishName: string; reason: string }[] = []
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

  const ficharEntrada = (empleadoId: string) => {
    const open = fichajes.find((f) => f.empleadoId === empleadoId && !f.salida)
    if (open) {
      toast("Ya tiene un fichaje de entrada abierto", "warning")
      return
    }
    setFichajes((prev) => [...prev, { id: uid("fichaje"), empleadoId, entrada: new Date().toISOString() }])
    toast("Entrada registrada", "success")
  }

  const ficharSalida = (empleadoId: string) => {
    const open = fichajes.find((f) => f.empleadoId === empleadoId && !f.salida)
    if (!open) {
      toast("No hay fichaje de entrada abierto", "warning")
      return
    }
    setFichajes((prev) => prev.map((f) => (f.id === open.id ? { ...f, salida: new Date().toISOString() } : f)))
    toast("Salida registrada", "success")
  }

  const saveEmpleado = () => {
    const nombre = empNombre.trim()
    const tarifa = parseFloat(empTarifa)
    if (!nombre || Number.isNaN(tarifa) || tarifa < 0) {
      toast("Completa nombre y tarifa válida", "warning")
      return
    }
    setEmpleados((prev) => {
      const id = empEditId || uid("empleado")
      const exists = prev.some((e) => e.id === id)
      const nuevo: Empleado = { id, nombre, rol: empRol.trim() || undefined, tarifa }
      return exists ? prev.map((e) => (e.id === id ? nuevo : e)) : [...prev, nuevo]
    })
    setEmpNombre("")
    setEmpRol("")
    setEmpTarifa("")
    setEmpEditId(null)
    toast(empEditId ? "Empleado actualizado" : "Empleado agregado", "success")
  }

  const copyHoras = () => {
    if (fichajesHoy.rows.length === 0) {
      toast("No hay fichajes para ese día", "warning")
      return
    }
    const lines = [
      `⏰ Reporte de horas — ${dateLabel(selectedDate)} (${selectedCollection?.name || ""})`,
      ...fichajesHoy.rows.map(
        (r) => `${r.nombre}${r.rol ? ` (${r.rol})` : ""}: ${Math.floor(r.minutos / 60)}h ${Math.round(r.minutos % 60)}min — $${((r.minutos / 60) * r.tarifa).toFixed(0)}${r.abierto ? " (en curso)" : ""}`,
      ),
      `Total: ${Math.floor(fichajesHoy.totalMin / 60)}h ${Math.round(fichajesHoy.totalMin % 60)}min — $${fichajesHoy.totalCosto.toFixed(0)}`,
      "",
      "📈 Registrado en resurte.me",
    ]
    navigator.clipboard.writeText(lines.join("\n"))
    toast("Reporte de horas copiado", "success")
  }

  // ── Tarjetas de regalo ────────────────────────────────
  const emitirTarjeta = () => {
    const monto = parseFloat(tarjetaMonto)
    if (Number.isNaN(monto) || monto <= 0) {
      toast("Ingresa un monto válido", "warning")
      return
    }
    const code = `RT-${Math.random().toString(36).slice(2, 6).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
    setTarjetas((prev) => [...prev, { id: uid("tarjeta"), codigo: code, monto, saldo: monto, estado: "activa", creada: new Date().toISOString() }])
    setTarjetaMonto("")
    toast(`Tarjeta ${code} emitida con $${monto.toFixed(0)}`, "success")
  }

  const copyCodigoTarjeta = (codigo: string) => {
    navigator.clipboard.writeText(codigo)
    toast("Código copiado", "success")
  }

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

  const copyGerencial = () => {
    const label = reportPeriod === "hoy" ? "Hoy" : reportPeriod === "7d" ? "Últimos 7 días" : "Últimos 30 días"
    const lines = [
      `📊 Reporte gerencial — ${label} (${selectedCollection?.name || ""})`,
      `Ingresos: $${reportStats.revenue.toFixed(0)}`,
      `Costo de venta: $${reportStats.cost.toFixed(0)}`,
      `Margen bruto: $${reportStats.margin.toFixed(0)}`,
      `Food cost: ${reportStats.foodCost.toFixed(1)}%`,
      `Tickets: ${reportStats.orders} · Ticket promedio: $${reportStats.avgTicket.toFixed(0)}`,
      `Platillos vendidos: ${reportStats.units}`,
    ]
    if (reportStats.discount > 0) lines.push(`Descuentos otorgados: -$${reportStats.discount.toFixed(0)}`)
    if (comisionesReporte > 0) lines.push(`Comisiones por canal: -$${comisionesReporte.toFixed(0)}`)
    if (tipoCambio !== 1) lines.push(`Aprox. USD: $${(reportStats.revenue / tipoCambio).toFixed(2)}`)
    if (reportMethods.length > 0) lines.push("", "Por método de pago:", ...reportMethods.map((m) => `${m.icon} ${m.label}: $${m.revenue.toFixed(0)}`))
    if (reportChannels.length > 1) lines.push("", "Por canal:", ...reportChannels.map((c) => `${c.icon} ${c.label}: $${c.revenue.toFixed(0)}`))
    if (reportTop.length > 0) lines.push("", "Top productos:", ...reportTop.map((t, i) => `${i + 1}. ${t.name} — ${t.qty} pz ($${t.revenue.toFixed(0)})`))
    if (comparison.prev.orders > 0 || comparison.prev.revenue > 0) {
      lines.push(
        "",
        `vs período anterior: ingresos ${comparison.revenueDelta >= 0 ? "+" : ""}${comparison.revenueDelta.toFixed(0)}% · tickets ${comparison.ordersDelta >= 0 ? "+" : ""}${comparison.ordersDelta.toFixed(0)}% · ticket prom. ${comparison.avgDelta >= 0 ? "+" : ""}${comparison.avgDelta.toFixed(0)}%`,
      )
    }
    lines.push("", "📈 Registrado en resurte.me")
    navigator.clipboard.writeText(lines.join("\n"))
    toast("Reporte gerencial copiado", "success")
  }

  // ── Actions ────────────────────────────────────────────
  const handleAddEntry = (data: SaleFormData) => {
    const dish = sharedDishes.find((d) => d.id === data.dishId)
    if (!dish) {
      toast("Selecciona un platillo del menú costeado", "warning")
      return
    }
    const qty = data.qty
    if (qty <= 0) {
      toast("La cantidad debe ser mayor a 0", "error")
      return
    }
    if (!data.date) {
      toast("Selecciona una fecha", "warning")
      return
    }
    const unitCost = dishCost(dish.id)
    const mods = (dish.modificadores || []).filter((m) => data.mods.includes(m.id))
    const modTotal = mods.reduce((s, m) => s + m.precio, 0)
    const unitPrice = dish.sellingPrice + modTotal
    const discountValue = data.discountValue ? Math.max(0, parseFloat(data.discountValue) || 0) : 0
    // Loyalty redemption: convert points to a peso discount (monto)
    const redeemPts = data.redeemPts ? Math.max(0, parseInt(data.redeemPts) || 0) : 0
    const redeemValue = data.clienteId && redeemPts > 0 ? Math.min(redeemPts * puntosCanje, qty * unitPrice) : 0
    const entry: SaleEntry = {
      id: uid("sale"),
      dishId: dish.id,
      dishName: dish.name,
      quantity: qty,
      date: data.date,
      unitPrice,
      unitCost,
      paymentMethod: data.payment,
      channel: data.channel,
      clienteId: data.clienteId,
      mesaId: data.mesaId,
      modificadores: mods.length > 0 ? mods.map((m) => ({ nombre: m.nombre, precio: m.precio })) : undefined,
      discount: redeemValue > 0
        ? { type: "monto", value: redeemValue }
        : discountValue > 0 ? { type: data.discountType, value: discountValue } : undefined,
      createdAt: new Date().toISOString(),
    }
    const total = entryTotal(entry)

    // Gift card payment: validate the code covers the total and reduce its balance
    if (data.payment === "regalo") {
      const code = (data.giftCode || "").trim().toUpperCase()
      const card = tarjetas.find((t) => t.codigo === code && t.estado === "activa" && t.saldo > 0)
      if (!card) {
        toast("Código de tarjeta de regalo no válido o sin saldo", "warning")
        return
      }
      if (card.saldo < total) {
        toast(`El saldo de la tarjeta ($${card.saldo.toFixed(0)}) no cubre el total ($${total.toFixed(0)})`, "warning")
        return
      }
      setTarjetas((prev) =>
        prev.map((t) => {
          if (t.id !== card.id) return t
          const saldo = Math.max(0, t.saldo - total)
          return { ...t, saldo, estado: saldo <= 0 ? "agotada" : "activa" }
        }),
      )
    }

    setEntries((prev) => [...prev, entry])
    setSelectedDate(data.date)

    // Loyalty: accumulate points, visits and spend for the assigned client
    if (data.clienteId) {
      const total = entryTotal(entry)
      const earned = Math.floor(total / (puntosTasa > 0 ? puntosTasa : 100))
      setClientes((prev) =>
        prev.map((c) =>
          c.id === data.clienteId
            ? {
                ...c,
                puntos: Math.max(0, c.puntos + earned - redeemPts),
                visitas: c.visitas + 1,
                totalGastado: c.totalGastado + total,
              }
            : c,
        ),
      )
    }

    // Optional: deduct dish ingredients from inventory (opt-in)
    let deducted = 0
    if (deductStock) {
      const deductions = new Map<string, { itemId: string; itemName: string; neededQty: number }>()
      dish.ingredients.forEach((ing) => {
        const key = normalizeName(ing.ingredientName)
        if (!key) return
        const totalQty = (ing.quantity || 0) * qty
        if (totalQty <= 0) return
        const item = inventarioItems.find((i) => normalizeName(i.name) === key)
        if (!item) return
        // Convert the recipe quantity (in the ingredient's unit) to the inventory item's unit
        const neededQty = convertQty(totalQty, ing.unit || "g", item.unit) ?? totalQty
        deductions.set(item.id, {
          itemId: item.id,
          itemName: item.name,
          neededQty: (deductions.get(item.id)?.neededQty || 0) + neededQty,
        })
      })
      if (deductions.size > 0) {
        setInventarioItems((prev) =>
          prev.map((i) => {
            const d = deductions.get(i.id)
            return d ? { ...i, stock: Math.max(0, i.stock - d.neededQty) } : i
          })
        )
        const newMovements: StockMovementLike[] = Array.from(deductions.values()).map((d) => ({
          fecha: new Date().toISOString(),
          itemId: d.itemId,
          itemName: d.itemName,
          tipo: "salida",
          delta: -d.neededQty,
          motivo: `Venta: ${dish.name} ×${qty}`,
        }))
        setMovements((prev) => [...newMovements, ...prev].slice(0, 500))
      }
      deducted = deductions.size
    }

    if (deductStock) {
      toast(
        deducted > 0
          ? `${qty} × ${dish.name} registrado · ${deducted} insumo${deducted > 1 ? "s" : ""} descontado${deducted > 1 ? "s" : ""} del inventario`
          : `${qty} × ${dish.name} registrado (ningún ingrediente coincide con tu inventario)`,
        "success",
      )
    } else {
      toast(`${qty} × ${dish.name} registrado${qty > 1 ? "s" : ""}`, "success")
    }
  }

  const adjustQty = (id: string, delta: number) => {
    setEntries((prev) =>
      prev.map((e) => (e.id === id ? { ...e, quantity: Math.max(1, e.quantity + delta) } : e))
    )
  }

  const deleteEntry = (id: string) => {
    setEntries((prev) => prev.filter((e) => e.id !== id))
    // Remove the orphaned comanda status so it doesn't linger forever
    setComandaStatuses((prev) => {
      if (!(id in prev)) return prev
      const next = { ...prev }
      delete next[id]
      return next
    })
    setDeleteConfirm(null)
    toast("Venta eliminada", "warning")
  }

  // ── Clientes frecuentes ────────────────────────────────
  const saveCliente = () => {
    const name = clienteName.trim()
    if (!name) {
      toast("Escribe el nombre del cliente", "warning")
      return
    }
    const pts = Math.max(0, clientePts ? parseInt(clientePts) || 0 : 0)
    if (clienteEditId) {
      setClientes((prev) =>
        prev.map((c) =>
          c.id === clienteEditId
            ? { ...c, nombre: name, telefono: clientePhone.trim() || undefined, puntos: pts }
            : c,
        ),
      )
      toast("Cliente actualizado", "success")
    } else {
      setClientes((prev) => [
        ...prev,
        { id: uid("cliente"), nombre: name, telefono: clientePhone.trim() || undefined, puntos: pts, visitas: 0, totalGastado: 0, createdAt: new Date().toISOString() },
      ])
      toast("Cliente agregado", "success")
    }
    setClienteName("")
    setClientePhone("")
    setClientePts("")
    setClienteEditId(null)
  }

  const startEditCliente = (c: Cliente) => {
    setClienteEditId(c.id)
    setClienteName(c.nombre)
    setClientePhone(c.telefono || "")
    setClientePts(String(c.puntos))
  }

  const confirmDeleteCliente = () => {
    if (!clienteDeleteId) return
    setClientes((prev) => prev.filter((c) => c.id !== clienteDeleteId))
    setClienteDeleteId(null)
    toast("Cliente eliminado", "warning")
  }

  // ── Mesas CRUD ──────────────────────────────────────────
  const saveMesa = () => {
    const nombre = mesaName.trim()
    if (!nombre) {
      toast("Escribe el nombre de la mesa", "warning")
      return
    }
    const capacidad = Math.max(1, mesaCapacidad ? parseInt(mesaCapacidad) || 1 : 1)
    if (mesaEditId) {
      setMesas((prev) =>
        prev.map((m) => (m.id === mesaEditId ? { ...m, nombre, capacidad, zona: mesaZona.trim() || undefined } : m)),
      )
      toast("Mesa actualizada", "success")
    } else {
      setMesas((prev) => [...prev, { id: uid("mesa"), nombre, capacidad, zona: mesaZona.trim() || undefined }])
      toast("Mesa agregada", "success")
    }
    setMesaName("")
    setMesaCapacidad("")
    setMesaZona("")
    setMesaEditId(null)
  }

  const startEditMesa = (m: Mesa) => {
    setMesaEditId(m.id)
    setMesaName(m.nombre)
    setMesaCapacidad(String(m.capacidad))
    setMesaZona(m.zona || "")
  }

  const confirmDeleteMesa = () => {
    if (!mesaDeleteId) return
    setMesas((prev) => prev.filter((m) => m.id !== mesaDeleteId))
    setMesaDeleteId(null)
    toast("Mesa eliminada", "warning")
  }

  const confirmDeleteEmpleado = () => {
    if (!empDeleteId) return
    setEmpleados((prev) => prev.filter((e) => e.id !== empDeleteId))
    setEmpDeleteId(null)
    toast("Empleado eliminado", "warning")
  }

  const copyClientes = () => {
    if (clientes.length === 0) {
      toast("No hay clientes registrados", "warning")
      return
    }
    const header = `👥 Clientes frecuentes — ${selectedCollection?.name || ""}`
    const lines = clientes.map((c) => `${c.nombre}${c.telefono ? ` · ${c.telefono}` : ""} · ${c.puntos} pts · ${c.visitas} visitas · $${c.totalGastado.toFixed(0)}`)
    navigator.clipboard.writeText([header, ...lines].join("\n"))
    toast("Clientes copiados", "success")
  }

  const copySummary = () => {
    const header = `💰 Resumen de ventas — ${dateLabel(selectedDate)} (${selectedCollection?.name || ""})`
    const lines = [
      `Ingresos: $${dayStats.revenue.toFixed(0)}`,
      `Costo de venta: $${dayStats.cost.toFixed(0)}`,
      `Margen bruto: $${dayStats.margin.toFixed(0)}`,
      `Food cost real: ${dayStats.foodCost.toFixed(1)}%`,
      `Platillos vendidos: ${dayStats.units}`,
    ]
    if (dayStats.discount > 0) lines.push(`Descuentos otorgados: -$${dayStats.discount.toFixed(0)}`)
    const methods = methodBreakdown.filter((m) => m.count > 0)
    const methodLines = methods.length > 0
      ? ["", "Por método de pago:", ...methods.map((m) => `${m.icon} ${m.label}: $${m.revenue.toFixed(0)} (${m.count} venta${m.count > 1 ? "s" : ""})`)]
      : []
    const channels = channelBreakdown.filter((c) => c.count > 0)
    const channelLines = channels.length > 1
      ? ["", "Por canal:", ...channels.map((c) => `${c.icon} ${c.label}: $${c.revenue.toFixed(0)} (${c.count} venta${c.count > 1 ? "s" : ""})`)]
      : []
    const top = topSellers.length > 0
      ? ["", "Top ventas:", ...topSellers.map((t, i) => `${i + 1}. ${t.name} — ${t.qty} pz ($${t.revenue.toFixed(0)})`)]
      : []
    if (tipoCambio !== 1) lines.push(`Aprox. USD: $${(dayStats.revenue / tipoCambio).toFixed(2)}`)
    const clienteName = (id?: string) => clientes.find((c) => c.id === id)?.nombre || ""
    const mesaLabel = (id?: string) => mesas.find((m) => m.id === id)?.nombre || ""
    const entries = dayEntries.length > 0
      ? ["", "Ventas del día:", ...dayEntries.map((e, i) => {
          const mods = e.modificadores && e.modificadores.length > 0 ? ` [+${e.modificadores.map((m) => m.nombre).join(", ")}]` : ""
          const cli = e.clienteId ? ` · ${clienteName(e.clienteId)}` : ""
          const mesaTxt = e.mesaId && mesaLabel(e.mesaId) ? ` · 🪑 ${mesaLabel(e.mesaId)}` : ""
          return `${i + 1}. ${e.dishName}${mods} ×${e.quantity}${cli}${mesaTxt} — $${(e.unitPrice * e.quantity).toFixed(0)}`
        })]
      : []
    navigator.clipboard.writeText([header, ...lines, ...entries, ...methodLines, ...channelLines, ...top, "", "📈 Registrado en resurte.me"].join("\n"))
    toast("Resumen del día copiado", "success")
  }

  const copyCorte = () => {
    const lines = [
      `🧾 Corte de caja — ${dateLabel(selectedDate)} (${selectedCollection?.name || ""})`,
      "",
      ...methodBreakdown.filter((m) => m.count > 0)
        .map((m) => `${m.icon} ${m.label}: $${m.revenue.toFixed(0)} (${m.count} venta${m.count > 1 ? "s" : ""})`),
      ...(channelBreakdown.filter((c) => c.count > 0).length > 1
        ? ["", ...channelBreakdown.filter((c) => c.count > 0)
            .map((c) => `${c.icon} ${c.label}: $${c.revenue.toFixed(0)} (${c.count} venta${c.count > 1 ? "s" : ""})`)]
        : []),
      ...(dayStats.discount > 0 ? [`Descuentos otorgados: -$${dayStats.discount.toFixed(0)}`] : []),
      ...(comisionesHoy > 0 ? [`Comisiones por canal: -$${comisionesHoy.toFixed(0)}`] : []),
      ...(mesasOcupadasHoy.size > 0 ? [`Mesas ocupadas: ${mesasOcupadasHoy.size}`] : []),
      ...(tipoCambio !== 1 ? [`Aprox. USD: $${(dayStats.revenue / tipoCambio).toFixed(2)}`] : []),
      ...(dayEntries.some((e) => e.modificadores?.length) ? ["", "Con modificadores:", ...dayEntries.filter((e) => e.modificadores?.length).map((e) => `${e.dishName} [+${e.modificadores!.map((m) => m.nombre).join(", ")}] ×${e.quantity}`)] : []),
      "",
      `Total: $${dayStats.revenue.toFixed(0)} · ${dayStats.units} platillos`,
      "",
      "📈 Registrado en resurte.me",
    ]
    navigator.clipboard.writeText(lines.join("\n"))
    toast("Corte de caja copiado", "success")
  }

  const visibleEntries = showAll ? entries : dayEntries

  if (!selectedCollection) {
    return (
      <div className="text-center py-16">
        <Receipt className="w-12 h-12 text-gray-300 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-gray-700 mb-2">Selecciona tu tipo de cocina</h3>
        <p className="text-sm text-gray-400 max-w-md mx-auto">
          Selecciona tu tipo de restaurante para registrar tus ventas del día y conocer tu margen real.
        </p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <Link href="/panel" className="p-2 rounded-xl hover:bg-gray-100 transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-400" />
        </Link>
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-gray-900">{t("ventas.title")}</h2>
            {entries.length > 0 && (
              <button
                onClick={copySummary}
                className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded-lg transition-colors"
                title="Copiar resumen del día seleccionado"
                aria-label="Copiar resumen de ventas"
              >
                <Copy className="w-3.5 h-3.5" />
                Copiar resumen
              </button>
            )}
            <Link
              href="/panel/comanda"
              className="flex items-center gap-1.5 text-xs font-semibold text-orange-600 bg-orange-50 hover:bg-orange-100 px-2.5 py-1 rounded-lg transition-colors"
              title="Ver monitor de producción en cocina"
              aria-label="Abrir monitor de cocina"
            >
              <Flame className="w-3.5 h-3.5" />
              Monitor de cocina
            </Link>
          </div>
          <p className="text-sm text-gray-400">
            {selectedCollection.name} — registra tus ventas y conoce tu margen real
          </p>
        </div>
      </div>

      {sharedDishes.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 mb-6 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
          <div className="text-xs text-amber-800">
            <p className="font-semibold mb-0.5">Aún no tienes platillos costeados</p>
            <p>Costa tu menú primero para que las ventas calculen el costo real de cada platillo.</p>
          </div>
          <Link href="/panel/costeo" className="ml-auto text-xs font-semibold bg-amber-600 text-white px-3 py-1.5 rounded-lg hover:bg-amber-700 transition-colors shrink-0">
            Ir a Costeo
          </Link>
        </div>
      )}

      {/* ── Register sale form ───────────────────────────── */}
      <SaleForm
        sharedDishes={sharedDishes}
        entries={entries}
        clientes={clientes}
        mesas={mesas}
        puntosTasa={puntosTasa}
        puntosCanje={puntosCanje}
        deductStock={deductStock}
        dishCost={dishCost}
        dishPrice={dishPrice}
        onToggleDeductStock={setDeductStock}
        onAdd={handleAddEntry}
        onEscape={() => setDeleteConfirm(null)}
        toast={toast}
      />

      {/* ── Sales goals ──────────────────────────────────── */}
      <SalesGoals
        showGoals={showGoals}
        goalFormDia={goalFormDia}
        goalFormMes={goalFormMes}
        dailyGoal={dailyGoal}
        monthlyGoal={monthlyGoal}
        dayStats={dayStats}
        dailyGoalPct={dailyGoalPct}
        monthlyGoalPct={monthlyGoalPct}
        monthRevenue={monthRevenue}
        projectedRevenue={projectedRevenue}
        onPace={onPace}
        comisiones={comisiones}
        onToggle={() => {
          if (!showGoals) {
            setGoalFormDia(String(dailyGoal || ""))
            setGoalFormMes(String(monthlyGoal || ""))
          }
          setShowGoals(!showGoals)
        }}
        onGoalFormDiaChange={setGoalFormDia}
        onGoalFormMesChange={setGoalFormMes}
        onSave={saveGoals}
        onComisionChange={(key, value) =>
          setComisiones((prev) => ({ ...prev, [key]: Math.max(0, parseFloat(value) || 0) }))
        }
      />

      {/* ── Clientes frecuentes ──────────────────────────── */}
      <FrequentCustomers
        clientes={clientes}
        showClientes={showClientes}
        clienteName={clienteName}
        clientePhone={clientePhone}
        clientePts={clientePts}
        clienteEditId={clienteEditId}
        clienteDeleteId={clienteDeleteId}
        puntosTasa={puntosTasa}
        puntosCanje={puntosCanje}
        tipoCambio={tipoCambio}
        onCopy={copyClientes}
        onToggle={() => setShowClientes(!showClientes)}
        onNameChange={setClienteName}
        onPhoneChange={setClientePhone}
        onPtsChange={setClientePts}
        onSave={saveCliente}
        onCancel={() => {
          setClienteEditId(null)
          setClienteName("")
          setClientePhone("")
          setClientePts("")
        }}
        onEdit={startEditCliente}
        onDeleteClick={(id) => setClienteDeleteId(id)}
        onCancelDelete={() => setClienteDeleteId(null)}
        onConfirmDelete={confirmDeleteCliente}
        onPuntosTasaChange={setPuntosTasa}
        onPuntosCanjeChange={setPuntosCanje}
        onTipoCambioChange={setTipoCambio}
      />

      {/* ── Mesas del salón ──────────────────────────────── */}
      <DiningTables
        mesas={mesas}
        showMesas={showMesas}
        mesasOcupadasHoy={mesasOcupadasHoy}
        now={now}
        mesaName={mesaName}
        mesaCapacidad={mesaCapacidad}
        mesaZona={mesaZona}
        mesaEditId={mesaEditId}
        mesaDeleteId={mesaDeleteId}
        onToggle={() => setShowMesas(!showMesas)}
        onNameChange={setMesaName}
        onCapacidadChange={setMesaCapacidad}
        onZonaChange={setMesaZona}
        onSave={saveMesa}
        onCancel={() => {
          setMesaEditId(null)
          setMesaName("")
          setMesaCapacidad("")
          setMesaZona("")
        }}
        onEdit={startEditMesa}
        onDeleteClick={(id) => setMesaDeleteId(id)}
        onCancelDelete={() => setMesaDeleteId(null)}
        onConfirmDelete={confirmDeleteMesa}
      />

      {/* ── Reloj checador ───────────────────────────────── */}
      <RelojChecador
        showReloj={showReloj}
        empleadoCount={empleados.length}
        empleadosHoy={empleadosHoy}
        fichajesHoy={fichajesHoy}
        empNombre={empNombre}
        empRol={empRol}
        empTarifa={empTarifa}
        empEditId={empEditId}
        empDeleteId={empDeleteId}
        selectedDate={selectedDate}
        onToggle={() => setShowReloj(!showReloj)}
        onNombreChange={setEmpNombre}
        onRolChange={setEmpRol}
        onTarifaChange={setEmpTarifa}
        onSave={saveEmpleado}
        onCancel={() => {
          setEmpEditId(null)
          setEmpNombre("")
          setEmpRol("")
          setEmpTarifa("")
        }}
        onFicharEntrada={ficharEntrada}
        onFicharSalida={ficharSalida}
        onEdit={(e) => {
          setEmpEditId(e.id)
          setEmpNombre(e.nombre)
          setEmpRol(e.rol || "")
          setEmpTarifa(String(e.tarifa))
        }}
        onDeleteClick={(id) => setEmpDeleteId(id)}
        onCancelDelete={() => setEmpDeleteId(null)}
        onConfirmDelete={confirmDeleteEmpleado}
        onCopyHoras={copyHoras}
      />

      {/* ── Tarjetas de regalo ───────────────────────────── */}
      <GiftCards
        tarjetas={tarjetas}
        showTarjetas={showTarjetas}
        tarjetaMonto={tarjetaMonto}
        onToggle={() => setShowTarjetas(!showTarjetas)}
        onMontoChange={setTarjetaMonto}
        onEmitir={emitirTarjeta}
        onCopyCodigo={copyCodigoTarjeta}
      />

      {/* ── Antifraud alerts ─────────────────────────────── */}
      <AntifraudAlerts
        fraudAlerts={fraudAlerts}
        ticketThreshold={ticketThreshold}
        tipoCambio={tipoCambio}
        onTicketThresholdChange={setTicketThreshold}
        onTipoCambioChange={setTipoCambio}
      />

      {/* ── Day stats ────────────────────────────────────── */}
      <DayStats
        hasEntries={entries.length > 0}
        dayStats={dayStats}
        selectedDate={selectedDate}
        showAll={showAll}
        tipoCambio={tipoCambio}
        panelCfg={panelCfg}
        onDateChange={(v) => {
          setSelectedDate(v || todayStr())
          setShowAll(false)
        }}
        onToggleShowAll={() => setShowAll(!showAll)}
        onFocusFirstDish={() => document.getElementById("venta-dish")?.focus()}
      />

      {entries.length > 0 && (
        <>
          <CorteCaja
            methodBreakdown={methodBreakdown}
            revenue={dayStats.revenue}
            dayEntryCount={dayEntries.length}
            selectedDateLabel={dateLabel(selectedDate)}
            tipoCambio={tipoCambio}
            onCopy={copyCorte}
          />

          <ManagementReport
            reportPeriod={reportPeriod}
            reportStats={reportStats}
            reportEntries={reportEntries}
            reportMethods={reportMethods}
            reportChannels={reportChannels}
            reportTop={reportTop}
            comparison={comparison}
            tipoCambio={tipoCambio}
            onPeriodChange={setReportPeriod}
            onCopy={copyGerencial}
          />

          <div className="grid lg:grid-cols-2 gap-6 mb-6">
            <WeekTrend weekTrend={weekTrend} />
            <TopSellers
              topSellers={topSellers}
              totalUnits={dayStats.units}
              selectedDateLabel={dateLabel(selectedDate)}
            />
          </div>

          <EntriesList
            showAll={showAll}
            entriesCount={entries.length}
            dayEntriesCount={dayEntries.length}
            units={dayStats.units}
            selectedDateLabel={dateLabel(selectedDate)}
            visibleEntries={visibleEntries}
            clientes={clientes}
            dishCost={dishCost}
            onAdjustQty={adjustQty}
            onDeleteClick={(id) => setDeleteConfirm(id)}
          />
        </>
      )}

      {/* All-time tip */}
      <AllTimeTip
        hasEntries={entries.length > 0}
        allTimeStats={allTimeStats}
        foodCostRedAbove={panelCfg.foodCostRedAbove}
      />

      {/* Delete confirm */}
      <DeleteConfirmModal
        entryId={deleteConfirm}
        deductStock={deductStock}
        onCancel={() => setDeleteConfirm(null)}
        onConfirm={deleteEntry}
      />
    </div>
  )
}
