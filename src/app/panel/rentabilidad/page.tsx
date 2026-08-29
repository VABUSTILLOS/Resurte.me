"use client"

import { useMemo, useState } from "react"
import { useRestaurant } from "@/contexts/restaurant-context"
import { useSharedDishes, useLocalStorage } from "@/hooks/use-local-storage"
import { useSyncedStorage } from "@/hooks/use-synced-storage"
import { useSyncedRows } from "@/hooks/use-synced-rows"
import { useToast } from "@/components/toast"
import { t } from "@/lib/i18n/es"
import { foodCostStatus, usePanelConfig } from "@/lib/panel-config"
import { normalizeName } from "@/lib/normalize"
import { isCurrentMonth } from "@/lib/panel-utils"
import EmptyState from "@/components/panel/EmptyState"
import Link from "next/link"
import {
  TrendingUp, ArrowLeft, Circle, AlertTriangle, CheckCircle2,
  DollarSign, Download, Trash2, Printer,
} from "lucide-react"
import type { WasteEntry } from "@/components/panel/mermas/mermas-shared"
import { entryTotal } from "@/components/panel/ventas/ventas-shared"
import type { SaleEntry } from "@/components/panel/ventas/ventas-shared"
import ToolGuideHost from "@/components/panel/guide/tool-guide-host"

interface DishData { name: string; cost: number; price: number; category: string; alert?: string }

// Mock dishes per collection with profitability data
const DISH_DATA: Record<string, DishData[]> = {
  "hamburguesas-hot-dogs": [
    { name: "Hamburguesa clásica", cost: 48, price: 149, category: "Burgers" },
    { name: "Hamburguesa doble", cost: 72, price: 189, category: "Burgers" },
    { name: "Hamburguesa de pollo", cost: 38, price: 129, category: "Burgers" },
    { name: "Hot dog sencillo", cost: 22, price: 59, category: "Hot Dogs" },
    { name: "Hot dog especial", cost: 35, price: 85, category: "Hot Dogs" },
    { name: "Papas fritas", cost: 18, price: 69, category: "Acompañamiento" },
    { name: "Aros de cebolla", cost: 15, price: 55, category: "Acompañamiento" },
    { name: "Hamburguesa vegetariana", cost: 42, price: 139, category: "Burgers", alert: "Costo elevado — considera ajustar porción de portobello" },
  ],
  "taquerias-antojitos": [
    { name: "Taco de asada", cost: 14, price: 35, category: "Tacos" },
    { name: "Taco de pastor", cost: 10, price: 30, category: "Tacos" },
    { name: "Taco de suadero", cost: 12, price: 32, category: "Tacos" },
    { name: "Gringa", cost: 28, price: 75, category: "Especialidades" },
    { name: "Quesadilla", cost: 18, price: 45, category: "Antojitos" },
    { name: "Sopes (3 pz)", cost: 22, price: 65, category: "Antojitos" },
    { name: "Orden de guacamole", cost: 25, price: 55, category: "Entradas" },
    { name: "Taco de tripa", cost: 8, price: 28, category: "Tacos", alert: "Precio muy bajo — margen de solo $20" },
  ],
  "pizzas-comida-italiana": [
    { name: "Pizza margherita (mediana)", cost: 42, price: 180, category: "Pizzas" },
    { name: "Pizza pepperoni (mediana)", cost: 55, price: 210, category: "Pizzas" },
    { name: "Pizza hawaiana (mediana)", cost: 48, price: 195, category: "Pizzas" },
    { name: "Pasta alfredo", cost: 35, price: 145, category: "Pastas" },
    { name: "Pasta boloñesa", cost: 40, price: 150, category: "Pastas" },
    { name: "Lasagna", cost: 52, price: 165, category: "Pastas", alert: "Costo alto — verifica precio de queso mozzarella" },
    { name: "Ensalada caprese", cost: 25, price: 95, category: "Entradas" },
  ],
  "comida-mexicana-corrida": [
    { name: "Plato de guisado (con 2 guarniciones)", cost: 32, price: 85, category: "Plato fuerte" },
    { name: "Pechuga empanizada", cost: 38, price: 105, category: "Plato fuerte" },
    { name: "Chiles rellenos (2 pz)", cost: 35, price: 95, category: "Plato fuerte" },
    { name: "Caldo de pollo", cost: 25, price: 75, category: "Caldos" },
    { name: "Enchiladas (4 pz)", cost: 28, price: 80, category: "Plato fuerte" },
    { name: "Flautas (5 pz)", cost: 22, price: 70, category: "Antojitos" },
  ],
  "sushi-comida-asiatica": [
    { name: "California roll (8 pz)", cost: 42, price: 155, category: "Rolls" },
    { name: "Philadelphia roll (8 pz)", cost: 55, price: 185, category: "Rolls" },
    { name: "Spicy tuna roll", cost: 48, price: 170, category: "Rolls" },
    { name: "Ramen de cerdo", cost: 38, price: 145, category: "Caldos" },
    { name: "Gyozas (6 pz)", cost: 25, price: 85, category: "Entradas" },
    { name: "Edamame", cost: 15, price: 55, category: "Entradas" },
    { name: "Nigiri mix (5 pz)", cost: 68, price: 220, category: "Especialidades", alert: "Costo elevado — revisa precio de salmón" },
  ],
  "cortes-carne-asaderos": [
    { name: "Ribeye 350g", cost: 215, price: 520, category: "Cortes" },
    { name: "Arrachera 300g", cost: 105, price: 320, category: "Cortes" },
    { name: "Chorizo argentino", cost: 35, price: 110, category: "Embutidos" },
    { name: "Papa asada", cost: 12, price: 45, category: "Guarnición" },
    { name: "Cebollitas cambray", cost: 18, price: 55, category: "Guarnición" },
    { name: "Tabla mixta (2 personas)", cost: 280, price: 650, category: "Especialidades" },
  ],
  "pollo-alitas": [
    { name: "Alitas 10 pz", cost: 42, price: 140, category: "Alitas" },
    { name: "Boneless 300g", cost: 48, price: 155, category: "Boneless" },
    { name: "Papas fritas (grande)", cost: 18, price: 70, category: "Acompañamiento" },
    { name: "Aros de cebolla", cost: 15, price: 60, category: "Acompañamiento" },
    { name: "Combo 20 alitas + papas", cost: 72, price: 220, category: "Combos" },
    { name: "Dedos de queso (6 pz)", cost: 22, price: 75, category: "Entradas" },
  ],
  "mariscos-pescados": [
    { name: "Ceviche de camarón", cost: 55, price: 160, category: "Entradas" },
    { name: "Aguachile", cost: 45, price: 150, category: "Entradas" },
    { name: "Filete empanizado", cost: 42, price: 145, category: "Plato fuerte" },
    { name: "Tacos de camarón (3 pz)", cost: 48, price: 140, category: "Tacos" },
    { name: "Pulpo a las brasas", cost: 72, price: 210, category: "Especialidades" },
    { name: "Tostada de atún", cost: 35, price: 105, category: "Entradas", alert: "Margen bajo — revisa porción" },
  ],
  "cafeterias-crepas-desayunos": [
    { name: "Crepa de Nutella con fresa", cost: 25, price: 89, category: "Crepas dulces" },
    { name: "Crepa de jamón y queso", cost: 22, price: 79, category: "Crepas saladas" },
    { name: "Hot cakes (3 pz)", cost: 18, price: 69, category: "Desayunos" },
    { name: "Omelette 3 ingredientes", cost: 28, price: 95, category: "Desayunos" },
    { name: "Café latte 12oz", cost: 12, price: 52, category: "Bebidas" },
    { name: "Chai latte 12oz", cost: 10, price: 48, category: "Bebidas" },
  ],
  "saludable-ensaladas-pokes": [
    { name: "Poke de salmón", cost: 55, price: 165, category: "Pokes" },
    { name: "Poke de atún", cost: 48, price: 155, category: "Pokes" },
    { name: "Ensalada César con pollo", cost: 35, price: 120, category: "Ensaladas" },
    { name: "Bowl de quinoa", cost: 32, price: 115, category: "Bowls" },
    { name: "Wrap de pollo", cost: 28, price: 95, category: "Wraps" },
    { name: "Smoothie verde", cost: 22, price: 78, category: "Bebidas" },
  ],
  "postres-panaderia-helados": [
    { name: "Pastel de chocolate (rebanada)", cost: 18, price: 72, category: "Pasteles" },
    { name: "Cheesecake", cost: 22, price: 85, category: "Pasteles" },
    { name: "Croissant de almendra", cost: 12, price: 48, category: "Panadería" },
    { name: "Concha gourmet", cost: 8, price: 35, category: "Panadería" },
    { name: "Helado artesanal (2 bolas)", cost: 15, price: 60, category: "Helados" },
    { name: "Macarons (3 pz)", cost: 18, price: 65, category: "Especialidades" },
  ],
  "comida-arabe-griega": [
    { name: "Shawarma de cordero", cost: 45, price: 145, category: "Plato fuerte" },
    { name: "Shawarma de pollo", cost: 28, price: 105, category: "Plato fuerte" },
    { name: "Falafel (5 pz)", cost: 18, price: 70, category: "Entradas" },
    { name: "Hummus con pan pita", cost: 15, price: 60, category: "Entradas" },
    { name: "Gyros de cerdo", cost: 35, price: 120, category: "Plato fuerte" },
    { name: "Ensalada griega", cost: 22, price: 80, category: "Ensaladas" },
  ],
  "comida-venezolana-latina": [
    { name: "Arepa de carne mechada", cost: 22, price: 75, category: "Arepas" },
    { name: "Arepa reina pepiada", cost: 25, price: 80, category: "Arepas" },
    { name: "Cachapa con queso", cost: 20, price: 70, category: "Especialidades" },
    { name: "Patacón con carne", cost: 28, price: 90, category: "Plato fuerte" },
    { name: "Pabellón criollo", cost: 35, price: 120, category: "Plato fuerte" },
    { name: "Tequeños (5 pz)", cost: 18, price: 65, category: "Entradas" },
  ],
  "bebidas-bares-botanas": [
    { name: "Orden de alitas (8 pz)", cost: 38, price: 130, category: "Alitas" },
    { name: "Cacahuates japoneses", cost: 8, price: 35, category: "Botana" },
    { name: "Cueritos preparados", cost: 12, price: 45, category: "Botana" },
    { name: "Papas fritas caseras", cost: 15, price: 60, category: "Acompañamiento" },
    { name: "Tabla de botanas (4 pax)", cost: 55, price: 180, category: "Especialidades" },
    { name: "Palomitas con chile", cost: 5, price: 28, category: "Botana", alert: "Precio bajo — margen mínimo" },
  ],
}

const DEFAULT_DISHES: DishData[] = [
  { name: "Platillo estrella", cost: 45, price: 140, category: "Principal" },
  { name: "Platillo secundario", cost: 35, price: 110, category: "Principal" },
  { name: "Entrada", cost: 18, price: 65, category: "Entrada" },
]

export default function RentabilidadPage() {
  const { selectedCollection } = useRestaurant()
  const slug = selectedCollection?.slug || null
  const [tab, setTab] = useState<"platillos" | "analisis">("platillos")
  const { toast } = useToast()
  const [sharedDishes] = useSharedDishes(slug)
  const [mermaEntries] = useSyncedRows<WasteEntry>("mermas-entries", [], slug)
  const [ventasEntries] = useSyncedRows<SaleEntry>("ventas-entries", [], slug)
  const panelCfg = usePanelConfig(slug)
  const [monthlyGoal] = useSyncedStorage<number>("merma-monthly-goal", 0, slug)
  const [priceOverrides, setPriceOverrides] = useSyncedStorage<Record<string, number>>("rentabilidad-prices", {}, slug)
  const [editingName, setEditingName] = useState<string | null>(null)
  const [editValue, setEditValue] = useState("")
  const [sortBy, setSortBy] = useLocalStorage<string>("rentabilidad-sort", "name", slug)
  const [priceMultiplier, setPriceMultiplier] = useLocalStorage<number>("rentabilidad-sim-price", 0, slug)
  const [categoryFilter, setCategoryFilter] = useState<string>("all")

  // Merma factor: integrates "Merma del mes" into real cost/margin calculations
  const mermaStats = useMemo(() => {
    const monthLoss = mermaEntries
      .filter((e) => isCurrentMonth(e.date))
      .reduce((s, e) => s + e.amountKg * e.costPerKg, 0)
    const mermaPct = monthlyGoal > 0 ? (monthLoss / monthlyGoal) * 100 : 0
    return { monthLoss, mermaPct, hasMerma: mermaEntries.length > 0 }
  }, [mermaEntries, monthlyGoal])
  const mermaFactor = mermaStats.hasMerma && mermaStats.monthLoss > 0 ? 1 + mermaStats.mermaPct / 100 : 1

  // Merge: base mock data + dishes from costeo tool
  const mockDishes = selectedCollection
    ? (DISH_DATA[selectedCollection.slug] || DEFAULT_DISHES)
    : DEFAULT_DISHES

  const costeoDishes: DishData[] = useMemo(() =>
    sharedDishes.map((d) => {
      const totalCost = d.ingredients.reduce((s, i) => s + (i.quantity * i.unitPrice), 0)
      return {
        name: d.name,
        cost: Math.round(totalCost * 100) / 100,
        price: d.sellingPrice,
        category: "Mi menú",
        alert: foodCostStatus((totalCost / d.sellingPrice) * 100, panelCfg) === "red"
          ? t("rentabilidad.highCostAlert")
          : undefined,
      }
    }),
  [sharedDishes, panelCfg])

  const dishes = useMemo(() => {
    // Deduplicate by name (costeo dishes override mock ones)
    const costeoNames = new Set(costeoDishes.map((d) => normalizeName(d.name)))
    const filteredMock = mockDishes.filter((d) => !costeoNames.has(normalizeName(d.name)))
    let merged = [...costeoDishes, ...filteredMock]
    // Apply price overrides
    merged = merged.map((d) => ({
      ...d,
      price: priceOverrides[d.name] ?? d.price,
    }))
    // Apply merma factor into real cost
    if (mermaFactor !== 1) {
      merged = merged.map((d) => ({
        ...d,
        cost: +(d.cost * mermaFactor).toFixed(2),
      }))
    }
    // Apply price multiplier (simulator): explore selling price changes and their margins
    if (priceMultiplier !== 0) {
      merged = merged.map((d) => ({
        ...d,
        price: +(d.price * (1 + priceMultiplier / 100)).toFixed(2),
      }))
    }
    // Sort (values already adjusted)
    merged = [...merged].sort((a, b) => {
      switch (sortBy) {
        case "margin": return (b.price - b.cost) - (a.price - a.cost)
        case "foodcost": return (a.cost / a.price) - (b.cost / b.price)
        case "name": return a.name.localeCompare(b.name)
        case "category": return a.category.localeCompare(b.category)
        default: return 0
      }
    })
    return merged
  }, [mockDishes, costeoDishes, priceOverrides, sortBy, priceMultiplier, mermaFactor])

  // Category analysis: counts, avg food cost, avg margin, semaphore per category
  const categoryAnalysis = useMemo(() => {
    const groups = new Map<string, { count: number; cost: number; price: number }>()
    dishes.forEach((d) => {
      const g = groups.get(d.category) || { count: 0, cost: 0, price: 0 }
      g.count += 1
      g.cost += d.cost
      g.price += d.price
      groups.set(d.category, g)
    })
    return Array.from(groups.entries())
      .map(([category, g]) => {
        const avgFc = (g.cost / g.price) * 100
        const avgMargin = (g.price - g.cost) / g.count
        const st = foodCostStatus(avgFc, panelCfg)
        const status = st === "green" ? "ok" : st === "amber" ? "justo" : "mal"
        return { category, count: g.count, avgFc, avgMargin, status }
      })
      .sort((a, b) => a.avgFc - b.avgFc)
  }, [dishes, panelCfg])

  const worstCategory = useMemo(() => {
    if (categoryAnalysis.length === 0) return null
    const bad = categoryAnalysis.filter((c) => foodCostStatus(c.avgFc, panelCfg) === "red")
    if (bad.length === 0) return null
    return bad.reduce((worst, c) => (c.avgFc > worst.avgFc ? c : worst))
  }, [categoryAnalysis, panelCfg])

  const filteredDishes = useMemo(() => {
    if (categoryFilter === "all") return dishes
    return dishes.filter((d) => d.category === categoryFilter)
  }, [dishes, categoryFilter])

  // Ventas reales del mes cruzadas con el costo del costeo (o el unitCost registrado)
  const realSales = useMemo(() => {
    const monthEntries = ventasEntries.filter((e) => isCurrentMonth(e.date))
    if (monthEntries.length === 0) return null
    const costByName = new Map(dishes.map((d) => [normalizeName(d.name), d.cost]))
    let revenue = 0
    let cost = 0
    let units = 0
    const byDish = new Map<string, { name: string; units: number; margin: number }>()
    monthEntries.forEach((e) => {
      const total = entryTotal(e)
      const unitCost = costByName.get(normalizeName(e.dishName)) ?? e.unitCost ?? 0
      const margin = total - unitCost * e.quantity
      revenue += total
      cost += unitCost * e.quantity
      units += e.quantity
      const key = normalizeName(e.dishName) || e.dishName
      const agg = byDish.get(key) || { name: e.dishName, units: 0, margin: 0 }
      agg.units += e.quantity
      agg.margin += margin
      byDish.set(key, agg)
    })
    const top = Array.from(byDish.values()).sort((a, b) => b.margin - a.margin).slice(0, 3)
    return { revenue, cost, margin: revenue - cost, units, top, entries: monthEntries.length }
  }, [ventasEntries, dishes])

  function exportCSV() {
    const header = t("rentabilidad.csvHeader")
    const rows = dishes.map((d) => {
      const fc = ((d.cost / d.price) * 100).toFixed(1)
      const st = foodCostStatus(parseFloat(fc), panelCfg)
      const status = st === "green" ? t("rentabilidad.statusExcellent") : st === "amber" ? t("rentabilidad.statusAcceptable") : t("rentabilidad.statusReview")
      return `"${d.name}","${d.category}",${d.cost.toFixed(2)},${d.price.toFixed(2)},${(d.price - d.cost).toFixed(2)},${fc}%,${status}`
    })
    const csv = [header, ...rows].join("\n")
    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `rentabilidad-${slug || "menu"}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast(t("rentabilidad.csvExported"), "success")
  }

  function printSummary() {
    const greens = dishes.filter((d) => foodCostStatus((d.cost / d.price) * 100, panelCfg) === "green").length
    const ambers = dishes.filter((d) => foodCostStatus((d.cost / d.price) * 100, panelCfg) === "amber").length
    const reds = dishes.filter((d) => foodCostStatus((d.cost / d.price) * 100, panelCfg) === "red").length
    const statusLabel = (st: string) => st === "ok" ? t("rentabilidad.statusExcellent") : st === "justo" ? t("rentabilidad.statusAcceptable") : t("rentabilidad.statusReview")
    const monthName = new Date().toLocaleDateString("es-MX", { month: "long", year: "numeric" })
    const catRows = categoryAnalysis
      .map((c) => `<tr><td>${c.category}</td><td>${c.count}</td><td>${c.avgFc.toFixed(1)}%</td><td>$${c.avgMargin.toFixed(2)}</td><td>${statusLabel(c.status)}</td></tr>`)
      .join("")
    const realSalesHtml = realSales
      ? `<h2>Ventas reales del mes (${realSales.entries} ventas)</h2>
         <table><tr><th>Ingresos</th><th>Costo</th><th>Margen</th><th>Unidades</th></tr>
         <tr><td>$${realSales.revenue.toFixed(2)}</td><td>$${realSales.cost.toFixed(2)}</td><td>$${realSales.margin.toFixed(2)}</td><td>${realSales.units}</td></tr></table>
         <h3>Top 3 platillos por margen</h3>
         <ol>${realSales.top.map((d) => `<li>${d.name} — $${d.margin.toFixed(2)} (${d.units} uds)</li>`).join("")}</ol>`
      : ""
    const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Resumen de rentabilidad — ${monthName}</title>
      <style>body{font-family:system-ui,sans-serif;max-width:720px;margin:24px auto;padding:0 16px;color:#111}
      h1{font-size:20px}h2{font-size:15px;margin-top:24px}h3{font-size:13px}
      table{border-collapse:collapse;width:100%;font-size:13px}td,th{border:1px solid #ddd;padding:6px 8px;text-align:left}
      .semaforo span{display:inline-block;margin-right:12px;padding:4px 10px;border-radius:8px;font-size:13px}
      .g{background:#dcfce7}.a{background:#fef3c7}.r{background:#fee2e2}
      @media print{button{display:none}}</style></head><body>
      <h1>Resumen de rentabilidad — ${selectedCollection?.name ?? "Menú"}</h1>
      <p>${monthName} · ${dishes.length} platillos analizados</p>
      <p class="semaforo"><span class="g">🟢 ${greens}</span><span class="a">🟡 ${ambers}</span><span class="r">🔴 ${reds}</span></p>
      <h2>Análisis por categoría</h2>
      <table><tr><th>Categoría</th><th>Platillos</th><th>Food cost prom.</th><th>Margen prom.</th><th>Estado</th></tr>${catRows}</table>
      ${realSalesHtml}
      <script>window.onload=()=>window.print()</script></body></html>`
    const win = window.open("", "_blank")
    if (!win) {
      toast(t("rentabilidad.printBlocked"), "error")
      return
    }
    win.document.write(html)
    win.document.close()
  }

  if (!selectedCollection) {
    return (
      <div className="text-center py-16">
        <TrendingUp className="w-12 h-12 text-gray-300 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-gray-700 mb-2">{t("rentabilidad.selectCuisineTitle")}</h3>
        <p className="text-sm text-gray-400 max-w-md mx-auto">
          {t("rentabilidad.selectCuisineDescription")}
        </p>
      </div>
    )
  }

  function getStatus(cost: number, price: number) {
    const pct = (cost / price) * 100
    if (foodCostStatus(pct, panelCfg) === "green") return { color: "green", label: t("rentabilidad.statusExcellent"), icon: CheckCircle2 }
    if (foodCostStatus(pct, panelCfg) === "amber") return { color: "amber", label: t("rentabilidad.statusAcceptable"), icon: AlertTriangle }
    return { color: "red", label: t("rentabilidad.statusReview"), icon: Circle }
  }

  const fcStatus = (pct: number) => foodCostStatus(pct, panelCfg)
  const greenCount = dishes.filter((d) => fcStatus((d.cost / d.price) * 100) === "green").length
  const amberCount = dishes.filter((d) => fcStatus((d.cost / d.price) * 100) === "amber").length
  const redCount = dishes.filter((d) => fcStatus((d.cost / d.price) * 100) === "red").length
  const alerts = dishes.filter((d) => d.alert)


  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <Link href="/panel" className="p-2 rounded-xl hover:bg-gray-100 transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-400" />
        </Link>
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-gray-900">{t("rentabilidad.pageTitle")}</h2>
            <button
              onClick={exportCSV}
              className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded-lg transition-colors"
              aria-label={t("rentabilidad.exportCsvLabel")}
            >
              <Download className="w-3.5 h-3.5" />
              {t("rentabilidad.exportCsv")}
            </button>
            <button
              onClick={printSummary}
              className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 px-2.5 py-1 rounded-lg transition-colors"
              aria-label={t("rentabilidad.printSummaryLabel")}
            >
              <Printer className="w-3.5 h-3.5" />
              {t("rentabilidad.printSummary")}
            </button>
          </div>
          <p className="text-sm text-gray-400">
            {selectedCollection.name}
            {costeoDishes.length > 0 && (
              <span className="ml-2 text-[#0E7A0E] font-medium">
                {t("rentabilidad.fromCosteo", { count: costeoDishes.length })}
              </span>
            )}
          </p>
        </div>
      </div>

      {tab === "platillos" && (
        <>
      {/* Tabs: Platillos / Análisis */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-xl mb-6 w-fit max-w-full overflow-x-auto" role="tablist" aria-label="Secciones de rentabilidad">
        {([
          ["platillos", "Platillos"],
          ["analisis", "Análisis"],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`px-4 py-1.5 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors ${
              tab === key ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Summary bar */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-green-50 rounded-2xl border border-green-200 p-4 text-center">
          <CheckCircle2 className="w-5 h-5 text-green-600 mx-auto mb-1" />
          <p className="text-2xl font-extrabold text-green-700">{greenCount}</p>
          <p className="text-xs text-green-600">{t("rentabilidad.summaryGreen")}</p>
          <p className="text-[10px] text-green-500">{t("rentabilidad.summaryGreenHint")}</p>
        </div>
        <div className="bg-amber-50 rounded-2xl border border-amber-200 p-4 text-center">
          <AlertTriangle className="w-5 h-5 text-amber-600 mx-auto mb-1" />
          <p className="text-2xl font-extrabold text-amber-700">{amberCount}</p>
          <p className="text-xs text-amber-600">{t("rentabilidad.summaryAmber")}</p>
          <p className="text-[10px] text-amber-500">{t("rentabilidad.summaryAmberHint")}</p>
        </div>
        <div className="bg-red-50 rounded-2xl border border-red-200 p-4 text-center">
          <Circle className="w-5 h-5 text-red-600 mx-auto mb-1" />
          <p className="text-2xl font-extrabold text-red-700">{redCount}</p>
          <p className="text-xs text-red-600">{t("rentabilidad.summaryRed")}</p>
          <p className="text-[10px] text-red-500">{t("rentabilidad.summaryRedHint")}</p>
        </div>
      </div>

        </>
      )}

      {tab === "analisis" && (
        <>
      {/* Ventas reales del mes × costeo */}
      {realSales && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <DollarSign className="w-5 h-5 text-[#0E7A0E]" />
            <h3 className="font-bold text-gray-900 text-sm">{t("rentabilidad.realSalesTitle")}</h3>
            <span className="text-[10px] text-gray-400">
              {t("rentabilidad.realSalesEntries", { count: realSales.entries })}
            </span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
            <div className="rounded-xl bg-gray-50 p-3 text-xs">
              <p className="text-gray-400">{t("rentabilidad.realSalesRevenue")}</p>
              <p className="font-bold text-gray-900 text-base">${realSales.revenue.toFixed(0)}</p>
            </div>
            <div className="rounded-xl bg-gray-50 p-3 text-xs">
              <p className="text-gray-400">{t("rentabilidad.realSalesCost")}</p>
              <p className="font-bold text-gray-900 text-base">${realSales.cost.toFixed(0)}</p>
            </div>
            <div className={`rounded-xl p-3 text-xs ${realSales.margin >= 0 ? "bg-green-50" : "bg-red-50"}`}>
              <p className="text-gray-400">{t("rentabilidad.realSalesMargin")}</p>
              <p className={`font-bold text-base ${realSales.margin >= 0 ? "text-green-700" : "text-red-700"}`}>
                ${realSales.margin.toFixed(0)}
              </p>
            </div>
            <div className="rounded-xl bg-gray-50 p-3 text-xs">
              <p className="text-gray-400">{t("rentabilidad.realSalesUnits")}</p>
              <p className="font-bold text-gray-900 text-base">{realSales.units}</p>
            </div>
          </div>
          {realSales.top.length > 0 && (
            <div className="space-y-1">
              {realSales.top.map((d, i) => (
                <div key={i} className="flex items-center justify-between text-xs text-gray-600">
                  <span className="truncate">
                    {i === 0 ? "🥇" : i === 1 ? "🥈" : "🥉"} {d.name}
                    <span className="text-gray-400"> ×{d.units}</span>
                  </span>
                  <span className={`font-semibold ${d.margin >= 0 ? "text-green-700" : "text-red-600"}`}>
                    ${d.margin.toFixed(0)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Category analysis */}
      {categoryAnalysis.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-6">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-[#0E7A0E]" />
              <h3 className="font-bold text-gray-900 text-sm">{t("rentabilidad.categoryAnalysis")}</h3>
            </div>
            {worstCategory && foodCostStatus(worstCategory.avgFc, panelCfg) === "red" && (
              <span className="text-[10px] bg-red-50 text-red-600 px-2 py-1 rounded-full font-semibold">
                {t("rentabilidad.worstFoodCost", { category: worstCategory.category, pct: worstCategory.avgFc.toFixed(1) })}
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
            {categoryAnalysis.map((c) => (
              <div
                key={c.category}
                className={`rounded-xl border p-3 text-xs ${
                  c.status === "ok" ? "bg-green-50 border-green-200" :
                  c.status === "justo" ? "bg-amber-50 border-amber-200" :
                  "bg-red-50 border-red-200"
                }`}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <span>{c.status === "ok" ? "🟢" : c.status === "justo" ? "🟡" : "🔴"}</span>
                  <span className="font-semibold text-gray-800 truncate">{c.category}</span>
                </div>
                <div className="flex items-center justify-between text-gray-500 mt-1">
                  <span>{c.count !== 1 ? t("rentabilidad.dishCountMany", { count: c.count }) : t("rentabilidad.dishCountOne", { count: c.count })}</span>
                  <span className={`font-bold ${c.status === "ok" ? "text-green-700" : c.status === "justo" ? "text-amber-700" : "text-red-700"}`}>
                    {c.avgFc.toFixed(1)}% FC
                  </span>
                </div>
                <p className="text-gray-400 mt-1">{t("rentabilidad.avgMargin", { margin: c.avgMargin.toFixed(0) })}</p>
              </div>
            ))}
          </div>
        </div>
      )}

        </>
      )}

      {tab === "platillos" && (
        <>
      {/* Alert box */}
      {alerts.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-red-600" />
            <h4 className="font-semibold text-red-800 text-sm">{t("rentabilidad.alertsTitle")}</h4>
          </div>
          <div className="space-y-1.5">
            {alerts.map((dish, idx) => (
              <div key={idx} className="flex items-start gap-2 text-xs text-red-700">
                <span className="shrink-0 mt-1 w-1.5 h-1.5 rounded-full bg-red-500" />
                <span><strong>{dish.name}:</strong> {dish.alert}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sort + Simulator controls */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex items-center gap-2 bg-white rounded-xl border border-gray-100 px-3 py-2">
          <span className="text-xs text-gray-400 shrink-0">{t("rentabilidad.sortLabel")}</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="text-xs font-semibold text-gray-700 bg-transparent focus:outline-none"
          >
            <option value="name">{t("rentabilidad.sortName")}</option>
            <option value="margin">{t("rentabilidad.sortMargin")}</option>
            <option value="foodcost">{t("rentabilidad.sortFoodCost")}</option>
            <option value="category">{t("rentabilidad.sortCategory")}</option>
          </select>
        </div>
        <div className="flex items-center gap-2 bg-white rounded-xl border border-gray-100 px-3 py-2">
          <span className="text-xs text-gray-400 shrink-0">{t("rentabilidad.categoryLabel")}</span>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="text-xs font-semibold text-gray-700 bg-transparent focus:outline-none"
            aria-label={t("rentabilidad.categoryFilterLabel")}
          >
            <option value="all">{t("rentabilidad.categoryAll", { count: dishes.length })}</option>
            {categoryAnalysis.map((c) => (
              <option key={c.category} value={c.category}>
                {c.category} ({c.count})
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2 bg-white rounded-xl border border-gray-100 px-3 py-2">
          <span className="text-xs text-gray-400 shrink-0">{t("rentabilidad.simulatorLabel")}</span>
          <input
            type="range"
            min="-30"
            max="50"
            value={priceMultiplier}
            onChange={(e) => setPriceMultiplier(parseFloat(e.target.value))}
            className="flex-1 min-w-0 h-1.5 accent-[#0E7A0E]"
            aria-label={t("rentabilidad.simulatorAria")}
          />
          <span className={`text-xs font-bold w-14 text-right ${priceMultiplier > 0 ? "text-emerald-600" : priceMultiplier < 0 ? "text-red-600" : "text-gray-400"}`}>
            {priceMultiplier > 0 ? "+" : ""}{priceMultiplier}%
          </span>
          {priceMultiplier !== 0 && (
            <button
              onClick={() => setPriceMultiplier(0)}
              className="text-[10px] text-gray-400 hover:text-gray-600 underline whitespace-nowrap"
            >
              {t("rentabilidad.reset")}
            </button>
          )}
        </div>
      </div>
      {priceMultiplier !== 0 && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-2 mb-4 text-xs text-indigo-700 flex items-center gap-2">
          <TrendingUp className="w-3.5 h-3.5 shrink-0" />
          {priceMultiplier > 0
            ? t("rentabilidad.simulatingIncrease", { pct: Math.abs(priceMultiplier) })
            : t("rentabilidad.simulatingDecrease", { pct: Math.abs(priceMultiplier) })}
        </div>
      )}
      {mermaStats.hasMerma && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-2 mb-4 text-xs text-red-700 flex items-center gap-2">
          <Trash2 className="w-3.5 h-3.5 shrink-0" />
          {t("rentabilidad.mermaLoss")} <strong>${mermaStats.monthLoss.toFixed(0)}</strong>
          {monthlyGoal > 0 && (
            <span>{t("rentabilidad.mermaGoal", { pct: mermaStats.mermaPct.toFixed(0), goal: monthlyGoal.toFixed(0) })}</span>
          )}
          <span className="ml-auto text-red-500">{t("rentabilidad.mermaIncluded")}</span>
        </div>
      )}

      {/* Dish cards */}
      {dishes.length === 0 ? (
        <EmptyState
          icon={TrendingUp}
          title={t("rentabilidad.emptyTitle")}
          description={t("rentabilidad.emptyDescription")}
          action={
            <Link
              href="/panel/costeo"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#0E7A0E] text-white text-xs font-semibold rounded-xl hover:bg-[#0D720D] transition-colors"
            >
              <DollarSign className="w-3.5 h-3.5" />
              {t("rentabilidad.emptyAction")}
            </Link>
          }
        />
      ) : (
        <div className="space-y-3">
        {filteredDishes.map((dish, idx) => {
          const status = getStatus(dish.cost, dish.price)
          const foodCost = ((dish.cost / dish.price) * 100).toFixed(1)
          const margin = dish.price - dish.cost

          return (
            <div key={idx} className="bg-white rounded-xl border border-gray-100 p-4 hover:shadow-sm transition-shadow">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <status.icon className={`w-5 h-5 shrink-0 ${
                    status.color === "green" ? "text-green-500" : status.color === "amber" ? "text-amber-500" : "text-red-500"
                  }`} />
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold text-gray-900 text-sm">{dish.name}</h4>
                      <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">
                        {dish.category}
                      </span>
                    </div>
                  </div>
                </div>
                <span className={`text-[10px] px-2 py-1 rounded-full font-bold ${
                  status.color === "green" ? "bg-green-100 text-green-700" :
                  status.color === "amber" ? "bg-amber-100 text-amber-700" :
                  "bg-red-100 text-red-700"
                }`}>
                  {status.label}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-3 mt-3 pt-3 border-t border-gray-50">
                <div className="text-center">
                  <p className="text-[10px] text-gray-400">{t("rentabilidad.costLabel")}</p>
                  <p className="font-bold text-sm text-gray-700">${dish.cost}</p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] text-gray-400">{t("rentabilidad.priceLabel")}</p>
                  {editingName === dish.name ? (
                    <input
                      autoFocus
                      type="number"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onBlur={() => {
                        const newPrice = parseFloat(editValue)
                        if (!isNaN(newPrice) && newPrice > 0) {
                          setPriceOverrides((prev) => ({ ...prev, [dish.name]: newPrice }))
                        }
                        setEditingName(null)
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          const newPrice = parseFloat(editValue)
                          if (!isNaN(newPrice) && newPrice > 0) {
                            setPriceOverrides((prev) => ({ ...prev, [dish.name]: newPrice }))
                          }
                          setEditingName(null)
                        }
                        if (e.key === "Escape") setEditingName(null)
                      }}
                      className="w-20 text-center font-bold text-sm text-[#0E7A0E] border-b-2 border-[#0E7A0E] bg-green-50 rounded px-1 py-0.5 outline-none"
                    />
                  ) : (
                    <button
                      onClick={() => { setEditingName(dish.name); setEditValue(String(dish.price)) }}
                      className="font-bold text-sm text-[#0E7A0E] hover:text-green-800 hover:underline transition-colors"
                      title={t("rentabilidad.editPriceTitle")}
                      aria-label={t("rentabilidad.editPriceAria", { name: dish.name })}
                    >
                      ${dish.price}
                      {priceOverrides[dish.name] !== undefined && (
                        <span className="block text-[9px] text-amber-500">{t("rentabilidad.edited")}</span>
                      )}
                    </button>
                  )}
                </div>
                <div className="text-center">
                  <p className="text-[10px] text-gray-400">{t("rentabilidad.marginLabel")}</p>
                  <p className={`font-bold text-sm ${margin > 0 ? "text-green-600" : "text-red-600"}`}>
                    ${margin.toFixed(0)} ({foodCost}%)
                  </p>
                </div>
              </div>
              {mermaStats.hasMerma && mermaStats.monthLoss > 0 && (() => {
                const mermaAmount = dish.cost - dish.cost / mermaFactor
                return (
                  <div className="mt-2 pt-2 border-t border-red-100 flex items-center justify-between text-[10px] bg-red-50/50 rounded-lg px-3 py-1.5">
                    <span className="text-red-500 flex items-center gap-1">
                      <Trash2 className="w-3 h-3" />
                      {t("rentabilidad.mermaIncludedCost", { pct: mermaStats.mermaPct.toFixed(0) })}
                    </span>
                    <span className="font-bold text-red-600">+${mermaAmount.toFixed(0)}</span>
                  </div>
                )
              })()}
            </div>
          )
        })}
        </div>
      )}

      {/* Tip */}
      <div className="mt-6 bg-gradient-to-r from-[#F0FDF4] to-white rounded-2xl border border-[#0E7A0E]/10 p-5">
        <div className="flex items-start gap-3">
          <DollarSign className="w-5 h-5 text-[#0E7A0E] mt-0.5 shrink-0" />
          <div>
            <h4 className="font-semibold text-gray-900 mb-1 text-sm">{t("rentabilidad.tipTitle")}</h4>
            <p className="text-xs text-gray-500 leading-relaxed">
              {t("rentabilidad.tipDescription")}
            </p>
          </div>
        </div>
      </div>
        </>
      )}
      <ToolGuideHost toolKey="rentabilidad" pathname="/panel/rentabilidad" slug={slug} icon="📊" title="Rentabilidad" subtitle={selectedCollection.name} />
    </div>
  )
}
