"use client"

import { useRestaurant } from "@/contexts/restaurant-context"
import { useSharedDishes, useLocalStorage } from "@/hooks/use-local-storage"
import { useToast } from "@/components/toast"
import { useRouter } from "next/navigation"
import { useMemo, useState, useEffect, useCallback, useRef } from "react"
import { normalizeName } from "@/lib/normalize"
import { foodCostStatus, usePanelConfig } from "@/lib/panel-config"
import { convertQty } from "@/lib/panel-units"
import { Search } from "lucide-react"
import { GlobalSearch } from "@/components/global-search"
import {
  PAYMENT_METHODS, TOOLS, hubEntryTotal,
  type HubVenta, type HubMesa,
} from "@/components/panel/hub/hub-data"
import type { WasteEntry } from "@/components/panel/mermas/mermas-shared"
import type { ShoppingItem } from "@/components/panel/temporada/temporada-shared"
import type { InventoryItem } from "@/components/panel/inventario/inventario-shared"
import type { Cliente } from "@/components/panel/ventas/ventas-shared"
import { useHubAlerts } from "@/components/panel/hub/use-hub-alerts"
import HeroSection from "@/components/panel/hub/HeroSection"
import LiveStats from "@/components/panel/hub/LiveStats"
import DaySummary from "@/components/panel/hub/DaySummary"
import KitchenMonitor from "@/components/panel/hub/KitchenMonitor"
import AlertsPanel from "@/components/panel/hub/AlertsPanel"
import BackupStrip from "@/components/panel/hub/BackupStrip"
import ToolGrid from "@/components/panel/hub/ToolGrid"
import RestoreConfirmModal from "@/components/panel/hub/RestoreConfirmModal"

export default function PanelPage() {
  const { selectedCollection, collections, setSelectedCollection } = useRestaurant()
  const slug = selectedCollection?.slug || null
  const router = useRouter()
  const { toast } = useToast()
  const [sharedDishes] = useSharedDishes(slug)
  const [mermaEntries] = useLocalStorage<WasteEntry[]>("mermas-entries", [], slug)
  const [aperturaChecked] = useLocalStorage<string[]>("apertura-checked", [], slug)
  const [monthlyGoal] = useLocalStorage<number>("merma-monthly-goal", 0, slug)
  const [shoppingList] = useLocalStorage<ShoppingItem[]>("temporada-shopping-list", [], slug)
  const [inventarioItems] = useLocalStorage<InventoryItem[]>("inventario-items", [], slug)
  const [ventasEntries] = useLocalStorage<HubVenta[]>("ventas-entries", [], slug)
  const [mesas] = useLocalStorage<HubMesa[]>("mesas", [], slug)
  const [ventasMetaDia] = useLocalStorage<number>("ventas-meta-dia", 0, slug)
  const [ventasUmbralTicket] = useLocalStorage<number>("ventas-umbral-ticket", 3000, slug)
  const [clientes] = useLocalStorage<Cliente[]>("clientes", [], slug)
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

  // Alerts computation (extraído a use-hub-alerts)
  const alerts = useHubAlerts({
    selectedCollection,
    activeComandas,
    mesasInfo,
    todaySales,
    ventasEntries,
    ventasUmbralTicket,
    ventasMetaDia,
    inventarioItems,
    sharedDishes,
    mermaEntries,
    monthlyGoal,
    shoppingList,
    aperturaChecked,
    projectionShortfall,
    covers,
    clientes,
    panelCfg,
  })

  return (
    <div>
      <div className="mb-4 sm:mb-8">
        <HeroSection
          collections={collections}
          selectedCollection={selectedCollection}
          onSelect={setSelectedCollection}
        />
      </div>

      {selectedCollection && stats && (
        <LiveStats stats={stats} panelCfg={panelCfg} mesasInfo={mesasInfo} mesas={mesas} />
      )}

      <div className="mb-4 sm:mb-6">
        <ToolGrid tools={TOOLS} selectedCollection={selectedCollection} />
      </div>

      {selectedCollection && todaySales && (
        <DaySummary
          todaySales={todaySales}
          puntosHoy={puntosHoy}
          goalProgress={goalProgress}
          onCopy={copyDaySummary}
        />
      )}

      {selectedCollection && <KitchenMonitor comandas={activeComandas} />}

      {!selectedCollection && (
        <p className="text-center text-sm text-gray-400 mb-6">
          Escoge tu tipo de restaurante para activar las herramientas
        </p>
      )}

      {selectedCollection && (
        <AlertsPanel
          alerts={alerts}
          showAlerts={showAlerts}
          onToggle={() => setShowAlerts(!showAlerts)}
        />
      )}

      {selectedCollection && (
        <BackupStrip
          onNewDish={() => router.push("/panel/costeo")}
          onMerma={() => router.push("/panel/mermas")}
          onApertura={() => router.push("/panel/apertura")}
          onBackup={backupData}
          onRestoreFileSelected={onRestoreFileSelected}
          fileInputRef={fileInputRef}
        />
      )}

      {selectedCollection && (
        <button onClick={() => setShowSearch(true)} className="w-full mb-4 sm:mb-6 bg-white rounded-xl border border-gray-100 px-4 py-2.5 sm:py-3 flex items-center gap-3 text-sm text-gray-400 hover:border-gray-200 hover:text-gray-500 transition-colors group touch-target">
          <Search className="w-4 h-4 shrink-0" />
          <span className="flex-1 text-left">Buscar platillos, productos, inventario...</span>
          <kbd className="hidden sm:inline-flex items-center gap-1 px-2 py-1 rounded-md bg-gray-50 text-[10px] font-medium text-gray-300 font-mono border border-gray-100 group-hover:border-gray-200">
            <span className="text-xs">⌘</span>K
          </kbd>
        </button>
      )}

      <RestoreConfirmModal
        open={showRestoreConfirm}
        pendingBackup={pendingBackup}
        onCancel={() => { setShowRestoreConfirm(false); setPendingBackup(null) }}
        onConfirm={confirmRestore}
      />

      <GlobalSearch open={showSearch} onClose={() => setShowSearch(false)} slug={slug} />
    </div>
  )
}
