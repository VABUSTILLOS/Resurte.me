"use client"

import { useRestaurant } from "@/contexts/restaurant-context"
import { useSharedDishes, useLocalStorage } from "@/hooks/use-local-storage"
import { useToast } from "@/components/toast"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMemo, useState, useEffect, useCallback, useRef } from "react"
import { normalizeName } from "@/lib/normalize"
import { foodCostStatus, usePanelConfig } from "@/lib/panel-config"
import { convertQty } from "@/lib/panel-units"
import {
  Calculator, ShoppingCart, Trash2, TrendingUp,
  Calendar, ClipboardCheck, ArrowRight, ChefHat, Store,
  PieChart, DollarSign, BarChart3, Zap, Clock, Percent, Package, Receipt, Copy,
  AlertTriangle, Bell, AlertCircle, CheckCircle2, ChevronDown, ChevronUp, Search, Flame, Target, Gift,
  UtensilsCrossed, QrCode, Megaphone, Compass,
} from "lucide-react"
import { GlobalSearch } from "@/components/global-search"

const PAYMENT_METHODS = [
  { key: "efectivo", label: "Efectivo", icon: "💵" },
  { key: "tarjeta", label: "Tarjeta", icon: "💳" },
  { key: "transferencia", label: "Transferencia", icon: "🏦" },
] as const

type HubVenta = {
  id: string
  dishId: string
  dishName: string
  quantity: number
  date: string
  unitPrice: number
  unitCost: number
  paymentMethod?: string
  channel?: string
  discount?: { type: "monto" | "porcentaje"; value: number }
  clienteId?: string
  mesaId?: string
  createdAt?: string
}

type HubMesa = {
  id: string
  nombre: string
  capacidad: number
  zona?: string
}

function hubEntryTotal(e: HubVenta): number {
  const gross = e.quantity * e.unitPrice
  if (!e.discount) return gross
  return e.discount.type === "porcentaje"
    ? gross * (1 - e.discount.value / 100)
    : Math.max(gross - e.discount.value, 0)
}

const COLLECTION_ICONS: Record<string, string> = {
  "hamburguesas-hot-dogs": "🍔",
  "taquerias-antojitos": "🌮",
  "sushi-comida-asiatica": "🍣",
  "pizzas-comida-italiana": "🍕",
  "pollo-alitas": "🍗",
  "comida-mexicana-corrida": "🍲",
  "mariscos-pescados": "🦐",
  "cortes-carne-asaderos": "🥩",
  "cafeterias-crepas-desayunos": "☕",
  "saludable-ensaladas-pokes": "🥗",
  "postres-panaderia-helados": "🍰",
  "comida-arabe-griega": "🥙",
  "comida-venezolana-latina": "🇻🇪",
  "bebidas-bares-botanas": "🍺",
}

interface Tool {
  title: string
  description: string
  icon: typeof Calculator
  href: string
  color: string
  bgColor: string
  collectionDesc?: (name: string) => string
  standalone?: boolean
}

const TOOLS: Tool[] = [
  {
    title: "Costeando mi menú",
    description: "Calcula el costo real de cada platillo usando precios del catálogo de Resurte.me. Define tu food cost ideal y recibe el precio de venta sugerido.",
    icon: Calculator,
    href: "/panel/costeo",
    color: "text-blue-600",
    bgColor: "bg-blue-50",
    collectionDesc: (name) => `Costea los platillos típicos de ${name} con precios reales de Resurte.me.`,
  },
  {
    title: "Planificador de pedidos",
    description: "Según tus comensales esperados, calcula cuánto pedir de cada insumo. Ajusta por merma y genera tu orden directamente en Resurte.me.",
    icon: ShoppingCart,
    href: "/panel/planificador",
    color: "text-emerald-600",
    bgColor: "bg-emerald-50",
    collectionDesc: (name) => `Planea tus compras para ${name} según la demanda esperada.`,
  },
  {
    title: "Calculadora de mermas",
    description: "Registra tu desperdicio por categoría y descubre cuánto dinero estás perdiendo. Recibe tips prácticos para reducir merma en cada tipo de insumo.",
    icon: Trash2,
    href: "/panel/mermas",
    color: "text-red-600",
    bgColor: "bg-red-50",
    collectionDesc: (name) => `Controla el desperdicio típico de ${name} y reduce pérdidas.`,
  },
  {
    title: "Semáforo de rentabilidad",
    description: "Visualiza tus platillos en verde, amarillo o rojo según su margen. Recibe alertas cuando los precios de insumos cambien y afecten tu rentabilidad.",
    icon: TrendingUp,
    href: "/panel/rentabilidad",
    color: "text-amber-600",
    bgColor: "bg-amber-50",
    collectionDesc: (name) => `Monitorea la rentabilidad de tu menú de ${name} en tiempo real.`,
  },
  {
    title: "Planificador de temporada",
    description: "Calendario de frutas y verduras de temporada en México. Arma menús estacionales con los insumos más frescos y baratos del momento.",
    icon: Calendar,
    href: "/panel/temporada",
    color: "text-purple-600",
    bgColor: "bg-purple-50",
    collectionDesc: (name) => `Descubre los insumos de temporada ideales para ${name}.`,
  },
  {
    title: "Kit de apertura",
    description: "Checklist paso a paso para abrir tu restaurante. Calculadora de inversión inicial y sugerencias de primeros pedidos según tu tipo de cocina.",
    icon: ClipboardCheck,
    href: "/panel/apertura",
    color: "text-indigo-600",
    bgColor: "bg-indigo-50",
    collectionDesc: (name) => `Todo lo que necesitas para abrir tu ${name}, en un solo lugar.`,
  },
  {
    title: "Mi inventario",
    description: "Gestiona tu stock de productos con indicadores 🟢🟡🔴. Genera órdenes de compra automáticas basadas en niveles mínimos y lo que planeaste pedir.",
    icon: Package,
    href: "/panel/inventario",
    color: "text-cyan-600",
    bgColor: "bg-cyan-50",
    collectionDesc: (name) => `Controla el inventario de tu ${name} y nunca te quedes sin insumos.`,
  },
  {
    title: "Ventas del día",
    description: "Registra tus ventas y conoce en tiempo real tus ingresos, costo de venta, margen bruto y ticket promedio. Compara tus últimos 7 días.",
    icon: Receipt,
    href: "/panel/ventas",
    color: "text-emerald-600",
    bgColor: "bg-emerald-50",
    collectionDesc: (name) => `Registra las ventas de tu ${name} y conoce tu margen real del día.`,
  },
  {
    title: "Monitor de cocina",
    description: "Cada venta genera una comanda para tu cocina. Lleva el ciclo pendiente → en cocina → listo, clasifica por tipo de servicio y mide tus tiempos de producción.",
    icon: Flame,
    href: "/panel/comanda",
    color: "text-orange-600",
    bgColor: "bg-orange-50",
    collectionDesc: (name) => `Despacha las comandas de tu ${name} por tipo de servicio y controla los tiempos en cocina.`,
  },
  // ---- Sistema de pedidos (FoodOS) ----
  {
    title: "Mi restaurante",
    description: "Perfil público con tu marca, logo y sucursales. Obtén tu link directo de pedidos y el código QR para compartir en mesas, empaques y redes.",
    icon: QrCode,
    href: "/panel/foodos/restaurante",
    color: "text-emerald-600",
    bgColor: "bg-emerald-50",
    standalone: true,
  },
  {
    title: "Menú digital",
    description: "Publica tu menú en línea: categorías, platillos, destacados y disponibilidad. Impórtalo desde tu costeo de Resurte.me en un clic.",
    icon: UtensilsCrossed,
    href: "/panel/foodos/menu",
    color: "text-orange-600",
    bgColor: "bg-orange-50",
    standalone: true,
  },
  {
    title: "Combos y cross-sell",
    description: "Crea combos y reglas de venta cruzada: si piden X sugiere Y, o sube el ticket con ofertas inteligentes en el checkout.",
    icon: Gift,
    href: "/panel/foodos/combos",
    color: "text-purple-600",
    bgColor: "bg-purple-50",
    standalone: true,
  },
  {
    title: "Clientes y recurrencia",
    description: "Base de clientes con segmentos (nuevo, recurrente, VIP) y automatizaciones por WhatsApp: agradecimientos, recuperación y promos.",
    icon: Megaphone,
    href: "/panel/foodos/clientes",
    color: "text-red-600",
    bgColor: "bg-red-50",
    standalone: true,
  },
  {
    title: "Tablero FoodTech",
    description: "Pedidos por día, canal y sucursal, ticket promedio, top platillos e ingresos. Mide la efectividad de combos y cross-sell.",
    icon: BarChart3,
    href: "/panel/foodos/tablero",
    color: "text-blue-600",
    bgColor: "bg-blue-50",
    standalone: true,
  },
  {
    title: "Marketplace hoyquecomemos",
    description: "Tu menú aparece en el directorio público de hoyquecomemos.mx: los comensales te encuentran por ciudad y platillo y piden directo en tu micrositio, sin comisiones.",
    icon: Compass,
    href: "/comer",
    color: "text-teal-600",
    bgColor: "bg-teal-50",
    standalone: true,
  },
]

export default function PanelPage() {
  const { selectedCollection, collections, setSelectedCollection } = useRestaurant()
  const slug = selectedCollection?.slug || null
  const router = useRouter()
  const { toast } = useToast()
  const [sharedDishes] = useSharedDishes(slug)
  const [mermaEntries] = useLocalStorage<{ amountKg: number; costPerKg: number; category: string; id: string; date: string }[]>("mermas-entries", [], slug)
  const [aperturaChecked] = useLocalStorage<string[]>("apertura-checked", [], slug)
  const [monthlyGoal] = useLocalStorage<number>("merma-monthly-goal", 0, slug)
  const [shoppingList] = useLocalStorage<{ key: string; name: string; pricePerKg: number; quantityKg: number }[]>("temporada-shopping-list", [], slug)
  const [inventarioItems] = useLocalStorage<{ id: string; name: string; stock: number; minStock: number; unit: string; pricePerUnit: number; category?: string }[]>("inventario-items", [], slug)
  const [ventasEntries] = useLocalStorage<HubVenta[]>("ventas-entries", [], slug)
  const [mesas] = useLocalStorage<HubMesa[]>("mesas", [], slug)
  const [ventasMetaDia] = useLocalStorage<number>("ventas-meta-dia", 0, slug)
  const [ventasUmbralTicket] = useLocalStorage<number>("ventas-umbral-ticket", 3000, slug)
  const [clientes] = useLocalStorage<{ id: string; nombre: string; telefono?: string; puntos: number; visitas: number; totalGastado: number; createdAt: string }[]>("clientes", [], slug)
  const [puntosTasa] = useLocalStorage<number>("ventas-puntos-tasa", 100, slug)
  const [comandaStatuses] = useLocalStorage<Record<string, { status: "pendiente" | "en-cocina" | "listo"; startedAt?: number; readyAt?: number }>>("comanda-statuses", {}, slug)
  const [covers] = useLocalStorage<number>("planner-covers", 0, slug)
  const panelCfg = usePanelConfig(slug)

  const [showAlerts, setShowAlerts] = useState(true)
  const [showSearch, setShowSearch] = useState(false)
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const [pendingBackup, setPendingBackup] = useState<Record<string, unknown> | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Live tick so "mesas ocupadas > 3h" refreshes over time
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60000)
    return () => clearInterval(t)
  }, [])

  // Cmd+K handler
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault()
        setShowSearch((v) => !v)
      }
    }
    // Also listen for the custom event from GlobalSearch
    const toggle = () => setShowSearch((v) => !v)
    window.addEventListener("global-search-toggle", toggle)
    window.addEventListener("keydown", handler)
    return () => { window.removeEventListener("keydown", handler); window.removeEventListener("global-search-toggle", toggle) }
  }, [])

  const stats = useMemo(() => {
    if (!selectedCollection) return null
    const totalCosteo = sharedDishes.reduce((s, d) => s + d.ingredients.reduce((si, i) => si + (i.quantity * i.unitPrice), 0), 0)
    const totalPrice = sharedDishes.reduce((s, d) => s + d.sellingPrice, 0)
    const avgFoodCost = totalPrice > 0 ? ((totalCosteo / totalPrice) * 100) : 0
    const avgMargin = sharedDishes.length > 0 ? (totalPrice - totalCosteo) / sharedDishes.length : 0
    const totalMerma = mermaEntries.reduce((s, e) => s + (e.amountKg * e.costPerKg), 0)
    const monthLoss = mermaEntries
      .filter((e) => new Date(e.date).getMonth() === new Date().getMonth())
      .reduce((s, e) => s + e.amountKg * e.costPerKg, 0)
    const mermaVsGoal = monthlyGoal > 0 ? (monthLoss / monthlyGoal) * 100 : 0
    const seasonalSavings = shoppingList.reduce((s, item) => s + item.quantityKg * item.pricePerKg, 0)
    const green = sharedDishes.filter((d) => {
      const cost = d.ingredients.reduce((si, i) => si + (i.quantity * i.unitPrice), 0)
      return d.sellingPrice > 0 && foodCostStatus((cost / d.sellingPrice) * 100, panelCfg) === "green"
    }).length
    const red = sharedDishes.filter((d) => {
      const cost = d.ingredients.reduce((si, i) => si + (i.quantity * i.unitPrice), 0)
      return d.sellingPrice > 0 && foodCostStatus((cost / d.sellingPrice) * 100, panelCfg) === "red"
    }).length
    return { totalCosteo, totalMerma, green, red, dishesCount: sharedDishes.length, mermaCount: mermaEntries.length, aperturaCount: aperturaChecked.length, avgFoodCost, avgMargin, monthLoss, mermaVsGoal, seasonalSavings, totalPrice, monthlyGoal }
  }, [sharedDishes, mermaEntries, aperturaChecked, selectedCollection, monthlyGoal, shoppingList, panelCfg])

  // Sales widget: today revenue, COGS, margin, ticket count, payment methods, merma
  const todaySales = useMemo(() => {
    if (!selectedCollection) return null
    const today = new Date().toISOString().slice(0, 10)
    const todayEntries = ventasEntries.filter((e) => e.date === today)
    const revenue = todayEntries.reduce((s, e) => s + hubEntryTotal(e), 0)
    const cost = todayEntries.reduce((s, e) => s + e.quantity * e.unitCost, 0)
    const units = todayEntries.reduce((s, e) => s + e.quantity, 0)
    const byMethod = new Map<string, { revenue: number; count: number }>()
    todayEntries.forEach((e) => {
      const m = e.paymentMethod || "efectivo"
      const cur = byMethod.get(m) || { revenue: 0, count: 0 }
      cur.revenue += hubEntryTotal(e)
      cur.count += 1
      byMethod.set(m, cur)
    })
    const methods = PAYMENT_METHODS.map((m) => ({
      ...m,
      ...(byMethod.get(m.key) || { revenue: 0, count: 0 }),
    }))
    const todayMerma = mermaEntries
      .filter((e) => e.date.slice(0, 10) === today)
      .reduce((s, e) => s + e.amountKg * e.costPerKg, 0)
    return {
      revenue,
      margin: revenue - cost,
      marginPct: revenue > 0 ? ((revenue - cost) / revenue) * 100 : 0,
      foodCost: revenue > 0 ? (cost / revenue) * 100 : 0,
      units,
      count: todayEntries.length,
      avgTicket: todayEntries.length > 0 ? revenue / todayEntries.length : 0,
      methods,
      todayMerma,
    }
  }, [ventasEntries, mermaEntries, selectedCollection])

  // Loyalty points awarded today (sales linked to a client)
  const puntosHoy = useMemo(() => {
    if (!selectedCollection) return 0
    const today = new Date().toISOString().slice(0, 10)
    const tasa = puntosTasa > 0 ? puntosTasa : 100
    return ventasEntries
      .filter((e) => e.date === today && e.clienteId)
      .reduce((s, e) => s + Math.floor(hubEntryTotal(e) / tasa), 0)
  }, [selectedCollection, ventasEntries, puntosTasa])

  // Daily goal progress from ventas meta
  const goalProgress = useMemo(() => {
    if (!selectedCollection || !todaySales) return null
    const pct = ventasMetaDia > 0 ? (todaySales.revenue / ventasMetaDia) * 100 : 0
    const projected = ventasMetaDia > 0 ? Math.round(pct) : 0
    return { pct, projected, goal: ventasMetaDia }
  }, [selectedCollection, todaySales, ventasMetaDia])

  // Active kitchen orders: today's sales still pendiente or en-cocina
  const activeComandas = useMemo(() => {
    if (!selectedCollection) return { active: 0, pendiente: 0, enCocina: 0, readyToday: 0 }
    const today = new Date().toISOString().slice(0, 10)
    const todayIds = new Set(ventasEntries.filter((e) => e.date === today).map((e) => e.id))
    let active = 0
    let pendiente = 0
    let enCocina = 0
    Object.entries(comandaStatuses).forEach(([id, s]) => {
      if (!todayIds.has(id)) return
      if (s.status === "listo") return
      active++
      if (s.status === "pendiente") pendiente++
      else enCocina++
    })
    return { active, pendiente, enCocina, readyToday: todayIds.size - active }
  }, [ventasEntries, comandaStatuses, selectedCollection])

  // Mesas: occupied today + those occupied longer than 3h
  const mesasInfo = useMemo(() => {
    if (!selectedCollection) return { occupied: 0, total: mesas.length, longCount: 0, longNames: [] as string[] }
    const today = new Date().toISOString().slice(0, 10)
    const firstTs = new Map<string, number>()
    ventasEntries.forEach((e) => {
      if (e.date !== today || !e.mesaId) return
      const ts = e.createdAt ? Date.parse(e.createdAt) : NaN
      const prev = firstTs.get(e.mesaId)
      if (Number.isFinite(ts) && (prev == null || ts < prev)) firstTs.set(e.mesaId, ts)
    })
    const longIds = [...firstTs.entries()].filter(([, ts]) => now - ts > 3 * 3600 * 1000).map(([id]) => id)
    const longNames = longIds.map((id) => mesas.find((m) => m.id === id)?.nombre).filter(Boolean) as string[]
    return { occupied: firstTs.size, total: mesas.length, longCount: longIds.length, longNames }
  }, [selectedCollection, ventasEntries, mesas, now])

  // Planned-menu stock projection: ingredients needed for covers vs inventory
  const projectionShortfall = useMemo(() => {
    if (!selectedCollection || !covers || covers <= 0) return 0
    const needs = new Map<string, { qty: number; unit: string }>()
    sharedDishes.forEach((d) => {
      d.ingredients.forEach((ing) => {
        const key = normalizeName(ing.ingredientName)
        if (!key) return
        const qty = (ing.quantity || 0) * covers
        const prev = needs.get(key)
        if (prev) prev.qty += qty
        else needs.set(key, { qty, unit: ing.unit || "g" })
      })
    })
    let missing = 0
    needs.forEach((need, key) => {
      const item = inventarioItems.find((i) => normalizeName(i.name) === key)
      if (!item) {
        missing++
        return
      }
      const neededInItemUnit = convertQty(need.qty, need.unit, item.unit) ?? need.qty
      if (item.stock < neededInItemUnit) missing++
    })
    return missing
  }, [sharedDishes, covers, inventarioItems, selectedCollection])

  // ── JSON backup / restore (collection-scoped resurte-* keys) ──
  const backupData = useCallback(() => {
    if (!selectedCollection) return
    const prefix = `resurte-`
    const suffix = `-${selectedCollection.slug}`
    const data: Record<string, unknown> = {}
    let count = 0
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key || !key.startsWith(prefix) || !key.endsWith(suffix)) continue
      try {
        data[key] = JSON.parse(localStorage.getItem(key) || "null")
        count++
      } catch {
        // Skip corrupt entries
      }
    }
    const payload = { app: "resurte-me", version: 1, collection: selectedCollection.slug, exportedAt: new Date().toISOString(), data }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `resurte-${selectedCollection.slug}-respaldo-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    toast(`Respaldo exportado (${count} datos de ${selectedCollection.name})`, "success")
  }, [selectedCollection, toast])

  const onRestoreFileSelected = useCallback((file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result))
        if (!parsed || typeof parsed !== "object" || !parsed.data || typeof parsed.data !== "object") {
          toast("Archivo de respaldo no válido", "warning")
          return
        }
        if (selectedCollection && parsed.collection && parsed.collection !== selectedCollection.slug) {
          toast(`Este respaldo es de "${parsed.collection}", no de ${selectedCollection.slug}`, "warning")
          return
        }
        setPendingBackup(parsed.data as Record<string, unknown>)
        setShowRestoreConfirm(true)
      } catch {
        toast("No se pudo leer el archivo JSON", "warning")
      }
    }
    reader.readAsText(file)
  }, [selectedCollection, toast])

  const confirmRestore = useCallback(() => {
    if (!pendingBackup) return
    let restored = 0
    try {
      Object.entries(pendingBackup).forEach(([key, value]) => {
        localStorage.setItem(key, JSON.stringify(value))
        restored++
      })
      window.dispatchEvent(new Event("storage"))
      toast(`Datos restaurados correctamente (${restored} claves)`, "success")
    } catch {
      toast("Error al restaurar los datos", "warning")
    }
    setShowRestoreConfirm(false)
    setPendingBackup(null)
  }, [pendingBackup, toast])

  const copyDaySummary = () => {
    if (!todaySales) return
    const s = todaySales
    const lines = [
      `📊 Resumen del día — Hoy (${selectedCollection?.name || ""})`,
      "",
      `Ingresos: $${s.revenue.toFixed(0)}`,
      `Margen bruto: $${s.margin.toFixed(0)} (${s.marginPct.toFixed(1)}%)`,
      `Food cost real: ${s.foodCost.toFixed(1)}%`,
      `Platillos vendidos: ${s.units}`,
      `Ticket promedio: $${s.avgTicket.toFixed(0)}`,
    ]
    const active = s.methods.filter((m) => m.count > 0)
    if (active.length > 0) {
      lines.push("", "Por método de pago:")
      active.forEach((m) => lines.push(`${m.icon} ${m.label}: $${m.revenue.toFixed(0)} (${m.count} venta${m.count > 1 ? "s" : ""})`))
    }
    lines.push(`Merma de hoy: $${s.todayMerma.toFixed(0)}`)
    lines.push(`Puntos otorgados hoy: ${puntosHoy}`)
    lines.push("", "📈 Registrado en resurte.me")
    navigator.clipboard.writeText(lines.join("\n"))
    toast("Resumen del día copiado", "success")
  }

  // Alerts computation
  const alerts = useMemo(() => {
    if (!selectedCollection) return []
    type Alert = { id: string; type: "danger" | "warning" | "info" | "success"; icon: typeof AlertTriangle; title: string; detail: string; href: string }
    const result: Alert[] = []

    // 0. Active kitchen orders
    if (activeComandas.active > 0) {
      result.push({
        id: "comandas-active",
        type: activeComandas.pendiente > 0 ? "warning" : "info",
        icon: Flame,
        title: `${activeComandas.active} comanda(s) activa(s) en cocina`,
        detail: `${activeComandas.pendiente} pendiente(s) · ${activeComandas.enCocina} en cocina — despacha el monitor de producción`,
        href: "/panel/comanda",
      })
    }

    // 0b. Mesas occupied for more than 3 hours
    if (mesasInfo.longCount > 0) {
      result.push({
        id: "mesas-long",
        type: "warning",
        icon: UtensilsCrossed,
        title: `${mesasInfo.longCount} mesa(s) ocupada(s) por más de 3 h`,
        detail: `${mesasInfo.longNames.slice(0, 2).join(", ")}${mesasInfo.longNames.length > 2 ? ` +${mesasInfo.longNames.length - 2} más` : ""} — revisa el servicio en mesas`,
        href: "/panel/ventas",
      })
    }

    // 1. Low stock from inventario
    const lowStock = inventarioItems.filter((i) => i.stock <= i.minStock && i.stock > 0)
    const outOfStock = inventarioItems.filter((i) => i.stock === 0)
    if (outOfStock.length > 0) {
      result.push({ id: "stock-out", type: "danger", icon: AlertTriangle, title: `${outOfStock.length} producto(s) agotado(s)`, detail: `${outOfStock.slice(0, 2).map((i) => i.name).join(", ")}${outOfStock.length > 2 ? ` +${outOfStock.length - 2} más` : ""}`, href: "/panel/inventario" })
    } else if (lowStock.length > 0) {
      result.push({ id: "stock-low", type: "warning", icon: AlertCircle, title: `${lowStock.length} producto(s) con stock bajo`, detail: `${lowStock.slice(0, 2).map((i) => `${i.name} (${i.stock} ${i.unit})`).join(", ")}${lowStock.length > 2 ? ` +${lowStock.length - 2} más` : ""}`, href: "/panel/inventario" })
    }

    // 2. High food cost dishes
    const highCostDishes = sharedDishes.filter((d) => {
      const cost = d.ingredients.reduce((si, i) => si + (i.quantity * i.unitPrice), 0)
      return d.sellingPrice > 0 && foodCostStatus((cost / d.sellingPrice) * 100, panelCfg) === "red"
    })
    if (highCostDishes.length > 0) {
      result.push({ id: "high-foodcost", type: "danger", icon: AlertTriangle, title: `${highCostDishes.length} platillo(s) con food cost > ${panelCfg.foodCostRedAbove}%`, detail: `${highCostDishes.map((d) => d.name).join(", ")}`, href: "/panel/rentabilidad" })
    }

    // 3. Merma close to/exceeding goal
    if (monthlyGoal > 0) {
      const monthLoss = mermaEntries.filter((e) => new Date(e.date).getMonth() === new Date().getMonth()).reduce((s, e) => s + e.amountKg * e.costPerKg, 0)
      const pct = (monthLoss / monthlyGoal) * 100
      if (pct > 100) {
        result.push({ id: "merma-over-goal", type: "danger", icon: AlertTriangle, title: "Merma del mes excedió la meta", detail: `$${monthLoss.toFixed(0)} vs meta de $${monthlyGoal.toFixed(0)} (${pct.toFixed(0)}%)`, href: "/panel/mermas" })
      } else if (pct > 80) {
        result.push({ id: "merma-near-goal", type: "warning", icon: AlertCircle, title: "Merma cerca de la meta mensual", detail: `${pct.toFixed(0)}% de la meta alcanzada ($${monthLoss.toFixed(0)} de $${monthlyGoal.toFixed(0)})`, href: "/panel/mermas" })
      }
    }

    // 4. Temporada — seasonal produce available
    const now = new Date()
    const currentMonth = now.getMonth() + 1
    // Quick seasonal check: if there are items in shopping list, note it
    if (shoppingList.length > 0) {
      result.push({ id: "seasonal-available", type: "info", icon: TrendingUp, title: `${shoppingList.length} productos en tu lista de compras estacional`, detail: `Ahorro estimado: $${shoppingList.reduce((s, i) => s + i.quantityKg * i.pricePerKg, 0).toFixed(0)}`, href: "/panel/temporada" })
    } else {
      // Generic seasonal alert
      const estacionalInfo = currentMonth >= 3 && currentMonth <= 5 ? "Primavera — ideal para verduras frescas y frutas" :
        currentMonth >= 6 && currentMonth <= 8 ? "Verano — mangos, aguacates, jitomates en su mejor momento" :
        currentMonth >= 9 && currentMonth <= 11 ? "Otoño — calabazas, chiles, granos de temporada" :
        "Invierno — cítricos y verduras de hoja verde en temporada"
      result.push({ id: "seasonal-tip", type: "info", icon: Calendar, title: "Productos de temporada disponibles", detail: estacionalInfo, href: "/panel/temporada" })
    }

    // 5. Apertura checklist low completion
    const aperturaTotal = 6 // approximate minimum for any collection
    const aperturaPct = aperturaTotal > 0 ? (aperturaChecked.length / aperturaTotal) * 100 : 0
    if (aperturaChecked.length > 0 && aperturaPct < 50) {
      result.push({ id: "apertura-incomplete", type: "warning", icon: AlertCircle, title: "Kit de apertura: menos del 50% completado", detail: `Solo ${aperturaChecked.length} de ~${aperturaTotal} pasos verificados`, href: "/panel/apertura" })
    } else if (aperturaChecked.length === 0 && aperturaTotal > 0) {
      result.push({ id: "apertura-not-started", type: "info", icon: ClipboardCheck, title: "Kit de apertura sin iniciar", detail: "Empieza a verificar los pasos para abrir tu restaurante", href: "/panel/apertura" })
    }

    // 6. Planned-menu stock projection alert
    if (projectionShortfall > 0 && sharedDishes.length > 0) {
      result.push({ id: "projection-shortfall", type: "warning", icon: AlertTriangle, title: `Te falta stock para tu menú planeado (${projectionShortfall} ingrediente${projectionShortfall !== 1 ? "s" : ""})`, detail: `Con ${covers} comensales planificados, revisa los faltantes calculados por receta`, href: "/panel/inventario" })
    }

    // 7. Sales goal — behind pace at midday
    if (ventasMetaDia > 0 && todaySales) {
      const hour = new Date().getHours()
      if (hour >= 14 && todaySales.revenue / ventasMetaDia < 0.5) {
        result.push({
          id: "ventas-goal-behind",
          type: "warning",
          icon: Zap,
          title: "Vas por debajo del 50% de tu meta de ventas",
          detail: `$${todaySales.revenue.toFixed(0)} de $${ventasMetaDia.toFixed(0)} (${Math.round((todaySales.revenue / ventasMetaDia) * 100)}%) — media jornada superada`,
          href: "/panel/ventas",
        })
      }
    }

    // 8. Irregular sales (antifraud heuristics on today's entries)
    if (todaySales && todaySales.count > 0) {
      const today = new Date().toISOString().slice(0, 10)
      const todayEntries = ventasEntries.filter((e) => e.date === today)
      const irregular = todayEntries.filter((e) => {
        const total = hubEntryTotal(e)
        if (ventasUmbralTicket > 0 && total > ventasUmbralTicket) return true
        if (e.quantity >= 20) return true
        if (e.discount && e.discount.type === "porcentaje" && e.discount.value > 30) return true
        if (e.unitPrice <= 0) return true
        return false
      })
      if (irregular.length > 0) {
        result.push({
          id: "ventas-irregular",
          type: "danger",
          icon: AlertTriangle,
          title: `Posibles ventas irregulares (${irregular.length})`,
          detail: `${irregular.slice(0, 2).map((e) => e.dishName).join(", ")}${irregular.length > 2 ? ` +${irregular.length - 2} más` : ""} — revisa el panel de alertas en Ventas`,
          href: "/panel/ventas",
        })
      }
    }

    // 9. Loyalty — frequent customers worth rewarding
    if (clientes.length > 0) {
      const frecuentes = clientes.filter((c) => c.visitas >= 10 || c.puntos >= 500)
      if (frecuentes.length > 0) {
        const top = [...frecuentes].sort((a, b) => (b.puntos + b.visitas * 10) - (a.puntos + a.visitas * 10))[0]!
        result.push({
          id: "clientes-frecuentes",
          type: "success",
          icon: Gift,
          title: `${frecuentes.length} cliente${frecuentes.length !== 1 ? "s" : ""} frecuente${frecuentes.length !== 1 ? "s" : ""} para premiar`,
          detail: `${top.nombre} tiene ${top.puntos} pts y ${top.visitas} visitas — ofrécele un descuento por fidelidad`,
          href: "/panel/ventas",
        })
      }
    }

    // Limit to alertCap
    return result.slice(0, panelCfg.alertCap)
  }, [selectedCollection, inventarioItems, sharedDishes, mermaEntries, monthlyGoal, shoppingList, aperturaChecked, projectionShortfall, covers, activeComandas, ventasMetaDia, todaySales, ventasEntries, ventasUmbralTicket, panelCfg, clientes, mesasInfo])

  return (
    <div>
      {/* Hero section */}
      <div className="mb-8">
        {selectedCollection ? (
          <div className="bg-gradient-to-r from-[#F0FDF4] to-[#E8F5E8] rounded-2xl p-6 sm:p-8 border border-[#108910]/10">
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 bg-[#108910]/10 rounded-2xl flex items-center justify-center shrink-0">
                <ChefHat className="w-7 h-7 text-[#108910]" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">
                  Panel para {selectedCollection.name}
                </h2>
                <p className="text-gray-500 max-w-2xl">
                  Todas las herramientas están calibradas para tu tipo de cocina. 
                  Resurte.me es tu único proveedor: todos los precios, sugerencias 
                  y cálculos usan nuestro catálogo real.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-2xl p-6 sm:p-8 border border-gray-200 shadow-sm">
            <div className="flex items-start gap-4 mb-6">
              <div className="w-14 h-14 bg-amber-100 rounded-2xl flex items-center justify-center shrink-0">
                <Store className="w-7 h-7 text-amber-600" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">
                  ¡Elige tu tipo de restaurante!
                </h2>
                <p className="text-gray-500 max-w-2xl">
                  Selecciona el tipo de cocina de tu negocio. Así personalizamos 
                  cada herramienta con sugerencias, precios e insumos relevantes 
                  para ti. Todo basado en el catálogo real de Resurte.me.
                </p>
              </div>
            </div>

            {/* Collection picker grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
              {collections.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelectedCollection(c)}
                  className="flex flex-col items-center gap-1.5 p-3 rounded-xl border border-gray-100 hover:border-[#108910]/30 hover:bg-[#F0FDF4] transition-all text-center group"
                >
                  <span className="text-2xl group-hover:scale-110 transition-transform">
                    {COLLECTION_ICONS[c.slug] || "🍽️"}
                  </span>
                  <span className="text-xs font-medium text-gray-600 group-hover:text-[#108910] leading-tight">
                    {c.name}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Live stats widgets */}
      {selectedCollection && stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3 mb-6">
          <div className="bg-white rounded-xl border border-gray-100 p-4 text-center">
            <div className="w-9 h-9 bg-blue-50 rounded-lg flex items-center justify-center mx-auto mb-2">
              <PieChart className="w-4 h-4 text-blue-600" />
            </div>
            <p className="text-xl font-extrabold text-gray-900">{stats.dishesCount}</p>
            <p className="text-[11px] text-gray-400">Platillos costeados</p>
            {stats.totalCosteo > 0 && (
              <p className="text-[10px] text-blue-600 font-medium mt-1">Costo: ${stats.totalCosteo.toFixed(0)}</p>
            )}
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-4 text-center">
            <div className="w-9 h-9 bg-blue-50 rounded-lg flex items-center justify-center mx-auto mb-2">
              <Percent className="w-4 h-4 text-blue-600" />
            </div>
            <p className={`text-xl font-extrabold ${stats.avgFoodCost > panelCfg.foodCostRedAbove ? "text-red-700" : stats.avgFoodCost > panelCfg.foodCostGreenMax ? "text-amber-700" : "text-green-700"}`}>
              {stats.dishesCount > 0 ? `${stats.avgFoodCost.toFixed(1)}%` : "—"}
            </p>
            <p className="text-[11px] text-gray-400">Food cost promedio</p>
            {stats.dishesCount > 0 && (
              <div className="w-full bg-gray-100 rounded-full h-1.5 mt-1.5 overflow-hidden">
                <div
                  className={`h-full rounded-full ${stats.avgFoodCost > panelCfg.foodCostRedAbove ? "bg-red-500" : stats.avgFoodCost > panelCfg.foodCostGreenMax ? "bg-amber-500" : "bg-green-500"}`}
                  style={{ width: `${Math.min(stats.avgFoodCost, 100)}%` }}
                />
              </div>
            )}
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-4 text-center">
            <div className="w-9 h-9 bg-red-50 rounded-lg flex items-center justify-center mx-auto mb-2">
              <DollarSign className="w-4 h-4 text-red-600" />
            </div>
            <p className={`text-xl font-extrabold ${stats.totalMerma > 1000 ? "text-red-700" : "text-gray-900"}`}>
              ${stats.totalMerma.toFixed(0)}
            </p>
            <p className="text-[11px] text-gray-400">Pérdida por merma</p>
            {stats.mermaCount > 0 && (
              <p className="text-[10px] text-red-500 font-medium mt-1">{stats.mermaCount} registros</p>
            )}
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-4 text-center">
            <div className="w-9 h-9 bg-emerald-50 rounded-lg flex items-center justify-center mx-auto mb-2">
              <BarChart3 className="w-4 h-4 text-emerald-600" />
            </div>
            <p className={`text-xl font-extrabold ${stats.mermaVsGoal > 100 ? "text-red-700" : "text-emerald-700"}`}>
              {stats.monthlyGoal > 0 ? `${stats.mermaVsGoal.toFixed(0)}%` : "—"}
            </p>
            <p className="text-[11px] text-gray-400">Merma vs meta</p>
            {stats.monthlyGoal > 0 && (
              <div className="w-full bg-gray-100 rounded-full h-1.5 mt-1.5 overflow-hidden">
                <div
                  className={`h-full rounded-full ${stats.mermaVsGoal > 100 ? "bg-red-500" : stats.mermaVsGoal > 100 - panelCfg.mermaMaxPct ? "bg-amber-500" : "bg-emerald-500"}`}
                  style={{ width: `${Math.min(stats.mermaVsGoal, 100)}%` }}
                />
              </div>
            )}
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-4 text-center">
            <div className="w-9 h-9 bg-green-50 rounded-lg flex items-center justify-center mx-auto mb-2">
              <TrendingUp className="w-4 h-4 text-green-600" />
            </div>
            <div className="flex items-center justify-center gap-2">
              <span className="text-xl font-extrabold text-green-700">{stats.green}</span>
              {stats.red > 0 && (
                <span className="text-xl font-extrabold text-red-500">{stats.red}</span>
              )}
            </div>
            <p className="text-[11px] text-gray-400">Semáforo rentabilidad</p>
            <p className="text-[10px] text-gray-400 mt-1">
              <span className="text-green-600">● {stats.green}</span>{" "}
              <span className="text-red-500">● {stats.red}</span>
            </p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-4 text-center">
            <div className="w-9 h-9 bg-purple-50 rounded-lg flex items-center justify-center mx-auto mb-2">
              <ShoppingCart className="w-4 h-4 text-purple-600" />
            </div>
            <p className={`text-xl font-extrabold ${stats.seasonalSavings > 0 ? "text-purple-700" : "text-gray-400"}`}>
              {stats.seasonalSavings > 0 ? `$${stats.seasonalSavings.toFixed(0)}` : "—"}
            </p>
            <p className="text-[11px] text-gray-400">Ahorro estacional</p>
            {stats.seasonalSavings > 0 && (
              <p className="text-[10px] text-purple-500 font-medium mt-1">Lista de compras</p>
            )}
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-4 text-center">
            <div className="w-9 h-9 bg-amber-50 rounded-lg flex items-center justify-center mx-auto mb-2">
              <UtensilsCrossed className="w-4 h-4 text-amber-600" />
            </div>
            <p className={`text-xl font-extrabold ${mesasInfo.occupied > 0 ? "text-amber-700" : "text-gray-400"}`}>
              {mesas.length > 0 ? `${mesasInfo.occupied}/${mesasInfo.total}` : "—"}
            </p>
            <p className="text-[11px] text-gray-400">Mesas ocupadas</p>
            {mesasInfo.longCount > 0 && (
              <p className="text-[10px] text-amber-600 font-medium mt-1">{`${mesasInfo.longCount} > 3 h`}</p>
            )}
          </div>
        </div>
      )}

      {/* Day summary — Resumen del día */}
      {selectedCollection && todaySales && (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden mb-6">
          <div className="flex items-center justify-between p-4 pb-3">
            <div className="flex items-center gap-2">
              <Receipt className="w-5 h-5 text-[#108910]" />
              <h3 className="font-semibold text-gray-900 text-sm">Resumen del día</h3>
              {todaySales.count === 0 && (
                <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Sin ventas aún</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={copyDaySummary}
                disabled={todaySales.count === 0 && todaySales.todayMerma === 0}
                className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="Copiar resumen del día"
                aria-label="Copiar resumen del día"
              >
                <Copy className="w-3.5 h-3.5" />
                Copiar resumen
              </button>
              <Link href="/panel/ventas" className="text-xs font-semibold text-[#108910] hover:text-green-800 flex items-center gap-1">
                Registrar ventas
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 px-4 pb-4">
            <div className="bg-green-50 rounded-xl p-3 text-center">
              <p className="text-[10px] text-green-600">Ingresos hoy</p>
              <p className="text-lg font-extrabold text-green-700">${todaySales.revenue.toFixed(0)}</p>
            </div>
            <div className="bg-blue-50 rounded-xl p-3 text-center">
              <p className="text-[10px] text-blue-600">Margen bruto</p>
              <p className="text-lg font-extrabold text-blue-700">${todaySales.margin.toFixed(0)}</p>
            </div>
            <div className="bg-purple-50 rounded-xl p-3 text-center">
              <p className="text-[10px] text-purple-600">Ticket promedio</p>
              <p className="text-lg font-extrabold text-purple-700">{todaySales.count > 0 ? `$${todaySales.avgTicket.toFixed(0)}` : "—"}</p>
            </div>
            <div className="bg-amber-50 rounded-xl p-3 text-center">
              <p className="text-[10px] text-amber-600">Unidades</p>
              <p className="text-lg font-extrabold text-amber-700">{todaySales.units}</p>
            </div>
          </div>
          <div className="border-t border-gray-100 px-4 py-3 grid sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <p className="text-[10px] font-semibold text-gray-400 uppercase">Por método de pago</p>
              {todaySales.methods.filter((m) => m.count > 0).length === 0 ? (
                <p className="text-xs text-gray-400">Sin ventas registradas hoy.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {todaySales.methods.filter((m) => m.count > 0).map((m) => (
                    <span key={m.key} className="text-[11px] bg-gray-50 border border-gray-100 rounded-lg px-2 py-1 text-gray-700">
                      {m.icon} {m.label}: <b>${m.revenue.toFixed(0)}</b> ({m.count})
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-2">
              <p className="text-[10px] font-semibold text-gray-400 uppercase">Hoy</p>
              <div className="flex flex-wrap gap-1.5">
                <span className="text-[11px] bg-gray-50 border border-gray-100 rounded-lg px-2 py-1 text-gray-700">
                  Food cost real: <b>{todaySales.foodCost.toFixed(1)}%</b>
                </span>
                <span className="text-[11px] bg-gray-50 border border-gray-100 rounded-lg px-2 py-1 text-gray-700">
                  Merma: <b>${todaySales.todayMerma.toFixed(0)}</b>
                </span>
                <span className="text-[11px] bg-gray-50 border border-gray-100 rounded-lg px-2 py-1 text-gray-700">
                  {todaySales.count} registro{todaySales.count !== 1 ? "s" : ""}
                </span>
                <span className="text-[11px] bg-amber-50 border border-amber-100 rounded-lg px-2 py-1 text-amber-700">
                  🎁 Puntos otorgados hoy: <b>{puntosHoy}</b>
                </span>
              </div>
            </div>
          </div>
          {goalProgress && goalProgress.goal > 0 && (
            <div className="border-t border-gray-100 px-4 py-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-semibold text-gray-400 uppercase flex items-center gap-1">
                  <Target className="w-3.5 h-3.5 text-purple-600" />
                  Meta del día
                </span>
                <span className={`text-xs font-bold ${goalProgress.pct >= 100 ? "text-green-600" : goalProgress.pct >= 50 ? "text-[#108910]" : "text-amber-600"}`}>
                  ${todaySales.revenue.toFixed(0)} / ${goalProgress.goal.toFixed(0)} ({goalProgress.projected}%)
                </span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${goalProgress.pct >= 100 ? "bg-green-500" : goalProgress.pct >= 50 ? "bg-[#108910]" : "bg-amber-500"}`}
                  style={{ width: `${Math.min(goalProgress.pct, 100)}%` }}
                />
              </div>
              <p className="text-[10px] text-gray-400 mt-1.5">
                {goalProgress.pct >= 100 ? "¡Meta cumplida! 🎉" : goalProgress.pct >= 50 ? `Vas al ${goalProgress.projected}% de tu meta del día.` : "Aún por debajo del 50% de tu meta."}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Kitchen monitor — comandas activas */}
      {selectedCollection && (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden mb-6">
          <div className="flex items-center justify-between p-4 pb-3">
            <div className="flex items-center gap-2">
              <Flame className="w-5 h-5 text-orange-500" />
              <h3 className="font-semibold text-gray-900 text-sm">Monitor de cocina</h3>
              {activeComandas.active > 0 ? (
                <span className="text-[10px] bg-orange-50 text-orange-700 px-2 py-0.5 rounded-full font-medium">
                  {activeComandas.active} activa{activeComandas.active !== 1 ? "s" : ""}
                </span>
              ) : (
                <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Sin comandas activas</span>
              )}
            </div>
            <Link href="/panel/comanda" className="text-xs font-semibold text-[#108910] hover:text-green-800 flex items-center gap-1">
              Abrir monitor
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          <div className="grid grid-cols-3 gap-2 px-4 pb-4">
            <div className="bg-gray-50 rounded-xl p-3 text-center">
              <p className="text-[10px] text-gray-500">Pendientes</p>
              <p className="text-lg font-extrabold text-amber-600">{activeComandas.pendiente}</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-3 text-center">
              <p className="text-[10px] text-gray-500">En cocina</p>
              <p className="text-lg font-extrabold text-blue-600">{activeComandas.enCocina}</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-3 text-center">
              <p className="text-[10px] text-gray-500">Listas hoy</p>
              <p className="text-lg font-extrabold text-green-600">{activeComandas.readyToday}</p>
            </div>
          </div>
        </div>
      )}

      {/* Legend when no collection selected */}
      {!selectedCollection && (
        <p className="text-center text-sm text-gray-400 mb-6">
          Escoge tu tipo de restaurante para activar las herramientas
        </p>
      )}

      {/* Alerts panel */}
      {selectedCollection && alerts.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden mb-6">
          <button
            onClick={() => setShowAlerts(!showAlerts)}
            className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Bell className="w-5 h-5 text-amber-500" />
              <h3 className="font-semibold text-gray-900">Alertas</h3>
              <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">{alerts.length}</span>
            </div>
            <div className="flex items-center gap-1 text-xs text-gray-400">
              {showAlerts ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </div>
          </button>
          {showAlerts && (
            <div className="border-t border-gray-100 divide-y divide-gray-50">
              {alerts.map((alert) => {
                const colorMap: Record<string, string> = {
                  danger: "bg-red-50 border-red-200",
                  warning: "bg-amber-50 border-amber-200",
                  info: "bg-blue-50 border-blue-200",
                  success: "bg-green-50 border-green-200",
                }
                const iconColorMap: Record<string, string> = {
                  danger: "text-red-500",
                  warning: "text-amber-500",
                  info: "text-blue-500",
                  success: "text-green-500",
                }
                return (
                  <Link
                    key={alert.id}
                    href={alert.href}
                    className={`flex items-start gap-3 p-3.5 mx-3 my-1.5 rounded-xl border transition-colors hover:shadow-sm ${colorMap[alert.type]}`}
                  >
                    <alert.icon className={`w-4 h-4 shrink-0 mt-0.5 ${iconColorMap[alert.type]}`} />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-800">{alert.title}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{alert.detail}</p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-gray-300 shrink-0 ml-auto" />
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      )}

      {selectedCollection && alerts.length === 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-4 mb-6 flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-green-500" />
          <span className="text-sm text-gray-600">Todo en orden ✅ — No hay alertas pendientes.</span>
        </div>
      )}
      {selectedCollection && (
        <div className="flex items-center gap-2 mb-6">
          <span className="text-xs text-gray-400 flex items-center gap-1">
            <Zap className="w-3.5 h-3.5" />
            Acciones rápidas:
          </span>
          <button
            onClick={() => router.push("/panel/costeo")}
            className="text-xs font-semibold bg-blue-50 text-blue-700 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors"
          >
            + Nuevo platillo
          </button>
          <button
            onClick={() => router.push("/panel/mermas")}
            className="text-xs font-semibold bg-red-50 text-red-700 hover:bg-red-100 px-3 py-1.5 rounded-lg transition-colors"
          >
            + Registrar merma
          </button>
          <button
            onClick={() => router.push("/panel/apertura")}
            className="text-xs font-semibold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-colors"
          >
            ✓ Checklist apertura
          </button>
          <span className="text-[10px] text-gray-300 mx-1">|</span>
          <button
            onClick={backupData}
            className="text-xs font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1"
            title="Exportar todos los datos de esta colección a un archivo JSON"
          >
            💾 Respaldo
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="text-xs font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1"
            title="Restaurar datos desde un archivo JSON de respaldo"
          >
            📥 Restaurar
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) onRestoreFileSelected(file)
              e.target.value = ""
            }}
          />
        </div>
      )}

      {/* Recent activity */}
      {selectedCollection && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <Clock className="w-4 h-4 text-gray-400" /> Actividad reciente
          </h3>
          <div className="space-y-2">
            {sharedDishes.length > 0 && (
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                <span><strong>{sharedDishes.length}</strong> platillos en tu menú costeado</span>
              </div>
            )}
            {mermaEntries.length > 0 && (
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                <span><strong>{mermaEntries.length}</strong> registros de merma — ${mermaEntries.reduce((s, e) => s + (e.amountKg * e.costPerKg), 0).toFixed(0)} en pérdidas</span>
              </div>
            )}
            {aperturaChecked.length > 0 && (
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />
                <span><strong>{aperturaChecked.length}</strong> pasos completados del kit de apertura</span>
              </div>
            )}
            {sharedDishes.length === 0 && mermaEntries.length === 0 && aperturaChecked.length === 0 && (
              <p className="text-xs text-gray-400">Aún no hay actividad. ¡Empieza a usar las herramientas!</p>
            )}
          </div>
        </div>
      )}
      {selectedCollection && (
        <button onClick={() => setShowSearch(true)} className="w-full mb-6 bg-white rounded-xl border border-gray-100 px-4 py-3 flex items-center gap-3 text-sm text-gray-400 hover:border-gray-200 hover:text-gray-500 transition-colors group">
          <Search className="w-4 h-4 shrink-0" />
          <span className="flex-1 text-left">Buscar platillos, productos, inventario...</span>
          <kbd className="hidden sm:inline-flex items-center gap-1 px-2 py-1 rounded-md bg-gray-50 text-[10px] font-medium text-gray-300 font-mono border border-gray-100 group-hover:border-gray-200">
            <span className="text-xs">⌘</span>K
          </kbd>
        </button>
      )}
      {/* Tool cards grid */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {TOOLS.filter((t) => !t.standalone).map((tool) => (
          <Link
            key={tool.href}
            href={selectedCollection ? tool.href : "#"}
            onClick={(e) => {
              if (!selectedCollection) e.preventDefault()
            }}
            className={`group relative bg-white rounded-2xl border border-gray-100 p-5 hover:shadow-lg hover:border-gray-200 transition-all ${
              !selectedCollection ? "opacity-60 cursor-not-allowed" : ""
            }`}
          >
            <div className={`w-11 h-11 ${tool.bgColor} rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
              <tool.icon className={`w-5 h-5 ${tool.color}`} />
            </div>
            <h3 className="text-base font-bold text-gray-900 mb-1.5">{tool.title}</h3>
            <p className="text-sm text-gray-500 leading-relaxed mb-3">
              {selectedCollection && tool.collectionDesc
                ? tool.collectionDesc(selectedCollection.name)
                : tool.description}
            </p>
            <div className="flex items-center gap-1 text-sm font-semibold text-[#108910] group-hover:gap-2 transition-all">
              {selectedCollection ? "Abrir herramienta" : "Selecciona tu cocina"}
              <ArrowRight className="w-4 h-4" />
            </div>
            {!selectedCollection && (
              <div className="absolute inset-0 bg-white/40 rounded-2xl flex items-center justify-center">
                <span className="text-xs font-semibold text-gray-400 bg-white px-3 py-1.5 rounded-full border border-gray-200 shadow-sm">
                  🔒 Bloqueado
                </span>
              </div>
            )}
          </Link>
        ))}
      </div>
      {/* Sección Sistema de pedidos */}
      <div className="mt-8 mb-3 flex items-center gap-2">
        <UtensilsCrossed className="w-4 h-4 text-emerald-600" />
        <h2 className="text-sm font-black text-stone-900 uppercase tracking-wide">Sistema de pedidos</h2>
        <span className="text-xs text-emerald-600 font-semibold bg-emerald-50 px-2 py-0.5 rounded-full">Incluido gratis para clientes Resurte</span>
        <div className="flex-1 h-px bg-stone-200" />
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {TOOLS.filter((t) => t.standalone).map((tool) => (
          <Link
            key={tool.href}
            href={tool.href}
            className="group relative bg-white rounded-2xl border border-gray-100 p-5 hover:shadow-lg hover:border-gray-200 transition-all"
          >
            <div className={`w-11 h-11 ${tool.bgColor} rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
              <tool.icon className={`w-5 h-5 ${tool.color}`} />
            </div>
            <h3 className="text-base font-bold text-gray-900 mb-1.5">{tool.title}</h3>
            <p className="text-sm text-gray-500 leading-relaxed mb-3">{tool.description}</p>
            <div className="flex items-center gap-1 text-sm font-semibold text-[#108910] group-hover:gap-2 transition-all">
              Abrir herramienta
              <ArrowRight className="w-4 h-4" />
            </div>
          </Link>
        ))}
      </div>
      {showRestoreConfirm && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-xl">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              <h3 className="font-bold text-gray-900">¿Restaurar respaldo?</h3>
            </div>
            <p className="text-sm text-gray-500 mb-2">
              Se reemplazarán los datos actuales de esta colección con los del archivo. Esta acción no se puede deshacer.
            </p>
            <p className="text-xs text-gray-400 mb-4">
              {pendingBackup ? Object.keys(pendingBackup).length : 0} secciones de datos serán restauradas.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => { setShowRestoreConfirm(false); setPendingBackup(null) }}
                className="text-xs font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 px-4 py-2 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={confirmRestore}
                className="text-xs font-semibold text-white bg-[#108910] hover:bg-green-800 px-4 py-2 rounded-lg transition-colors"
              >
                Restaurar
              </button>
            </div>
          </div>
        </div>
      )}
      <GlobalSearch open={showSearch} onClose={() => setShowSearch(false)} slug={slug} />
    </div>
  )
}
