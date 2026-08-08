"use client"

import { useState, useMemo, useEffect } from "react"
import { useRestaurant } from "@/contexts/restaurant-context"
import { useLocalStorage, useSharedDishes } from "@/hooks/use-local-storage"
import { foodCostStatus, usePanelConfig } from "@/lib/panel-config"
import { useToast } from "@/components/toast"
import { normalizeName } from "@/lib/normalize"
import { uid } from "@/lib/ids"
import { convertQty } from "@/lib/panel-units"
import { t } from "@/lib/i18n/es"
import Link from "next/link"
import {
  ArrowLeft, Plus, Trash2, DollarSign, TrendingUp, Receipt,
  Copy, BarChart3, Target, ChevronUp, ChevronDown, AlertCircle, Landmark, Flame,
  AlertTriangle, ShieldAlert, Percent, Settings2, Check, Users, Gift,
  Clock, CreditCard, HandCoins, UtensilsCrossed,
} from "lucide-react"

interface SaleEntry {
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
}

interface Cliente {
  id: string
  nombre: string
  telefono?: string
  puntos: number
  visitas: number
  totalGastado: number
  createdAt: string
}

interface Mesa {
  id: string
  nombre: string
  capacidad: number
  zona?: string
}

interface Empleado {
  id: string
  nombre: string
  rol?: string
  tarifa: number
}

interface Fichaje {
  id: string
  empleadoId: string
  entrada: string // ISO timestamp
  salida?: string // ISO timestamp
}

interface TarjetaRegalo {
  id: string
  codigo: string
  monto: number
  saldo: number
  estado: "activa" | "agotada"
  creada: string
}

const PAYMENT_METHODS = [
  { key: "efectivo", label: "Efectivo", icon: "💵" },
  { key: "tarjeta", label: "Tarjeta", icon: "💳" },
  { key: "transferencia", label: "Transferencia", icon: "🏦" },
  { key: "regalo", label: "Regalo", icon: "🎁" },
] as const

type PaymentMethod = (typeof PAYMENT_METHODS)[number]["key"]

const SALE_CHANNELS = [
  { key: "comedor", label: "Comedor", icon: "🍽️" },
  { key: "rapido", label: "Rápido", icon: "⚡" },
  { key: "para-llevar", label: "Para llevar", icon: "🥡" },
  { key: "domicilio", label: "Domicilio", icon: "🛵" },
] as const

type SaleChannel = (typeof SALE_CHANNELS)[number]["key"]

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

function todayStr() {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${d.getFullYear()}-${m}-${day}`
}

function dateLabel(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00")
  const today = new Date()
  const yesterday = new Date(today.getTime() - 86400000)
  const same = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  if (same(d, today)) return "Hoy"
  if (same(d, yesterday)) return "Ayer"
  const meses = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]
  return `${d.getDate()} ${meses[d.getMonth()]}`
}

// Revenue of an entry after applying its optional discount.
function entryTotal(e: SaleEntry) {
  let total = e.quantity * e.unitPrice
  if (e.discount) {
    total -= e.discount.type === "porcentaje" ? (total * e.discount.value) / 100 : e.discount.value
  }
  return Math.max(0, total)
}

export default function VentasPage() {
  const { selectedCollection } = useRestaurant()
  const slug = selectedCollection?.slug || null
  const { toast } = useToast()
  const [sharedDishes] = useSharedDishes(slug)

  const [entries, setEntries] = useLocalStorage<SaleEntry[]>("ventas-entries", [], slug)
  const panelCfg = usePanelConfig(slug)
  const [inventarioItems, setInventarioItems] = useLocalStorage<InventoryItemLike[]>("inventario-items", [], slug)
  const [movements, setMovements] = useLocalStorage<StockMovementLike[]>("inventario-movimientos", [], slug)
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
  const [formDishId, setFormDishId] = useState("")
  const [formQty, setFormQty] = useState("1")
  const [formDate, setFormDate] = useState(todayStr())
  const [formPayment, setFormPayment] = useState<PaymentMethod>("efectivo")
  const [formChannel, setFormChannel] = useState<SaleChannel>("comedor")
  const [formDiscountType, setFormDiscountType] = useState<"monto" | "porcentaje">("monto")
  const [formDiscountValue, setFormDiscountValue] = useState("")
  const [formClienteId, setFormClienteId] = useState("")
  const [formRedeemPts, setFormRedeemPts] = useState("")
  const [formMods, setFormMods] = useState<string[]>([])
  const [formMesaId, setFormMesaId] = useState("")
  const [formGiftCode, setFormGiftCode] = useState("")
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
      const ts = e.createdAt ? Date.parse(e.createdAt) : Date.now()
      const prev = occupied.get(e.mesaId)
      if (prev == null || ts < prev) occupied.set(e.mesaId, ts)
    })
    return occupied
  }, [dayEntries])

  const freeMesasForForm = useMemo(() => {
    const used = new Set(entries.filter((e) => e.date === formDate && e.mesaId).map((e) => e.mesaId))
    return mesas.filter((m) => !used.has(m.id) || m.id === formMesaId)
  }, [entries, formDate, mesas, formMesaId])

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
      const out = f.salida ? Date.parse(f.salida) : Date.now()
      if (!f.salida) emp.abierto = true
      emp.minutos += Math.max(0, (out - t) / 60000)
    })
    const rows = Array.from(byEmp.values()).filter((r) => r.fichajes > 0)
    const totalMin = rows.reduce((s, r) => s + r.minutos, 0)
    const totalCosto = rows.reduce((s, r) => s + (r.minutos / 60) * r.tarifa, 0)
    return { rows, totalMin, totalCosto }
  }, [empleados, fichajes, selectedDate])

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
  const addEntry = () => {
    const dish = sharedDishes.find((d) => d.id === formDishId)
    if (!dish) {
      toast("Selecciona un platillo del menú costeado", "warning")
      return
    }
    const qty = parseInt(formQty) || 0
    if (qty <= 0) {
      toast("La cantidad debe ser mayor a 0", "error")
      return
    }
    if (!formDate) {
      toast("Selecciona una fecha", "warning")
      return
    }
    const unitCost = dishCost(dish.id)
    const mods = (dish.modificadores || []).filter((m) => formMods.includes(m.id))
    const modTotal = mods.reduce((s, m) => s + m.precio, 0)
    const unitPrice = dish.sellingPrice + modTotal
    const discountValue = formDiscountValue ? Math.max(0, parseFloat(formDiscountValue) || 0) : 0
    // Loyalty redemption: convert points to a peso discount (monto)
    const redeemPts = formRedeemPts ? Math.max(0, parseInt(formRedeemPts) || 0) : 0
    const redeemValue = formClienteId && redeemPts > 0 ? Math.min(redeemPts * puntosCanje, qty * unitPrice) : 0
    const entry: SaleEntry = {
      id: uid("sale"),
      dishId: dish.id,
      dishName: dish.name,
      quantity: qty,
      date: formDate,
      unitPrice,
      unitCost,
      paymentMethod: formPayment,
      channel: formChannel,
      clienteId: formClienteId || undefined,
      mesaId: formMesaId || undefined,
      modificadores: mods.length > 0 ? mods.map((m) => ({ nombre: m.nombre, precio: m.precio })) : undefined,
      discount: redeemValue > 0
        ? { type: "monto", value: redeemValue }
        : discountValue > 0 ? { type: formDiscountType, value: discountValue } : undefined,
      createdAt: new Date().toISOString(),
    }
    const total = entryTotal(entry)

    // Gift card payment: validate the code covers the total and reduce its balance
    if (formPayment === "regalo") {
      const code = formGiftCode.trim().toUpperCase()
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
    setSelectedDate(formDate)

    // Loyalty: accumulate points, visits and spend for the assigned client
    if (formClienteId) {
      const total = entryTotal(entry)
      const earned = Math.floor(total / (puntosTasa > 0 ? puntosTasa : 100))
      setClientes((prev) =>
        prev.map((c) =>
          c.id === formClienteId
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
    setFormRedeemPts("")
    setFormMods([])
    setFormDiscountValue("")
    setFormMesaId("")
    setFormGiftCode("")

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

  // Keyboard: Ctrl+N new sale, Escape closes confirm
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "n") {
        e.preventDefault()
        if (sharedDishes.length === 0) {
          toast("Primero costea tu menú para registrar una venta", "warning")
          return
        }
        setFormDishId(sharedDishes[0]?.id || "")
        setFormQty("1")
        setFormDate(todayStr())
        document.getElementById("venta-dish")?.focus()
      }
      if (e.key === "Escape") setDeleteConfirm(null)
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [sharedDishes])

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
      <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Plus className="w-4 h-4 text-[#108910]" />
          <h3 className="font-semibold text-gray-900 text-sm">Registrar venta</h3>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-1">Platillo</label>
            <select
              id="venta-dish"
              value={formDishId}
              onChange={(e) => setFormDishId(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm bg-white focus:outline-none focus:border-[#108910]"
            >
              <option value="">Seleccionar platillo…</option>
              {sharedDishes.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} — ${d.sellingPrice.toFixed(0)} · costo ${dishCost(d.id).toFixed(0)}
                </option>
              ))}
            </select>
          </div>
          <div className="w-24">
            <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-1">Cantidad</label>
            <input
              type="number"
              value={formQty}
              onChange={(e) => setFormQty(e.target.value)}
              min="1"
              className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm text-center focus:outline-none focus:border-[#108910]"
            />
          </div>
          <div className="w-40">
            <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-1">Fecha</label>
            <input
              type="date"
              value={formDate}
              onChange={(e) => setFormDate(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-[#108910]"
            />
          </div>
          <div className="w-36">
            <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-1">Canal</label>
            <select
              value={formChannel}
              onChange={(e) => setFormChannel(e.target.value as SaleChannel)}
              className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm bg-white focus:outline-none focus:border-[#108910]"
              aria-label="Canal de venta"
            >
              {SALE_CHANNELS.map((c) => (
                <option key={c.key} value={c.key}>{c.icon} {c.label}</option>
              ))}
            </select>
          </div>
          <div className="w-40">
            <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-1">Pago</label>
            <select
              value={formPayment}
              onChange={(e) => setFormPayment(e.target.value as PaymentMethod)}
              className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm bg-white focus:outline-none focus:border-[#108910]"
              aria-label="Método de pago"
            >
              {PAYMENT_METHODS.map((m) => (
                <option key={m.key} value={m.key}>{m.icon} {m.label}</option>
              ))}
            </select>
          </div>
          {mesas.length > 0 && (
            <div className="w-32">
              <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-1">Mesa</label>
              <select
                value={formMesaId}
                onChange={(e) => setFormMesaId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm bg-white focus:outline-none focus:border-[#108910]"
                aria-label="Mesa del salón"
              >
                <option value="">Sin mesa</option>
                {freeMesasForForm.map((m) => (
                  <option key={m.id} value={m.id}>🪑 {m.nombre}</option>
                ))}
              </select>
            </div>
          )}
          <div className="w-28">
            <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-1">Descuento</label>
            <select
              value={formDiscountType}
              onChange={(e) => setFormDiscountType(e.target.value as "monto" | "porcentaje")}
              className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm bg-white focus:outline-none focus:border-[#108910]"
              aria-label="Tipo de descuento"
            >
              <option value="monto">$ Monto</option>
              <option value="porcentaje">%</option>
            </select>
          </div>
          <div className="w-24">
            <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-1">Valor</label>
            <input
              type="number"
              value={formDiscountValue}
              onChange={(e) => setFormDiscountValue(e.target.value)}
              min="0"
              placeholder="0"
              className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm text-center focus:outline-none focus:border-[#108910]"
              aria-label="Valor del descuento"
            />
          </div>
          <button
            onClick={addEntry}
            disabled={!formDishId}
            className="flex items-center gap-1.5 px-4 py-2 bg-[#108910] text-white text-sm font-semibold rounded-xl hover:bg-green-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="w-4 h-4" />
            Registrar
          </button>
        </div>
        {formPayment === "regalo" && (
          <div className="mt-3">
            <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-1">Código de tarjeta de regalo</label>
            <input
              type="text"
              value={formGiftCode}
              onChange={(e) => setFormGiftCode(e.target.value.toUpperCase())}
              placeholder="RT-XXXX-XXXX"
              className="w-full max-w-xs px-3 py-2 rounded-xl border border-gray-200 text-sm uppercase focus:outline-none focus:border-[#108910]"
              aria-label="Código de tarjeta de regalo"
            />
            <p className="text-[10px] text-gray-400 mt-1">El saldo de la tarjeta debe cubrir el total de la venta.</p>
          </div>
        )}
        {formDishId && (() => {
          const dish = sharedDishes.find((d) => d.id === formDishId)
          const mods = dish?.modificadores || []
          const activeMods = mods.filter((m) => formMods.includes(m.id))
          const modTotal = activeMods.reduce((s, m) => s + m.precio, 0)
          const subtotal = (parseInt(formQty) || 1) * (dishPrice(formDishId) + modTotal)
          const redeemPts = formRedeemPts ? Math.max(0, parseInt(formRedeemPts) || 0) : 0
          const redeemValue = formClienteId && redeemPts > 0 ? Math.min(redeemPts * puntosCanje, subtotal) : 0
          const discountValue = Math.max(0, parseFloat(formDiscountValue) || 0)
          const total = redeemValue > 0 ? subtotal - redeemValue : formDiscountType === "porcentaje" ? subtotal * (1 - discountValue / 100) : subtotal - discountValue
          return (
            <>
              <p className="text-[10px] text-gray-400 mt-2">
                El precio y costo se toman del platillo costeado (
                <>
                  subtotal ${subtotal.toFixed(0)}
                  {modTotal > 0 && <span className="text-amber-600 font-semibold"> (modificadores +${modTotal.toFixed(0)})</span>}
                  {(redeemValue > 0 || discountValue > 0) && <> → <span className="text-red-500 font-semibold">${Math.max(0, total).toFixed(0)}</span></>}
                  {` · costo $${(dishCost(formDishId) * (parseInt(formQty) || 1)).toFixed(0)}`}
                </>
                ).
              </p>
              {mods.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {mods.map((m) => {
                    const active = formMods.includes(m.id)
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() =>
                          setFormMods((prev) =>
                            active ? prev.filter((x) => x !== m.id) : [...prev, m.id],
                          )
                        }
                        className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors ${
                          active
                            ? "bg-[#108910] text-white border-[#108910]"
                            : "bg-gray-50 text-gray-600 border-gray-200 hover:border-[#108910]"
                        }`}
                        aria-pressed={active}
                      >
                        {active ? "✓ " : "+ "}{m.nombre} {m.precio > 0 ? `+$${m.precio.toFixed(0)}` : ""}
                      </button>
                    )
                  })}
                </div>
              )}
            </>
          )
        })()}
        <div className="flex flex-wrap gap-3 mt-3">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-1">Cliente frecuente</label>
            <select
              value={formClienteId}
              onChange={(e) => { setFormClienteId(e.target.value); setFormRedeemPts("") }}
              className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm bg-white focus:outline-none focus:border-[#108910]"
              aria-label="Cliente frecuente"
            >
              <option value="">Sin cliente</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>{c.nombre} · {c.puntos} pts</option>
              ))}
            </select>
          </div>
          {formClienteId && (
            <div className="w-36">
              <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-1">Redimir puntos</label>
              <input
                type="number"
                value={formRedeemPts}
                onChange={(e) => setFormRedeemPts(e.target.value)}
                min="0"
                placeholder={`Máx ${(() => clientes.find((c) => c.id === formClienteId)?.puntos || 0)()} pts`}
                className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm text-center focus:outline-none focus:border-[#108910]"
                aria-label="Puntos a redimir"
              />
            </div>
          )}
          <div className="flex items-end text-[11px] text-gray-400 pb-2">
            <span>1 pt = ${puntosTasa.toFixed(0)} MXN · canje $1 = {puntosCanje.toFixed(0)} MXN</span>
          </div>
        </div>
        <label className="flex items-start gap-2 mt-3 text-[11px] text-gray-500 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={deductStock}
            onChange={(e) => setDeductStock(e.target.checked)}
            className="mt-0.5 accent-[#108910]"
          />
          <span>
            <span className="font-semibold text-gray-700">Descontar insumos del inventario al vender</span>
            <span className="block text-[10px] text-gray-400">
              Al registrar, resta los ingredientes del platillo (kg) del stock y lo registra como salida en el inventario. Al eliminar una venta no se repone el stock.
            </span>
          </span>
        </label>
      </div>

      {/* ── Sales goals ──────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Target className="w-4 h-4 text-[#108910]" />
          <h3 className="text-sm font-semibold text-gray-900">Metas de venta</h3>
          <button
            onClick={() => {
              if (!showGoals) {
                setGoalFormDia(String(dailyGoal || ""))
                setGoalFormMes(String(monthlyGoal || ""))
              }
              setShowGoals(!showGoals)
            }}
            className="ml-auto flex items-center gap-1.5 text-xs font-semibold text-gray-500 bg-gray-50 hover:bg-gray-100 px-2.5 py-1 rounded-lg transition-colors"
            title={showGoals ? "Cerrar edición" : "Editar metas diaria y mensual"}
            aria-label="Editar metas de venta"
          >
            <Settings2 className="w-3.5 h-3.5" />
            {showGoals ? "Cerrar" : "Editar metas"}
          </button>
        </div>

        {showGoals ? (
          <>
          <div className="grid sm:grid-cols-[1fr_1fr_auto] gap-3 items-end">
            <div>
              <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-1">Meta diaria ($)</label>
              <input
                type="number"
                value={goalFormDia}
                onChange={(e) => setGoalFormDia(e.target.value)}
                min="0"
                placeholder="Ej. 12000"
                className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-[#108910]"
                aria-label="Meta de venta diaria"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-1">Meta mensual ($)</label>
              <input
                type="number"
                value={goalFormMes}
                onChange={(e) => setGoalFormMes(e.target.value)}
                min="0"
                placeholder="Ej. 360000"
                className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-[#108910]"
                aria-label="Meta de venta mensual"
              />
            </div>
            <button
              onClick={saveGoals}
              className="flex items-center justify-center gap-1.5 px-4 py-2 bg-[#108910] text-white text-xs font-semibold rounded-xl hover:bg-green-800 transition-colors"
            >
              <Check className="w-3.5 h-3.5" />
              Guardar
            </button>
          </div>
          <div className="mt-4 pt-4 border-t border-gray-100">
            <p className="text-[10px] font-semibold text-gray-400 uppercase mb-2">Comisiones por canal (%)</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {SALE_CHANNELS.map((c) => (
                <label key={c.key} className="block">
                  <span className="block text-[10px] text-gray-500 mb-1">{c.icon} {c.label}</span>
                  <input
                    type="number"
                    value={comisiones[c.key] || 0}
                    onChange={(e) => setComisiones((prev) => ({ ...prev, [c.key]: Math.max(0, parseFloat(e.target.value) || 0) }))}
                    min="0"
                    step="0.5"
                    className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-xs bg-white focus:outline-none focus:border-[#108910]"
                    aria-label={`Comisión por canal ${c.label}`}
                  />
                </label>
              ))}
            </div>
            <p className="text-[10px] text-gray-400 mt-1.5">
              <HandCoins className="w-3 h-3 inline-block mr-1 text-[#108910]" />
              Se calcula sobre los ingresos del día/período según el canal de cada venta.
            </p>
          </div>
          </>
        ) : (
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <div className="flex items-baseline justify-between mb-1.5">
                <span className="text-xs font-medium text-gray-500">Meta diaria</span>
                <span className="text-xs text-gray-400">
                  {dailyGoal > 0 ? `$${dayStats.revenue.toFixed(0)} / $${dailyGoal.toFixed(0)}` : "Sin meta"}
                </span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    dailyGoalPct >= 100 ? "bg-green-500" : dailyGoalPct >= 50 ? "bg-amber-500" : "bg-[#108910]"
                  }`}
                  style={{ width: `${Math.min(dailyGoalPct, 100)}%` }}
                />
              </div>
              <p className="text-[10px] text-gray-400 mt-1.5">
                {dailyGoal > 0
                  ? `${dailyGoalPct.toFixed(0)}% · Proyección a cierre: $${projectedRevenue.toFixed(0)} ${
                      onPace ? "✅ En ritmo" : "⚠️ Atrasado"
                    }`
                  : "Define una meta para ver tu progreso del día."}
              </p>
            </div>
            <div>
              <div className="flex items-baseline justify-between mb-1.5">
                <span className="text-xs font-medium text-gray-500">Meta mensual</span>
                <span className="text-xs text-gray-400">
                  {monthlyGoal > 0 ? `$${monthRevenue.toFixed(0)} / $${monthlyGoal.toFixed(0)}` : "Sin meta"}
                </span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    monthlyGoalPct >= 100 ? "bg-green-500" : monthlyGoalPct >= 50 ? "bg-amber-500" : "bg-[#108910]"
                  }`}
                  style={{ width: `${Math.min(monthlyGoalPct, 100)}%` }}
                />
              </div>
              <p className="text-[10px] text-gray-400 mt-1.5">
                {monthlyGoal > 0
                  ? `${monthlyGoalPct.toFixed(0)}% del mes · te faltan $${Math.max(0, monthlyGoal - monthRevenue).toFixed(0)}`
                  : "Define una meta para seguir tu avance mensual."}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── Clientes frecuentes ──────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Users className="w-4 h-4 text-[#108910]" />
          <h3 className="text-sm font-semibold text-gray-900">Clientes frecuentes</h3>
          {clientes.length > 0 && (
            <span className="text-[10px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full font-medium">
              {clientes.length} cliente{clientes.length !== 1 ? "s" : ""}
            </span>
          )}
          <button
            onClick={copyClientes}
            className="ml-auto flex items-center gap-1.5 text-xs font-semibold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded-lg transition-colors"
            title="Copiar lista de clientes"
            aria-label="Copiar clientes frecuentes"
          >
            <Copy className="w-3.5 h-3.5" />
            Copiar clientes
          </button>
          <button
            onClick={() => setShowClientes(!showClientes)}
            className="flex items-center gap-1 text-xs font-semibold text-gray-500 bg-gray-50 hover:bg-gray-100 px-2.5 py-1 rounded-lg transition-colors"
            aria-expanded={showClientes}
            aria-label="Mostrar u ocultar clientes frecuentes"
          >
            <Settings2 className="w-3.5 h-3.5" />
            {showClientes ? "Cerrar" : "Gestionar"}
          </button>
        </div>

        {showClientes && (
          <div className="space-y-4">
            <div className="grid sm:grid-cols-3 gap-3 items-end">
              <div>
                <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-1">Nombre</label>
                <input
                  type="text"
                  value={clienteName}
                  onChange={(e) => setClienteName(e.target.value)}
                  placeholder={clienteEditId ? "Editar nombre…" : "Ej. María López"}
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-[#108910]"
                  aria-label="Nombre del cliente"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-1">Teléfono</label>
                <input
                  type="text"
                  value={clientePhone}
                  onChange={(e) => setClientePhone(e.target.value)}
                  placeholder="Opcional"
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-[#108910]"
                  aria-label="Teléfono del cliente"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-1">Puntos iniciales</label>
                <input
                  type="number"
                  value={clientePts}
                  onChange={(e) => setClientePts(e.target.value)}
                  min="0"
                  placeholder="0"
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm text-center focus:outline-none focus:border-[#108910]"
                  aria-label="Puntos iniciales del cliente"
                />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={saveCliente}
                className="flex items-center gap-1.5 px-4 py-2 bg-[#108910] text-white text-xs font-semibold rounded-xl hover:bg-green-800 transition-colors"
              >
                <Check className="w-3.5 h-3.5" />
                {clienteEditId ? "Guardar cambios" : "Agregar cliente"}
              </button>
              {clienteEditId && (
                <button
                  onClick={() => { setClienteEditId(null); setClienteName(""); setClientePhone(""); setClientePts("") }}
                  className="text-xs font-semibold text-gray-500 hover:text-gray-700"
                >
                  Cancelar
                </button>
              )}
              <div className="ml-auto flex flex-wrap gap-3 items-end">
                <label className="block">
                  <span className="block text-[10px] font-semibold text-gray-400 uppercase mb-1">$ por punto (tasa)</span>
                  <input
                    type="number"
                    value={puntosTasa}
                    onChange={(e) => setPuntosTasa(Math.max(1, parseFloat(e.target.value) || 0))}
                    min="1"
                    className="w-24 px-2 py-1.5 rounded-lg border border-gray-200 text-xs bg-white focus:outline-none focus:border-[#108910]"
                    aria-label="Pesos por punto al ganar"
                  />
                </label>
                <label className="block">
                  <span className="block text-[10px] font-semibold text-gray-400 uppercase mb-1">Valor por punto (canje)</span>
                  <input
                    type="number"
                    value={puntosCanje}
                    onChange={(e) => setPuntosCanje(Math.max(0, parseFloat(e.target.value) || 0))}
                    min="0"
                    step="0.5"
                    className="w-24 px-2 py-1.5 rounded-lg border border-gray-200 text-xs bg-white focus:outline-none focus:border-[#108910]"
                    aria-label="Pesos por punto al canjear"
                  />
                </label>
                <label className="block">
                  <span className="block text-[10px] font-semibold text-gray-400 uppercase mb-1">Tipo de cambio MXN/USD</span>
                  <input
                    type="number"
                    value={tipoCambio}
                    onChange={(e) => setTipoCambio(Math.max(0, parseFloat(e.target.value) || 0))}
                    min="0"
                    step="0.01"
                    className="w-24 px-2 py-1.5 rounded-lg border border-gray-200 text-xs bg-white focus:outline-none focus:border-[#108910]"
                    aria-label="Tipo de cambio MXN a USD"
                  />
                </label>
              </div>
            </div>
            {clientes.length === 0 ? (
              <p className="text-[11px] text-gray-400">Aún no registras clientes frecuentes. Agrega el primero para empezar a acumular puntos por compra.</p>
            ) : (
              <div className="border-t border-gray-100 pt-3">
                <ul className="divide-y divide-gray-50">
                  {clientes.map((c) => (
                    <li key={c.id} className="flex items-center gap-3 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-gray-800 truncate">{c.nombre}</p>
                        <p className="text-[10px] text-gray-400">
                          {c.telefono ? `${c.telefono} · ` : ""}{c.visitas} visita{c.visitas !== 1 ? "s" : ""} · ${c.totalGastado.toFixed(0)} gastados
                        </p>
                      </div>
                      <span className={`flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-lg ${c.puntos >= 500 ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>
                        <Gift className="w-3.5 h-3.5" />
                        {c.puntos} pts
                      </span>
                      <button
                        onClick={() => startEditCliente(c)}
                        className="p-1.5 text-gray-400 hover:text-[#108910] rounded-lg hover:bg-emerald-50 transition-colors"
                        title="Editar cliente"
                        aria-label={`Editar a ${c.nombre}`}
                      >
                        <Settings2 className="w-4 h-4" />
                      </button>
                      {clienteDeleteId === c.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={confirmDeleteCliente}
                            className="px-2 py-1 text-[10px] font-semibold text-white bg-red-500 rounded-lg hover:bg-red-600"
                          >
                            Sí
                          </button>
                          <button
                            onClick={() => setClienteDeleteId(null)}
                            className="px-2 py-1 text-[10px] font-semibold text-gray-500 bg-gray-100 rounded-lg hover:bg-gray-200"
                          >
                            No
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setClienteDeleteId(c.id)}
                          className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors"
                          title="Eliminar cliente"
                          aria-label={`Eliminar a ${c.nombre}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Mesas del salón ──────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <UtensilsCrossed className="w-4 h-4 text-[#108910]" />
          <h3 className="text-sm font-semibold text-gray-900">Mesas del salón</h3>
          {mesas.length > 0 && (
            <span className="text-[10px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full font-medium">
              {mesasOcupadasHoy.size} ocupada{mesasOcupadasHoy.size !== 1 ? "s" : ""} de {mesas.length}
            </span>
          )}
          <button
            onClick={() => setShowMesas(!showMesas)}
            className="ml-auto flex items-center gap-1 text-xs font-semibold text-gray-500 bg-gray-50 hover:bg-gray-100 px-2.5 py-1 rounded-lg transition-colors"
            aria-expanded={showMesas}
            aria-label="Mostrar u ocultar mesas del salón"
          >
            <Settings2 className="w-3.5 h-3.5" />
            {showMesas ? "Cerrar" : "Gestionar"}
          </button>
        </div>

        {showMesas && (
          <div className="space-y-4">
            <div className="grid sm:grid-cols-3 gap-3 items-end">
              <div>
                <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-1">Nombre</label>
                <input
                  type="text"
                  value={mesaName}
                  onChange={(e) => setMesaName(e.target.value)}
                  placeholder={mesaEditId ? "Editar nombre…" : "Ej. Mesa 3"}
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-[#108910]"
                  aria-label="Nombre de la mesa"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-1">Capacidad</label>
                <input
                  type="number"
                  value={mesaCapacidad}
                  onChange={(e) => setMesaCapacidad(e.target.value)}
                  min="1"
                  placeholder="4"
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm text-center focus:outline-none focus:border-[#108910]"
                  aria-label="Capacidad de la mesa"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-1">Zona</label>
                <input
                  type="text"
                  value={mesaZona}
                  onChange={(e) => setMesaZona(e.target.value)}
                  placeholder="Opcional · Ej. Terraza"
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-[#108910]"
                  aria-label="Zona de la mesa"
                />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={saveMesa}
                className="flex items-center gap-1.5 px-4 py-2 bg-[#108910] text-white text-xs font-semibold rounded-xl hover:bg-green-800 transition-colors"
              >
                <Check className="w-3.5 h-3.5" />
                {mesaEditId ? "Guardar cambios" : "Agregar mesa"}
              </button>
              {mesaEditId && (
                <button
                  onClick={() => { setMesaEditId(null); setMesaName(""); setMesaCapacidad(""); setMesaZona("") }}
                  className="text-xs font-semibold text-gray-500 hover:text-gray-700"
                >
                  Cancelar
                </button>
              )}
            </div>
            {mesas.length === 0 ? (
              <p className="text-[11px] text-gray-400">Aún no registras mesas. Agrégalas para asignarlas a tus ventas y ver la ocupación del día.</p>
            ) : (
              <div className="border-t border-gray-100 pt-3">
                <ul className="divide-y divide-gray-50">
                  {mesas.map((m) => {
                    const firstTs = mesasOcupadasHoy.get(m.id)
                    const ocupada = firstTs != null
                    const mins = ocupada ? Math.max(1, Math.round((Date.now() - firstTs) / 60000)) : 0
                    return (
                      <li key={m.id} className="flex items-center gap-3 py-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-gray-800 truncate">🪑 {m.nombre}</p>
                          <p className="text-[10px] text-gray-400">
                            {m.zona ? `${m.zona} · ` : ""}Cap. {m.capacidad}
                          </p>
                        </div>
                        {ocupada ? (
                          <span className="text-[10px] font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-full shrink-0">
                            Ocupada · {Math.floor(mins / 60)}h {mins % 60}min
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold text-green-700 bg-green-50 px-2 py-0.5 rounded-full shrink-0">
                            Libre
                          </span>
                        )}
                        <button
                          onClick={() => startEditMesa(m)}
                          className="p-1.5 text-gray-400 hover:text-[#108910] rounded-lg hover:bg-emerald-50 transition-colors"
                          title="Editar mesa"
                          aria-label={`Editar mesa ${m.nombre}`}
                        >
                          <Settings2 className="w-4 h-4" />
                        </button>
                        {mesaDeleteId === m.id ? (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={confirmDeleteMesa}
                              className="px-2 py-1 text-[10px] font-semibold text-white bg-red-500 rounded-lg hover:bg-red-600"
                            >
                              Sí
                            </button>
                            <button
                              onClick={() => setMesaDeleteId(null)}
                              className="px-2 py-1 text-[10px] font-semibold text-gray-500 bg-gray-100 rounded-lg hover:bg-gray-200"
                            >
                              No
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setMesaDeleteId(m.id)}
                            className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors"
                            title="Eliminar mesa"
                            aria-label={`Eliminar mesa ${m.nombre}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Reloj checador ───────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Clock className="w-4 h-4 text-[#108910]" />
          <h3 className="text-sm font-semibold text-gray-900">Reloj checador</h3>
          {empleados.length > 0 && (
            <span className="text-[10px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full font-medium">
              {empleados.length} empleado{empleados.length !== 1 ? "s" : ""}
            </span>
          )}
          <button
            onClick={() => setShowReloj(!showReloj)}
            className="ml-auto flex items-center gap-1 text-xs font-semibold text-gray-500 bg-gray-50 hover:bg-gray-100 px-2.5 py-1 rounded-lg transition-colors"
            aria-expanded={showReloj}
            aria-label="Mostrar u ocultar reloj checador"
          >
            <Settings2 className="w-3.5 h-3.5" />
            {showReloj ? "Cerrar" : "Gestionar"}
          </button>
        </div>

        {showReloj && (
          <div className="space-y-4">
            <div className="grid sm:grid-cols-3 gap-3 items-end">
              <div>
                <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-1">Nombre</label>
                <input
                  type="text"
                  value={empNombre}
                  onChange={(e) => setEmpNombre(e.target.value)}
                  placeholder={empEditId ? "Editar nombre…" : "Ej. Juan Pérez"}
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-[#108910]"
                  aria-label="Nombre del empleado"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-1">Rol</label>
                <input
                  type="text"
                  value={empRol}
                  onChange={(e) => setEmpRol(e.target.value)}
                  placeholder="Opcional · Ej. Mesero"
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-[#108910]"
                  aria-label="Rol del empleado"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-1">Tarifa por hora ($)</label>
                <input
                  type="number"
                  value={empTarifa}
                  onChange={(e) => setEmpTarifa(e.target.value)}
                  min="0"
                  placeholder="Ej. 60"
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm text-center focus:outline-none focus:border-[#108910]"
                  aria-label="Tarifa por hora del empleado"
                />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={saveEmpleado}
                className="flex items-center gap-1.5 px-4 py-2 bg-[#108910] text-white text-xs font-semibold rounded-xl hover:bg-green-800 transition-colors"
              >
                <Check className="w-3.5 h-3.5" />
                {empEditId ? "Guardar cambios" : "Agregar empleado"}
              </button>
              {empEditId && (
                <button
                  onClick={() => { setEmpEditId(null); setEmpNombre(""); setEmpRol(""); setEmpTarifa("") }}
                  className="text-xs font-semibold text-gray-500 hover:text-gray-700"
                >
                  Cancelar
                </button>
              )}
            </div>
            {empleados.length === 0 ? (
              <p className="text-[11px] text-gray-400">Aún no registras empleados. Agrégalos para fichar entradas y salidas.</p>
            ) : (
              <div className="border-t border-gray-100 pt-3">
                <ul className="divide-y divide-gray-50">
                  {empleadosHoy.map((e) => (
                    <li key={e.id} className="flex items-center gap-3 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-gray-800 truncate">
                          {e.nombre}
                          {e.abierto && <span className="ml-2 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full">en turno</span>}
                        </p>
                        <p className="text-[10px] text-gray-400">
                          {e.rol ? `${e.rol} · ` : ""}hoy {Math.floor(e.minutos / 60)}h {Math.round(e.minutos % 60)}min · ${((e.minutos / 60) * e.tarifa).toFixed(0)}
                        </p>
                      </div>
                      <button
                        onClick={() => ficharEntrada(e.id)}
                        className="px-2.5 py-1.5 text-[10px] font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors"
                        aria-label={`Fichar entrada de ${e.nombre}`}
                      >
                        ⏱ Entrada
                      </button>
                      <button
                        onClick={() => ficharSalida(e.id)}
                        disabled={!e.abierto}
                        className="px-2.5 py-1.5 text-[10px] font-semibold text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        aria-label={`Fichar salida de ${e.nombre}`}
                      >
                        Salida
                      </button>
                      <button
                        onClick={() => { setEmpEditId(e.id); setEmpNombre(e.nombre); setEmpRol(e.rol || ""); setEmpTarifa(String(e.tarifa)) }}
                        className="p-1.5 text-gray-400 hover:text-[#108910] rounded-lg hover:bg-emerald-50 transition-colors"
                        title="Editar empleado"
                        aria-label={`Editar a ${e.nombre}`}
                      >
                        <Settings2 className="w-4 h-4" />
                      </button>
                      {empDeleteId === e.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={confirmDeleteEmpleado}
                            className="px-2 py-1 text-[10px] font-semibold text-white bg-red-500 rounded-lg hover:bg-red-600"
                          >
                            Sí
                          </button>
                          <button
                            onClick={() => setEmpDeleteId(null)}
                            className="px-2 py-1 text-[10px] font-semibold text-gray-500 bg-gray-100 rounded-lg hover:bg-gray-200"
                          >
                            No
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setEmpDeleteId(e.id)}
                          className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors"
                          title="Eliminar empleado"
                          aria-label={`Eliminar a ${e.nombre}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {fichajesHoy.rows.length > 0 && (
              <div className="border-t border-gray-100 pt-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase">Resumen de {dateLabel(selectedDate)}</p>
                  <button
                    onClick={copyHoras}
                    className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded-lg transition-colors"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    Copiar reporte de horas
                  </button>
                </div>
                <ul className="space-y-1.5">
                  {fichajesHoy.rows.map((r) => (
                    <li key={r.nombre} className="flex items-center justify-between text-xs">
                      <span className="text-gray-600">{r.nombre}{r.rol ? ` · ${r.rol}` : ""}</span>
                      <span className="text-gray-500">
                        {Math.floor(r.minutos / 60)}h {Math.round(r.minutos % 60)}min · ${((r.minutos / 60) * r.tarifa).toFixed(0)}{r.abierto ? " (en curso)" : ""}
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100">
                  <span className="text-xs font-semibold text-gray-500">Total</span>
                  <span className="text-xs font-bold text-gray-800">
                    {Math.floor(fichajesHoy.totalMin / 60)}h {Math.round(fichajesHoy.totalMin % 60)}min · ${fichajesHoy.totalCosto.toFixed(0)}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Tarjetas de regalo ───────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <CreditCard className="w-4 h-4 text-[#108910]" />
          <h3 className="text-sm font-semibold text-gray-900">Tarjetas de regalo</h3>
          {tarjetas.length > 0 && (
            <span className="text-[10px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full font-medium">
              {tarjetas.length} tarjeta{tarjetas.length !== 1 ? "s" : ""}
            </span>
          )}
          <button
            onClick={() => setShowTarjetas(!showTarjetas)}
            className="ml-auto flex items-center gap-1 text-xs font-semibold text-gray-500 bg-gray-50 hover:bg-gray-100 px-2.5 py-1 rounded-lg transition-colors"
            aria-expanded={showTarjetas}
            aria-label="Mostrar u ocultar tarjetas de regalo"
          >
            <Settings2 className="w-3.5 h-3.5" />
            {showTarjetas ? "Cerrar" : "Gestionar"}
          </button>
        </div>

        {showTarjetas && (
          <div className="space-y-4">
            <div className="flex items-end gap-3">
              <div className="w-40">
                <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-1">Monto ($)</label>
                <input
                  type="number"
                  value={tarjetaMonto}
                  onChange={(e) => setTarjetaMonto(e.target.value)}
                  min="1"
                  placeholder="Ej. 500"
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm text-center focus:outline-none focus:border-[#108910]"
                  aria-label="Monto de la tarjeta de regalo"
                />
              </div>
              <button
                onClick={emitirTarjeta}
                className="flex items-center gap-1.5 px-4 py-2 bg-[#108910] text-white text-xs font-semibold rounded-xl hover:bg-green-800 transition-colors"
              >
                <Gift className="w-3.5 h-3.5" />
                Emitir tarjeta
              </button>
            </div>
            {tarjetas.length === 0 ? (
              <p className="text-[11px] text-gray-400">Aún no emites tarjetas de regalo. Al emitir una, podrás usarla como método de pago "Regalo" en tus ventas.</p>
            ) : (
              <div className="border-t border-gray-100 pt-3">
                <ul className="divide-y divide-gray-50">
                  {tarjetas.map((t) => (
                    <li key={t.id} className="flex items-center gap-3 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-gray-800 font-mono truncate">{t.codigo}</p>
                        <p className="text-[10px] text-gray-400">Emitida el {new Date(t.creada).toLocaleDateString("es-MX")}</p>
                      </div>
                      <span className={`text-xs font-bold shrink-0 ${t.estado === "activa" ? "text-emerald-700" : "text-gray-400"}`}>
                        ${t.saldo.toFixed(0)} / ${t.monto.toFixed(0)}
                      </span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${t.estado === "activa" ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                        {t.estado === "activa" ? "Activa" : "Agotada"}
                      </span>
                      <button
                        onClick={() => copyCodigoTarjeta(t.codigo)}
                        className="p-1.5 text-gray-400 hover:text-[#108910] rounded-lg hover:bg-emerald-50 transition-colors shrink-0"
                        title="Copiar código"
                        aria-label={`Copiar código de ${t.codigo}`}
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Antifraud alerts ─────────────────────────────── */}
      {fraudAlerts.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-5 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <ShieldAlert className="w-4 h-4 text-red-600" />
            <h3 className="text-sm font-semibold text-red-800">
              Posibles ventas irregulares ({fraudAlerts.length})
            </h3>
            <div className="ml-auto flex items-center gap-3">
              <label className="flex items-center gap-1.5 text-[10px] font-semibold text-red-400 uppercase">
                Umbral ticket $
                <input
                  id="ventas-umbral"
                  type="number"
                  value={ticketThreshold}
                  onChange={(e) => setTicketThreshold(Math.max(0, parseFloat(e.target.value) || 0))}
                  min="0"
                  className="w-20 px-2 py-1 rounded-lg border border-red-200 text-xs bg-white focus:outline-none focus:border-red-400"
                  aria-label="Umbral de ticket para alerta antifraude"
                />
              </label>
              <label className="flex items-center gap-1.5 text-[10px] font-semibold text-emerald-600 uppercase" title="Tipo de cambio MXN → USD (solo presentación)">
                Tipo cambio MXN/USD
                <input
                  id="ventas-tipo-cambio"
                  type="number"
                  step="0.01"
                  min="0"
                  value={tipoCambio}
                  onChange={(e) => setTipoCambio(Math.max(0, parseFloat(e.target.value) || 0))}
                  className="w-16 px-2 py-1 rounded-lg border border-emerald-200 text-xs bg-white focus:outline-none focus:border-emerald-400"
                  aria-label="Tipo de cambio MXN a USD"
                />
              </label>
            </div>
          </div>
          <ul className="space-y-1.5">
            {fraudAlerts.map((a, i) => (
              <li key={`${a.entryId}-${i}`} className="flex items-center gap-2 text-xs text-red-700">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span className="font-medium">{a.dishName}</span>
                <span className="text-red-500">— {a.reason}</span>
              </li>
            ))}
          </ul>
          <p className="text-[10px] text-red-400 mt-3">Revisa estos registros antes de cerrar tu corte de caja.</p>
        </div>
      )}

      {/* ── Day stats ────────────────────────────────────── */}
      <div className="flex items-center gap-2 mb-4">
        <div className="flex items-center gap-2 bg-white rounded-xl border border-gray-100 px-3 py-2">
          <span className="text-xs text-gray-400 shrink-0">Día:</span>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => { setSelectedDate(e.target.value || todayStr()); setShowAll(false) }}
            className="text-xs font-semibold text-gray-700 bg-transparent focus:outline-none"
            aria-label="Seleccionar día a consultar"
          />
        </div>
        <button
          onClick={() => setShowAll(!showAll)}
          className={`text-xs font-semibold px-3 py-2 rounded-xl transition-colors ${
            showAll ? "bg-[#108910] text-white" : "bg-white text-gray-600 border border-gray-100 hover:bg-gray-50"
          }`}
        >
          {showAll ? "Ver solo este día" : "Ver todo el historial"}
        </button>
      </div>

      {entries.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
          <Receipt className="w-12 h-12 text-gray-200 mx-auto mb-4" />
          <p className="text-gray-400 font-medium mb-1">{t("ventas.emptyTitle")}</p>
          <p className="text-xs text-gray-300 mb-4">Registra tu primera venta del día para ver tu margen real</p>
          <button
            onClick={() => document.getElementById("venta-dish")?.focus()}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#108910] text-white text-xs font-semibold rounded-xl hover:bg-green-800 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Registrar primera venta
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
            <div className="bg-white rounded-xl border border-gray-100 p-4 text-center">
              <DollarSign className="w-5 h-5 text-emerald-600 mx-auto mb-1" />
              <p className="text-lg font-extrabold text-emerald-700">${dayStats.revenue.toFixed(0)}</p>
              <p className="text-[10px] text-gray-400">Ingresos · {dateLabel(selectedDate)}</p>
              {tipoCambio !== 1 && <p className="text-[10px] text-gray-300 font-semibold mt-0.5">≈ ${(dayStats.revenue / tipoCambio).toFixed(2)} USD</p>}
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-4 text-center">
              <Receipt className="w-5 h-5 text-blue-600 mx-auto mb-1" />
              <p className="text-lg font-extrabold text-blue-700">${dayStats.cost.toFixed(0)}</p>
              <p className="text-[10px] text-gray-400">Costo de venta (COGS)</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-4 text-center">
              <TrendingUp className="w-5 h-5 text-[#108910] mx-auto mb-1" />
              <p className={`text-lg font-extrabold ${dayStats.margin >= 0 ? "text-[#108910]" : "text-red-600"}`}>
                ${dayStats.margin.toFixed(0)}
              </p>
              <p className="text-[10px] text-gray-400">Margen bruto</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-4 text-center">
              <Target className="w-5 h-5 text-amber-600 mx-auto mb-1" />
              <p className={`text-lg font-extrabold ${
                foodCostStatus(dayStats.foodCost, panelCfg) === "red" ? "text-red-600" :
                foodCostStatus(dayStats.foodCost, panelCfg) === "amber" ? "text-amber-600" : "text-green-700"
              }`}>
                {dayStats.foodCost.toFixed(1)}%
              </p>
              <p className="text-[10px] text-gray-400">Food cost real del día</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-4 text-center">
              <BarChart3 className="w-5 h-5 text-purple-600 mx-auto mb-1" />
              <p className="text-lg font-extrabold text-purple-700">${dayStats.avgTicket.toFixed(0)}</p>
              <p className="text-[10px] text-gray-400">Ticket promedio ({dayStats.orders} registros)</p>
            </div>
          </div>

          {/* Corte de caja */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-6">
            <div className="flex items-center gap-2 mb-4">
              <Landmark className="w-4 h-4 text-[#108910]" />
              <h3 className="text-sm font-semibold text-gray-900">Corte de caja · {dateLabel(selectedDate)}</h3>
              <button
                onClick={copyCorte}
                disabled={dayEntries.length === 0}
                className="ml-auto flex items-center gap-1.5 text-xs font-semibold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="Copiar corte de caja del día seleccionado"
                aria-label="Copiar corte de caja"
              >
                <Copy className="w-3.5 h-3.5" />
                Copiar corte
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {methodBreakdown.map((m) => (
                <div key={m.key} className="bg-gray-50 rounded-xl p-3 text-center">
                  <p className="text-[10px] text-gray-500 mb-1">{m.icon} {m.label}</p>
                  <p className="text-lg font-extrabold text-gray-800">${m.revenue.toFixed(0)}</p>
                  <p className="text-[10px] text-gray-400">{m.count} venta{m.count !== 1 ? "s" : ""}</p>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
              <span className="text-xs text-gray-500">Total del día</span>
              <span className="flex flex-col items-end">
                <span className="text-lg font-extrabold text-[#108910]">${dayStats.revenue.toFixed(0)}</span>
                {tipoCambio !== 1 && <span className="text-[10px] text-gray-400">≈ ${(dayStats.revenue / tipoCambio).toFixed(2)} USD</span>}
              </span>
            </div>
          </div>

          {/* ── Management report (period) ─────────────── */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-6">
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              <BarChart3 className="w-4 h-4 text-purple-600" />
              <h3 className="text-sm font-semibold text-gray-900">Reporte gerencial</h3>
              <div className="flex items-center gap-1 ml-auto">
                {(["hoy", "7d", "30d"] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => setReportPeriod(p)}
                    className={`px-3 py-1 text-[10px] font-semibold rounded-lg transition-colors ${
                      reportPeriod === p ? "bg-purple-600 text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                    }`}
                  >
                    {p === "hoy" ? "Hoy" : p === "7d" ? "7 días" : "30 días"}
                  </button>
                ))}
                <button
                  onClick={copyGerencial}
                  disabled={reportEntries.length === 0}
                  title="Copiar reporte gerencial del período"
                  aria-label="Copiar reporte gerencial"
                  className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Copy className="w-3.5 h-3.5" />
                  Copiar reporte
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
              <div className="bg-gray-50 rounded-xl p-3 text-center">
                <p className="text-[10px] text-gray-500 mb-1">Ingresos</p>
                <p className="text-lg font-extrabold text-[#108910]">${reportStats.revenue.toFixed(0)}</p>
                <p className="text-[10px] text-gray-400">{reportStats.orders} ticket{reportStats.orders !== 1 ? "s" : ""}</p>
                {tipoCambio !== 1 && <p className="text-[10px] text-gray-300 font-semibold">≈ ${(reportStats.revenue / tipoCambio).toFixed(2)} USD</p>}
              </div>
              <div className="bg-gray-50 rounded-xl p-3 text-center">
                <p className="text-[10px] text-gray-500 mb-1">Costo de venta</p>
                <p className="text-lg font-extrabold text-gray-800">${reportStats.cost.toFixed(0)}</p>
                <p className="text-[10px] text-gray-400">{reportStats.units} platillos</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-3 text-center">
                <p className="text-[10px] text-gray-500 mb-1">Margen bruto</p>
                <p className="text-lg font-extrabold text-gray-800">${reportStats.margin.toFixed(0)}</p>
                <p className="text-[10px] text-gray-400">ingresos − costo</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-3 text-center">
                <p className="text-[10px] text-gray-500 mb-1">Food cost</p>
                <p className="text-lg font-extrabold text-gray-800">{reportStats.foodCost.toFixed(1)}%</p>
                <p className="text-[10px] text-gray-400">costo / ingresos</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-3 text-center">
                <p className="text-[10px] text-gray-500 mb-1">Ticket promedio</p>
                <p className="text-lg font-extrabold text-gray-800">${reportStats.avgTicket.toFixed(0)}</p>
                <p className="text-[10px] text-gray-400">{reportStats.orders > 0 ? "por ticket" : "sin ventas"}</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-3 text-center">
                <p className="text-[10px] text-gray-500 mb-1">Descuentos</p>
                <p className="text-lg font-extrabold text-red-600">-${reportStats.discount.toFixed(0)}</p>
                <p className="text-[10px] text-gray-400">otorgados</p>
              </div>
            </div>

            {(reportEntries.length > 0 || comparison.prev.orders > 0) && (
              <div className="grid sm:grid-cols-3 gap-3 mb-4">
                {[
                  { label: "Ingresos", cur: comparison.cur.revenue, prev: comparison.prev.revenue, delta: comparison.revenueDelta },
                  { label: "Tickets", cur: comparison.cur.orders, prev: comparison.prev.orders, delta: comparison.ordersDelta },
                  { label: "Ticket promedio", cur: comparison.cur.avgTicket, prev: comparison.prev.avgTicket, delta: comparison.avgDelta },
                ].map((x) => (
                  <div key={x.label} className="bg-gray-50 rounded-xl p-3 text-center border border-dashed border-gray-200">
                    <p className="text-[10px] text-gray-500 mb-1">vs período anterior — {x.label}</p>
                    <p className="text-sm font-extrabold text-gray-800">{x.label === "Tickets" ? x.cur : `$${x.cur.toFixed(0)}`}</p>
                    <p className={`text-[10px] font-bold ${x.delta >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {x.delta >= 0 ? "↑" : "↓"} {Math.abs(x.delta).toFixed(0)}%
                      <span className="text-gray-400 font-medium"> · prev {x.label === "Tickets" ? x.prev : `$${x.prev.toFixed(0)}`}</span>
                    </p>
                  </div>
                ))}
              </div>
            )}

            {reportEntries.length === 0 ? (
              <p className="text-xs text-gray-400">Sin ventas en este período.</p>
            ) : (
              <div className="grid sm:grid-cols-3 gap-4 text-xs">
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-[10px] text-gray-500 font-semibold mb-2">Por método de pago</p>
                  <div className="space-y-1.5">
                    {reportMethods.length === 0 ? (
                      <p className="text-gray-400">—</p>
                    ) : reportMethods.map((m) => (
                      <div key={m.key} className="flex items-center justify-between gap-2">
                        <span className="text-gray-600">{m.icon} {m.label}</span>
                        <span className="font-semibold text-gray-800">${m.revenue.toFixed(0)}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-[10px] text-gray-500 font-semibold mb-2">Por canal</p>
                  <div className="space-y-1.5">
                    {reportChannels.length === 0 ? (
                      <p className="text-gray-400">—</p>
                    ) : reportChannels.map((c) => (
                      <div key={c.key} className="flex items-center justify-between gap-2">
                        <span className="text-gray-600">{c.icon} {c.label}</span>
                        <span className="font-semibold text-gray-800">${c.revenue.toFixed(0)}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-[10px] text-gray-500 font-semibold mb-2">Top productos</p>
                  <div className="space-y-1.5">
                    {reportTop.length === 0 ? (
                      <p className="text-gray-400">—</p>
                    ) : reportTop.map((t, i) => (
                      <div key={t.name} className="flex items-center justify-between gap-2">
                        <span className="text-gray-600 truncate">{i + 1}. {t.name}</span>
                        <span className="font-semibold text-gray-800 shrink-0">{t.qty} pz</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="grid lg:grid-cols-2 gap-6 mb-6">
            {/* 7-day trend */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <div className="flex items-center gap-2 mb-4">
                <BarChart3 className="w-4 h-4 text-emerald-600" />
                <h3 className="text-sm font-semibold text-gray-900">Ingresos últimos 7 días</h3>
              </div>
              <div className="flex items-end gap-2 h-32">
                {weekTrend.days.map((d, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1 group">
                    <span className="text-[9px] text-gray-400 font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                      ${d.revenue.toFixed(0)}
                    </span>
                    <div
                      className={`w-full rounded-t-lg transition-all ${
                        d.revenue > 0 ? "bg-emerald-500 group-hover:bg-emerald-600" : "bg-gray-100"
                      }`}
                      style={{ height: `${Math.max(d.revenue > 0 ? (d.revenue / weekTrend.max) * 100 : 3, 3)}%` }}
                      title={`${d.label}: $${d.revenue.toFixed(0)} (costo $${d.cost.toFixed(0)})`}
                    />
                    <span className={`text-[10px] ${d.revenue > 0 ? "text-gray-600 font-medium" : "text-gray-300"}`}>
                      {d.label.length > 5 ? d.label.slice(0, 3) : d.label}
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-gray-400 mt-3">Pasa el cursor sobre cada barra para ver el detalle.</p>
            </div>

            {/* Top sellers */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="w-4 h-4 text-[#108910]" />
                <h3 className="text-sm font-semibold text-gray-900">Top ventas · {dateLabel(selectedDate)}</h3>
              </div>
              {topSellers.length === 0 ? (
                <p className="text-xs text-gray-400">Sin ventas este día.</p>
              ) : (
                <div className="space-y-2">
                  {topSellers.map((t, i) => {
                    const pct = dayStats.units > 0 ? (t.qty / dayStats.units) * 100 : 0
                    return (
                      <div key={t.name} className="flex items-center gap-2 text-xs">
                        <span className="w-5 text-gray-400 font-bold">{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between mb-0.5">
                            <span className="font-medium text-gray-700 truncate">{t.name}</span>
                            <span className="text-gray-400 shrink-0 ml-2">{t.qty} pz · ${t.revenue.toFixed(0)}</span>
                          </div>
                          <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                            <div className="h-full bg-[#108910] rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Entries list */}
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-900">
                {showAll ? `Historial completo (${entries.length})` : `Ventas de ${dateLabel(selectedDate)} (${dayEntries.length})`}
              </h3>
              {!showAll && dayStats.units > 0 && (
                <span className="text-xs text-gray-400">{dayStats.units} platillos vendidos</span>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs" aria-label={t("ventas.title")}>
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/50">
                    <th scope="col" className="text-left px-4 py-3 font-semibold text-gray-400 text-[10px] uppercase tracking-wider">Platillo</th>
                    <th scope="col" className="text-right px-4 py-3 font-semibold text-gray-400 text-[10px] uppercase tracking-wider">Cant.</th>
                    <th scope="col" className="text-right px-4 py-3 font-semibold text-gray-400 text-[10px] uppercase tracking-wider">Precio</th>
                    <th scope="col" className="text-right px-4 py-3 font-semibold text-gray-400 text-[10px] uppercase tracking-wider">Costo</th>
                    <th scope="col" className="text-right px-4 py-3 font-semibold text-gray-400 text-[10px] uppercase tracking-wider">Total</th>
                    <th scope="col" className="text-right px-4 py-3 font-semibold text-gray-400 text-[10px] uppercase tracking-wider">Margen</th>
                    <th scope="col" className="text-center px-4 py-3 font-semibold text-gray-400 text-[10px] uppercase tracking-wider">Fecha</th>
                    <th scope="col" className="text-center px-4 py-3 font-semibold text-gray-400 text-[10px] uppercase tracking-wider">Pago</th>
                    <th scope="col" className="text-center px-4 py-3 font-semibold text-gray-400 text-[10px] uppercase tracking-wider">Canal</th>
                    <th scope="col" className="text-center px-4 py-3 font-semibold text-gray-400 text-[10px] uppercase tracking-wider">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleEntries
                    .slice()
                    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
                    .map((e) => {
                      const subtotal = e.quantity * e.unitPrice
                      const total = entryTotal(e)
                      const cost = e.quantity * e.unitCost
                      const margin = total - cost
                      const currentCost = dishCost(e.dishId)
                      const costStale = e.dishId && currentCost > 0 && Math.abs(currentCost - e.unitCost) > 0.01
                      return (
                        <tr key={e.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              <p className="font-semibold text-gray-800">{e.dishName}</p>
                              {e.clienteId && (() => {
                                const c = clientes.find((x) => x.id === e.clienteId)
                                return c ? <span className="text-[9px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-full font-medium">👤 {c.nombre}</span> : null
                              })()}
                            </div>
                            <p className="text-[10px] text-gray-400">${e.unitPrice.toFixed(0)} / ${e.unitCost.toFixed(2)}</p>
                            {e.modificadores && e.modificadores.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {e.modificadores.map((m) => (
                                  <span key={m.nombre} className="text-[9px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded-full font-medium">
                                    +{m.nombre}{m.precio > 0 ? ` $${m.precio.toFixed(0)}` : ""}
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => adjustQty(e.id, -1)}
                                disabled={e.quantity <= 1}
                                className="w-5 h-5 rounded bg-red-50 text-red-500 hover:bg-red-100 text-xs font-bold transition-colors disabled:opacity-40"
                                aria-label={`Reducir cantidad de ${e.dishName}`}
                              >−</button>
                              <span className="w-6 text-center font-bold text-gray-800">{e.quantity}</span>
                              <button
                                onClick={() => adjustQty(e.id, 1)}
                                className="w-5 h-5 rounded bg-green-50 text-green-600 hover:bg-green-100 text-xs font-bold transition-colors"
                                aria-label={`Aumentar cantidad de ${e.dishName}`}
                              >+</button>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right text-gray-700 font-medium">${e.unitPrice.toFixed(0)}</td>
                          <td className="px-4 py-3 text-right text-gray-500">${cost.toFixed(0)}
                            {costStale && (
                              <span
                                className="block text-[9px] text-amber-600 font-semibold mt-0.5 cursor-help"
                                title={`El costo registrado fue $${e.unitCost.toFixed(2)}/u; hoy el platillo cuesta $${currentCost.toFixed(2)}/u. El margen usa el costo congelado de la venta.`}
                              >
                                ⚠ costo actualizado
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {e.discount ? (
                              <>
                                <p className="text-[10px] text-gray-400 line-through">${subtotal.toFixed(0)}</p>
                                <p className="font-bold text-red-600">${total.toFixed(0)}</p>
                                <p className="text-[9px] text-red-400 font-semibold">
                                  {e.discount.type === "porcentaje" ? `${e.discount.value}%` : `-$${e.discount.value.toFixed(0)}`} desc.
                                </p>
                              </>
                            ) : (
                              <p className="font-bold text-gray-900">${total.toFixed(0)}</p>
                            )}
                          </td>
                          <td className={`px-4 py-3 text-right font-bold ${margin >= 0 ? "text-green-600" : "text-red-600"}`}>
                            ${margin.toFixed(0)}
                          </td>
                          <td className="px-4 py-3 text-center text-gray-500 whitespace-nowrap">{dateLabel(e.date)}</td>
                          <td className="px-4 py-3 text-center whitespace-nowrap">
                            {(() => {
                              const m = PAYMENT_METHODS.find((p) => p.key === (e.paymentMethod || "efectivo"))
                              return (
                                <span className="text-[10px] text-gray-500" title={m?.label}>
                                  {m?.icon} {m?.label}
                                </span>
                              )
                            })()}
                          </td>
                          <td className="px-4 py-3 text-center whitespace-nowrap">
                            {(() => {
                              const c = SALE_CHANNELS.find((ch) => ch.key === (e.channel || "comedor"))
                              return (
                                <span className="text-[10px] text-gray-500" title={c?.label}>
                                  {c?.icon} {c?.label}
                                </span>
                              )
                            })()}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-center">
                              <button
                                onClick={() => setDeleteConfirm(e.id)}
                                className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                title="Eliminar venta"
                                aria-label={`Eliminar venta de ${e.dishName}`}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                </tbody>
              </table>
            </div>
            {visibleEntries.length === 0 && (
              <div className="text-center py-10">
                <p className="text-xs text-gray-400">No hay ventas para mostrar.</p>
              </div>
            )}
          </div>
        </>
      )}

      {/* All-time tip */}
      {entries.length > 0 && (
        <div className="mt-6 bg-gradient-to-r from-[#F0FDF4] to-white rounded-2xl border border-[#108910]/10 p-5">
          <div className="flex items-start gap-3">
            <Receipt className="w-5 h-5 text-[#108910] mt-0.5 shrink-0" />
            <div>
              <h4 className="font-semibold text-gray-900 mb-1 text-sm">Tu historial en total</h4>
              <p className="text-xs text-gray-500 leading-relaxed">
                {allTimeStats.count} registros · ${allTimeStats.revenue.toFixed(0)} ingresos · ${allTimeStats.margin.toFixed(0)} margen bruto
                {allTimeStats.foodCost > 0 && ` · food cost promedio ${allTimeStats.foodCost.toFixed(1)}%`}.
                Un food cost arriba de {panelCfg.foodCostRedAbove}% significa que estás regalando margen: ajusta precios desde el Costeador.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setDeleteConfirm(null)}>
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <AlertCircle className="w-5 h-5 text-red-500" />
              <h3 className="font-bold text-gray-900">¿Eliminar esta venta?</h3>
            </div>
            <p className="text-sm text-gray-500 mb-4">Esta acción no se puede deshacer.</p>
            {deductStock && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
                El stock que se descontó al registrar esta venta no se repondrá automáticamente.
              </p>
            )}
            <div className="flex gap-2">
              <button onClick={() => setDeleteConfirm(null)}
                className="flex-1 px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors font-medium">
                Cancelar
              </button>
              <button onClick={() => deleteEntry(deleteConfirm)}
                className="flex-1 px-4 py-2 text-sm text-white bg-red-600 rounded-xl hover:bg-red-700 transition-colors font-semibold">
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
