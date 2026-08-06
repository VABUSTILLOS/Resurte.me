"use client"

import { useRestaurant } from "@/contexts/restaurant-context"
import { useSharedDishes, useLocalStorage } from "@/hooks/use-local-storage"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMemo, useState, useEffect, useCallback } from "react"
import {
  Calculator, ShoppingCart, Trash2, TrendingUp,
  Calendar, ClipboardCheck, ArrowRight, ChefHat, Store,
  PieChart, DollarSign, BarChart3, Zap, Clock, Percent, Package,
  AlertTriangle, Bell, AlertCircle, CheckCircle2, ChevronDown, ChevronUp, Search,
} from "lucide-react"
import { GlobalSearch } from "@/components/global-search"

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
]

export default function PanelPage() {
  const { selectedCollection, collections, setSelectedCollection } = useRestaurant()
  const slug = selectedCollection?.slug || null
  const router = useRouter()
  const [sharedDishes] = useSharedDishes(slug)
  const [mermaEntries] = useLocalStorage<{ amountKg: number; costPerKg: number; category: string; id: string; date: string }[]>("mermas-entries", [], slug)
  const [aperturaChecked] = useLocalStorage<string[]>("apertura-checked", [], slug)
  const [monthlyGoal] = useLocalStorage<number>("merma-monthly-goal", 0, slug)
  const [shoppingList] = useLocalStorage<{ key: string; name: string; pricePerKg: number; quantityKg: number }[]>("temporada-shopping-list", [], slug)
  const [inventarioItems] = useLocalStorage<{ id: string; name: string; stock: number; minStock: number; unit: string; pricePerUnit: number; category?: string }[]>("inventario-items", [], slug)

  const [showAlerts, setShowAlerts] = useState(true)
  const [showSearch, setShowSearch] = useState(false)

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
      return d.sellingPrice > 0 && (cost / d.sellingPrice) * 100 <= 30
    }).length
    const red = sharedDishes.filter((d) => {
      const cost = d.ingredients.reduce((si, i) => si + (i.quantity * i.unitPrice), 0)
      return d.sellingPrice > 0 && (cost / d.sellingPrice) * 100 > 38
    }).length
    return { totalCosteo, totalMerma, green, red, dishesCount: sharedDishes.length, mermaCount: mermaEntries.length, aperturaCount: aperturaChecked.length, avgFoodCost, avgMargin, monthLoss, mermaVsGoal, seasonalSavings, totalPrice, monthlyGoal }
  }, [sharedDishes, mermaEntries, aperturaChecked, selectedCollection, monthlyGoal, shoppingList])

  // Alerts computation
  const alerts = useMemo(() => {
    if (!selectedCollection) return []
    type Alert = { id: string; type: "danger" | "warning" | "info" | "success"; icon: typeof AlertTriangle; title: string; detail: string; href: string }
    const result: Alert[] = []

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
      return d.sellingPrice > 0 && (cost / d.sellingPrice) * 100 > 38
    })
    if (highCostDishes.length > 0) {
      result.push({ id: "high-foodcost", type: "danger", icon: AlertTriangle, title: `${highCostDishes.length} platillo(s) con food cost > 38%`, detail: `${highCostDishes.map((d) => d.name).join(", ")}`, href: "/panel/rentabilidad" })
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

    // Limit to 5
    return result.slice(0, 5)
  }, [selectedCollection, inventarioItems, sharedDishes, mermaEntries, monthlyGoal, shoppingList, aperturaChecked])

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
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
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
            <p className={`text-xl font-extrabold ${stats.avgFoodCost > 38 ? "text-red-700" : stats.avgFoodCost > 30 ? "text-amber-700" : "text-green-700"}`}>
              {stats.dishesCount > 0 ? `${stats.avgFoodCost.toFixed(1)}%` : "—"}
            </p>
            <p className="text-[11px] text-gray-400">Food cost promedio</p>
            {stats.dishesCount > 0 && (
              <div className="w-full bg-gray-100 rounded-full h-1.5 mt-1.5 overflow-hidden">
                <div
                  className={`h-full rounded-full ${stats.avgFoodCost > 38 ? "bg-red-500" : stats.avgFoodCost > 30 ? "bg-amber-500" : "bg-green-500"}`}
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
                  className={`h-full rounded-full ${stats.mermaVsGoal > 100 ? "bg-red-500" : stats.mermaVsGoal > 75 ? "bg-amber-500" : "bg-emerald-500"}`}
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
        {TOOLS.map((tool) => (
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
      <GlobalSearch open={showSearch} onClose={() => setShowSearch(false)} />
    </div>
  )
}
