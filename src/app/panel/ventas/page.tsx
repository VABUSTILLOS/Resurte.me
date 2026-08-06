"use client"

import { useState, useMemo, useEffect } from "react"
import { useRestaurant } from "@/contexts/restaurant-context"
import { useLocalStorage, useSharedDishes } from "@/hooks/use-local-storage"
import { useToast } from "@/components/toast"
import Link from "next/link"
import {
  ArrowLeft, Plus, Trash2, DollarSign, TrendingUp, Receipt,
  Copy, BarChart3, Target, ChevronUp, ChevronDown, AlertCircle, Landmark, Flame,
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
  createdAt?: string // ISO timestamp, set on addEntry
}

const PAYMENT_METHODS = [
  { key: "efectivo", label: "Efectivo", icon: "💵" },
  { key: "tarjeta", label: "Tarjeta", icon: "💳" },
  { key: "transferencia", label: "Transferencia", icon: "🏦" },
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

export default function VentasPage() {
  const { selectedCollection } = useRestaurant()
  const slug = selectedCollection?.slug || null
  const { toast } = useToast()
  const [sharedDishes] = useSharedDishes(slug)

  const [entries, setEntries] = useLocalStorage<SaleEntry[]>("ventas-entries", [], slug)
  const [inventarioItems, setInventarioItems] = useLocalStorage<InventoryItemLike[]>("inventario-items", [], slug)
  const [movements, setMovements] = useLocalStorage<StockMovementLike[]>("inventario-movimientos", [], slug)
  const [deductStock, setDeductStock] = useLocalStorage<boolean>("ventas-descontar-stock", false, slug)
  const [formDishId, setFormDishId] = useState("")
  const [formQty, setFormQty] = useState("1")
  const [formDate, setFormDate] = useState(todayStr())
  const [formPayment, setFormPayment] = useState<PaymentMethod>("efectivo")
  const [formChannel, setFormChannel] = useState<SaleChannel>("comedor")
  const [selectedDate, setSelectedDate] = useState(todayStr())
  const [showAll, setShowAll] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  // ── Derived ────────────────────────────────────────────
  const dishCost = (id: string) => {
    const dish = sharedDishes.find((d) => d.id === id)
    if (!dish) return 0
    return dish.ingredients.reduce((s, i) => s + i.quantity * i.unitPrice, 0)
  }
  const dishPrice = (id: string) => sharedDishes.find((d) => d.id === id)?.sellingPrice || 0

  const dayEntries = useMemo(() => entries.filter((e) => e.date === selectedDate), [entries, selectedDate])

  const dayStats = useMemo(() => {
    const revenue = dayEntries.reduce((s, e) => s + e.quantity * e.unitPrice, 0)
    const cost = dayEntries.reduce((s, e) => s + e.quantity * e.unitCost, 0)
    const units = dayEntries.reduce((s, e) => s + e.quantity, 0)
    const orders = dayEntries.length
    return { revenue, cost, margin: revenue - cost, units, orders, foodCost: revenue > 0 ? (cost / revenue) * 100 : 0, avgTicket: orders > 0 ? revenue / orders : 0 }
  }, [dayEntries])

  const topSellers = useMemo(() => {
    const byName = new Map<string, { name: string; qty: number; revenue: number }>()
    dayEntries.forEach((e) => {
      const cur = byName.get(e.dishName) || { name: e.dishName, qty: 0, revenue: 0 }
      cur.qty += e.quantity
      cur.revenue += e.quantity * e.unitPrice
      byName.set(e.dishName, cur)
    })
    return [...byName.values()].sort((a, b) => b.qty - a.qty).slice(0, 5)
  }, [dayEntries])

  const methodBreakdown = useMemo(() => {
    const byMethod = new Map<PaymentMethod, { revenue: number; count: number }>()
    dayEntries.forEach((e) => {
      const m = (e.paymentMethod || "efectivo") as PaymentMethod
      const cur = byMethod.get(m) || { revenue: 0, count: 0 }
      cur.revenue += e.quantity * e.unitPrice
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
      cur.revenue += e.quantity * e.unitPrice
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
      const rev = entries.filter((e) => e.date === key).reduce((s, e) => s + e.quantity * e.unitPrice, 0)
      const cost = entries.filter((e) => e.date === key).reduce((s, e) => s + e.quantity * e.unitCost, 0)
      days.push({ label: dateLabel(key), revenue: rev, cost })
    }
    const max = Math.max(...days.map((d) => d.revenue), 1)
    return { days, max }
  }, [entries])

  const allTimeStats = useMemo(() => {
    const revenue = entries.reduce((s, e) => s + e.quantity * e.unitPrice, 0)
    const cost = entries.reduce((s, e) => s + e.quantity * e.unitCost, 0)
    return { revenue, cost, margin: revenue - cost, foodCost: revenue > 0 ? (cost / revenue) * 100 : 0, count: entries.length }
  }, [entries])

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
    const entry: SaleEntry = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      dishId: dish.id,
      dishName: dish.name,
      quantity: qty,
      date: formDate,
      unitPrice: dish.sellingPrice,
      unitCost,
      paymentMethod: formPayment,
      channel: formChannel,
      createdAt: new Date().toISOString(),
    }
    setEntries((prev) => [...prev, entry])
    setSelectedDate(formDate)

    // Optional: deduct dish ingredients from inventory (opt-in)
    let deducted = 0
    if (deductStock) {
      const deductions = new Map<string, { itemId: string; itemName: string; neededKg: number }>()
      dish.ingredients.forEach((ing) => {
        const key = ing.ingredientName.toLowerCase().trim()
        if (!key) return
        const neededKg = (ing.quantity || 0) * qty / 1000
        if (neededKg <= 0) return
        const item = inventarioItems.find((i) => i.name.toLowerCase().trim() === key)
        if (!item) return
        deductions.set(item.id, {
          itemId: item.id,
          itemName: item.name,
          neededKg: (deductions.get(item.id)?.neededKg || 0) + neededKg,
        })
      })
      if (deductions.size > 0) {
        setInventarioItems((prev) =>
          prev.map((i) => {
            const d = deductions.get(i.id)
            return d ? { ...i, stock: Math.max(0, i.stock - d.neededKg) } : i
          })
        )
        const newMovements: StockMovementLike[] = Array.from(deductions.values()).map((d) => ({
          fecha: new Date().toISOString(),
          itemId: d.itemId,
          itemName: d.itemName,
          tipo: "salida",
          delta: -d.neededKg,
          motivo: `Venta: ${dish.name} ×${qty}`,
        }))
        setMovements((prev) => [...newMovements, ...prev].slice(0, 50))
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
    setDeleteConfirm(null)
    toast("Venta eliminada", "warning")
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
    navigator.clipboard.writeText([header, ...lines, ...methodLines, ...channelLines, ...top, "", "📈 Registrado en resurte.me"].join("\n"))
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
            <h2 className="text-xl font-bold text-gray-900">Ventas del día</h2>
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
          <button
            onClick={addEntry}
            disabled={!formDishId}
            className="flex items-center gap-1.5 px-4 py-2 bg-[#108910] text-white text-sm font-semibold rounded-xl hover:bg-green-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="w-4 h-4" />
            Registrar
          </button>
        </div>
        {formDishId && (
          <p className="text-[10px] text-gray-400 mt-2">
            El precio y costo se toman del platillo costeado ({dishPrice(formDishId) > 0 ? `$${dishPrice(formDishId).toFixed(0)} / costo $${dishCost(formDishId).toFixed(0)}` : "sin precio de venta"}).
          </p>
        )}
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
          <p className="text-gray-400 font-medium mb-1">Sin ventas registradas</p>
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
              <p className={`text-lg font-extrabold ${dayStats.foodCost > 38 ? "text-red-600" : dayStats.foodCost > 30 ? "text-amber-600" : "text-green-700"}`}>
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
              <span className="text-lg font-extrabold text-[#108910]">${dayStats.revenue.toFixed(0)}</span>
            </div>
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
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/50">
                    <th className="text-left px-4 py-3 font-semibold text-gray-400 text-[10px] uppercase tracking-wider">Platillo</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-400 text-[10px] uppercase tracking-wider">Cant.</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-400 text-[10px] uppercase tracking-wider">Precio</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-400 text-[10px] uppercase tracking-wider">Costo</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-400 text-[10px] uppercase tracking-wider">Total</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-400 text-[10px] uppercase tracking-wider">Margen</th>
                    <th className="text-center px-4 py-3 font-semibold text-gray-400 text-[10px] uppercase tracking-wider">Fecha</th>
                    <th className="text-center px-4 py-3 font-semibold text-gray-400 text-[10px] uppercase tracking-wider">Pago</th>
                    <th className="text-center px-4 py-3 font-semibold text-gray-400 text-[10px] uppercase tracking-wider">Canal</th>
                    <th className="text-center px-4 py-3 font-semibold text-gray-400 text-[10px] uppercase tracking-wider">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleEntries
                    .slice()
                    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
                    .map((e) => {
                      const total = e.quantity * e.unitPrice
                      const cost = e.quantity * e.unitCost
                      const margin = total - cost
                      return (
                        <tr key={e.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                          <td className="px-4 py-3">
                            <p className="font-semibold text-gray-800">{e.dishName}</p>
                            <p className="text-[10px] text-gray-400">${e.unitPrice.toFixed(0)} / ${e.unitCost.toFixed(2)}</p>
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
                          <td className="px-4 py-3 text-right text-gray-500">${cost.toFixed(0)}</td>
                          <td className="px-4 py-3 text-right font-bold text-gray-900">${total.toFixed(0)}</td>
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
                Un food cost arriba de 38% significa que estás regalando margen: ajusta precios desde el Costeador.
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
