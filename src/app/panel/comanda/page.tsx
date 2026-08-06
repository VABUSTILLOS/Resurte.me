"use client"

import { useState, useMemo, useEffect } from "react"
import { useRestaurant } from "@/contexts/restaurant-context"
import { useLocalStorage } from "@/hooks/use-local-storage"
import { useToast } from "@/components/toast"
import Link from "next/link"
import {
  ArrowLeft, Flame, Play, Check, Undo2, Copy, List, LayoutGrid,
  Plus, Trash2, ChefHat, Clock,
} from "lucide-react"

interface SaleEntryLike {
  id: string
  dishId: string
  dishName: string
  quantity: number
  date: string
  unitPrice: number
  unitCost: number
  paymentMethod?: string
  channel?: string
  clienteId?: string
  modificadores?: { nombre: string; precio: number }[]
  createdAt?: string
}

interface ComandaStatus {
  status: "pendiente" | "en-cocina" | "listo"
  startedAt?: number
  readyAt?: number
  hidden?: boolean
}

const CHANNELS = [
  { key: "comedor", label: "Comedor", icon: "🍽️" },
  { key: "rapido", label: "Rápido", icon: "⚡" },
  { key: "para-llevar", label: "Para llevar", icon: "🥡" },
  { key: "domicilio", label: "Domicilio", icon: "🛵" },
] as const

type ChannelKey = (typeof CHANNELS)[number]["key"]

const STATUS_META = {
  pendiente: { label: "Pendientes", color: "text-amber-600", bg: "bg-amber-50", border: "border-amber-200" },
  "en-cocina": { label: "En cocina", color: "text-blue-600", bg: "bg-blue-50", border: "border-blue-200" },
  listo: { label: "Listas", color: "text-green-700", bg: "bg-green-50", border: "border-green-200" },
} as const

type StatusKey = keyof typeof STATUS_META

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

function entryTime(e: SaleEntryLike): number {
  if (e.createdAt) {
    const t = Date.parse(e.createdAt)
    if (!isNaN(t)) return t
  }
  const parsed = parseInt(e.id, 36)
  if (!Number.isFinite(parsed)) return 0
  // id = base36(Date.now()) + 4 random base36 chars
  return Math.floor(parsed / Math.pow(36, 4))
}

function fmtTime(ts: number) {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
}

export default function ComandaPage() {
  const { selectedCollection } = useRestaurant()
  const slug = selectedCollection?.slug || null
  const { toast } = useToast()
  const [entries] = useLocalStorage<SaleEntryLike[]>("ventas-entries", [], slug)
  const [statuses, setStatuses] = useLocalStorage<Record<string, ComandaStatus>>("comanda-statuses", {}, slug)
  const [selectedDate, setSelectedDate] = useState(todayStr())
  const [channelFilter, setChannelFilter] = useState<"todos" | ChannelKey>("todos")
  const [viewMode, setViewMode] = useState<"board" | "list">("board")
  const [sortNewest, setSortNewest] = useState(false)
  const [now, setNow] = useState(Date.now())

  // Live tick so ages / elapsed production times refresh
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(t)
  }, [])

  const dayEntries = useMemo(
    () => entries.filter((e) => e.date === selectedDate),
    [entries, selectedDate],
  )

  const comandas = useMemo(() => {
    const rows = dayEntries.map((e) => ({
      entry: e,
      time: entryTime(e),
      status: statuses[e.id]?.status || "pendiente",
      startedAt: statuses[e.id]?.startedAt,
      readyAt: statuses[e.id]?.readyAt,
      hidden: !!statuses[e.id]?.hidden,
    }))
    return rows.filter((r) => !r.hidden)
  }, [dayEntries, statuses])

  const filtered = useMemo(() => {
    const rows = channelFilter === "todos" ? comandas : comandas.filter((c) => (c.entry.channel || "comedor") === channelFilter)
    return rows.slice().sort((a, b) => (sortNewest ? b.time - a.time : a.time - b.time))
  }, [comandas, channelFilter, sortNewest])

  const byStatus = useMemo(() => {
    const map: Record<StatusKey, typeof filtered> = {
      pendiente: [],
      "en-cocina": [],
      listo: [],
    }
    filtered.forEach((c) => map[c.status as StatusKey].push(c))
    return map
  }, [filtered])

  const activeCount = comandas.filter((c) => c.status !== "listo").length
  const cookingCount = comandas.filter((c) => c.status === "en-cocina").length
  const listoCount = comandas.filter((c) => c.status === "listo").length

  // Production report: includes all "listo" comandas of the day (even hidden)
  const prodStats = useMemo(() => {
    const listos = dayEntries
      .map((e) => ({ e, s: statuses[e.id] }))
      .filter((x): x is { e: SaleEntryLike; s: ComandaStatus } => !!x.s && x.s.status === "listo")
    if (listos.length === 0) return { count: 0, avgMin: 0, totalMin: 0 }
    const totalMin = listos.reduce((sum, { e, s }) => {
      const start = s.startedAt || entryTime(e)
      const ready = s.readyAt || now
      return sum + Math.max(0, (ready - start) / 60000)
    }, 0)
    return { count: listos.length, avgMin: totalMin / listos.length, totalMin }
  }, [dayEntries, statuses, now])

  // "En producción ahora": group en-cocina by dishName with live elapsed average
  const inProduction = useMemo(() => {
    const map = new Map<string, { dishName: string; count: number; totalMs: number }>()
    comandas.forEach((c) => {
      if (c.status !== "en-cocina") return
      const cur = map.get(c.entry.dishName) || { dishName: c.entry.dishName, count: 0, totalMs: 0 }
      cur.count += c.entry.quantity
      cur.totalMs += now - (c.startedAt || c.time)
      map.set(c.entry.dishName, cur)
    })
    return Array.from(map.values()).map((g) => ({ ...g, avgMin: Math.max(0, g.totalMs / g.count / 60000) }))
  }, [comandas, now])

  // Average production time per dish over all "listo" comandas of the day
  const dishAvgTimes = useMemo(() => {
    const map = new Map<string, { dishName: string; count: number; totalMin: number }>()
    dayEntries.forEach((e) => {
      const s = statuses[e.id]
      if (!s || s.status !== "listo") return
      const start = s.startedAt || entryTime(e)
      const ready = s.readyAt || now
      const mins = Math.max(0, (ready - start) / 60000)
      const cur = map.get(e.dishName) || { dishName: e.dishName, count: 0, totalMin: 0 }
      cur.count += 1
      cur.totalMin += mins
      map.set(e.dishName, cur)
    })
    return Array.from(map.values())
      .map((g) => ({ dishName: g.dishName, count: g.count, avgMin: g.totalMin / g.count }))
      .sort((a, b) => b.avgMin - a.avgMin)
      .slice(0, 5)
  }, [dayEntries, statuses, now])

  const setComandaStatus = (id: string, patch: Partial<ComandaStatus> & { status: ComandaStatus["status"] }) => {
    setStatuses((prev) => {
      const base = prev[id] || { status: "pendiente" as const }
      return { ...prev, [id]: { ...base, ...patch } }
    })
  }

  const iniciar = (id: string, name: string) => {
    setComandaStatus(id, { status: "en-cocina", startedAt: Date.now() })
    toast(`${name} en cocina`, "success")
  }

  const listo = (id: string, name: string) => {
    setComandaStatus(id, { status: "listo", readyAt: Date.now() })
    toast(`${name} lista`, "success")
  }

  const revertir = (id: string) => {
    setComandaStatus(id, { status: "pendiente", startedAt: undefined, readyAt: undefined })
    toast("Comanda de vuelta a pendiente", "warning")
  }

  const limpiarListos = () => {
    const ids = new Set(dayEntries.map((e) => e.id))
    setStatuses((prev) => {
      const next: Record<string, ComandaStatus> = {}
      Object.keys(prev).forEach((k) => {
        next[k] = ids.has(k) && prev[k].status === "listo" ? { ...prev[k], hidden: true } : prev[k]
      })
      return next
    })
    toast("Comandas listas ocultas del tablero", "success")
  }

  const copyReporte = () => {
    const lines = [
      `🍳 Reporte de comandas — ${dateLabel(selectedDate)} (${selectedCollection?.name || ""})`,
      "",
      `Activas: ${activeCount} · En cocina: ${cookingCount} · Listas: ${listoCount}`,
      prodStats.count > 0
        ? `Tiempo promedio de producción: ${prodStats.avgMin.toFixed(0)} min (${prodStats.count} comanda${prodStats.count > 1 ? "s" : ""})`
        : "Tiempo promedio de producción: —",
      ...(inProduction.length > 0
        ? ["", "En producción ahora:", ...inProduction.map((g) => `${g.dishName} ×${g.count} — ${g.avgMin.toFixed(0)} min promedio`)]
        : []),
      ...(dishAvgTimes.length > 0
        ? ["", "Tiempos por platillo (listas):", ...dishAvgTimes.map((g) => `${g.dishName} — ${g.avgMin.toFixed(0)} min (${g.count})`)]
        : []),
      ...(filtered.some((f) => f.entry.modificadores?.length)
        ? ["", "Con modificadores:", ...filtered.filter((f) => f.entry.modificadores?.length).map((f) => `${f.entry.dishName} [+${f.entry.modificadores!.map((m) => m.nombre).join(", ")}] ×${f.entry.quantity}`)]
        : []),
      "",
      ...CHANNELS.filter((c) => filtered.some((f) => (f.entry.channel || "comedor") === c.key))
        .map((c) => `${c.icon} ${c.label}: ${filtered.filter((f) => (f.entry.channel || "comedor") === c.key).length}`),
      "",
      "📈 Registrado en resurte.me",
    ]
    navigator.clipboard.writeText(lines.join("\n"))
    toast("Reporte de comandas copiado", "success")
  }

  // Ctrl+N → focus the new-sale CTA
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "n") {
        e.preventDefault()
        document.getElementById("comanda-nueva-venta")?.focus()
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [])

  if (!selectedCollection) {
    return (
      <div className="text-center py-16">
        <ChefHat className="w-12 h-12 text-gray-300 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-gray-700 mb-2">Selecciona tu tipo de cocina</h3>
        <p className="text-sm text-gray-400 max-w-md mx-auto">
          Selecciona tu tipo de restaurante para ver el monitor de comandas de tu cocina.
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
            <h2 className="text-xl font-bold text-gray-900">Comanda de cocina</h2>
            {comandas.length > 0 && (
              <button
                onClick={copyReporte}
                className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded-lg transition-colors"
                title="Copiar reporte de producción del día"
                aria-label="Copiar reporte de comandas"
              >
                <Copy className="w-3.5 h-3.5" />
                Copiar reporte
              </button>
            )}
          </div>
          <p className="text-sm text-gray-400">
            {selectedCollection.name} — monitor de producción tipo SoftRestaurant
          </p>
        </div>
      </div>

      {/* ── Controls ─────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex items-center gap-2 bg-white rounded-xl border border-gray-100 px-3 py-2">
          <span className="text-xs text-gray-400 shrink-0">Día:</span>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value || todayStr())}
            className="text-xs font-semibold text-gray-700 bg-transparent focus:outline-none"
            aria-label="Seleccionar día de comandas"
          />
        </div>
        <div className="flex items-center gap-1 bg-white rounded-xl border border-gray-100 p-1">
          <button
            onClick={() => setViewMode("board")}
            className={`flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-colors ${
              viewMode === "board" ? "bg-[#108910] text-white" : "text-gray-500 hover:bg-gray-50"
            }`}
            title="Vista tablero (ventanas)"
            aria-label="Vista tablero de comandas"
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            Tablero
          </button>
          <button
            onClick={() => setViewMode("list")}
            className={`flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-colors ${
              viewMode === "list" ? "bg-[#108910] text-white" : "text-gray-500 hover:bg-gray-50"
            }`}
            title="Vista listado"
            aria-label="Vista listado de comandas"
          >
            <List className="w-3.5 h-3.5" />
            Listado
          </button>
        </div>
        <button
          onClick={() => setSortNewest(!sortNewest)}
          className={`text-xs font-semibold px-3 py-2 rounded-xl transition-colors ${
            sortNewest ? "bg-[#108910] text-white" : "bg-white text-gray-600 border border-gray-100 hover:bg-gray-50"
          }`}
          title={sortNewest ? "Orden: más recientes primero" : "Orden: primeros en llegar primero"}
        >
          {sortNewest ? "Más recientes" : "Por antigüedad"}
        </button>
        {listoCount > 0 && (
          <button
            onClick={limpiarListos}
            className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 bg-white border border-gray-100 hover:bg-gray-50 px-3 py-2 rounded-xl transition-colors"
            title="Quitar del tablero las comandas marcadas como listas"
            aria-label="Limpiar comandas listas"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Limpiar listas
          </button>
        )}
      </div>

      {/* Channel filters */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        <button
          onClick={() => setChannelFilter("todos")}
          className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${
            channelFilter === "todos" ? "bg-gray-900 text-white" : "bg-white text-gray-500 border border-gray-100 hover:bg-gray-50"
          }`}
        >
          Todos
        </button>
        {CHANNELS.map((c) => {
          const count = comandas.filter((f) => (f.entry.channel || "comedor") === c.key).length
          const active = channelFilter === c.key
          return (
            <button
              key={c.key}
              onClick={() => setChannelFilter(active ? "todos" : c.key)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${
                active ? "bg-gray-900 text-white" : "bg-white text-gray-500 border border-gray-100 hover:bg-gray-50"
              }`}
              aria-pressed={active}
            >
              {c.icon} {c.label}
              {count > 0 && <span className={`ml-1.5 ${active ? "text-white/70" : "text-gray-400"}`}>{count}</span>}
            </button>
          )
        })}
      </div>

      {/* ── Production stats ─────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="bg-white rounded-xl border border-gray-100 p-4 text-center">
          <Flame className="w-5 h-5 text-amber-600 mx-auto mb-1" />
          <p className="text-lg font-extrabold text-amber-700">{activeCount}</p>
          <p className="text-[10px] text-gray-400">Comandas activas</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4 text-center">
          <Clock className="w-5 h-5 text-blue-600 mx-auto mb-1" />
          <p className="text-lg font-extrabold text-blue-700">{cookingCount}</p>
          <p className="text-[10px] text-gray-400">En cocina</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4 text-center">
          <Check className="w-5 h-5 text-green-600 mx-auto mb-1" />
          <p className="text-lg font-extrabold text-green-700">{listoCount}</p>
          <p className="text-[10px] text-gray-400">Listas hoy</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4 text-center">
          <Clock className="w-5 h-5 text-[#108910] mx-auto mb-1" />
          <p className="text-lg font-extrabold text-[#108910]">
            {prodStats.count > 0 ? `${prodStats.avgMin.toFixed(0)} min` : "—"}
          </p>
          <p className="text-[10px] text-gray-400">Tiempo promedio de producción</p>
        </div>
      </div>

      {/* ── En producción ahora + tiempos por platillo ───── */}
      {(inProduction.length > 0 || dishAvgTimes.length > 0) && (
        <div className="grid md:grid-cols-2 gap-4 mb-6">
          {inProduction.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <div className="flex items-center gap-2 mb-3">
                <Flame className="w-4 h-4 text-blue-600" />
                <h3 className="text-sm font-semibold text-gray-900">En producción ahora</h3>
                <span className="ml-auto text-[10px] text-gray-400">actualiza cada 30s</span>
              </div>
              <ul className="space-y-2">
                {inProduction.map((g) => (
                  <li key={g.dishName} className="flex items-center gap-3">
                    <span className="flex-1 text-sm font-semibold text-gray-800 truncate">{g.dishName}</span>
                    <span className="text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">×{g.count}</span>
                    <span className="text-[10px] text-gray-400 w-20 text-right">{g.avgMin.toFixed(0)} min en corte</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {dishAvgTimes.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <div className="flex items-center gap-2 mb-3">
                <Clock className="w-4 h-4 text-[#108910]" />
                <h3 className="text-sm font-semibold text-gray-900">Tiempos por platillo (listas)</h3>
                <span className="ml-auto text-[10px] text-gray-400">top 5</span>
              </div>
              <ul className="space-y-2">
                {dishAvgTimes.map((g) => (
                  <li key={g.dishName} className="flex items-center gap-3">
                    <span className="flex-1 text-sm font-semibold text-gray-800 truncate">{g.dishName}</span>
                    <span className="text-[10px] text-gray-400">{g.count} pz</span>
                    <span
                      className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                        g.avgMin > 15 ? "bg-red-50 text-red-600" : "bg-green-50 text-green-700"
                      }`}
                    >
                      {g.avgMin > 15 ? "⚠️ " : ""}{g.avgMin.toFixed(0)} min
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {dayEntries.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
          <ChefHat className="w-12 h-12 text-gray-200 mx-auto mb-4" />
          <p className="text-gray-400 font-medium mb-1">Sin comandas para este día</p>
          <p className="text-xs text-gray-300 mb-4">
            Cada venta que registres se convierte en una comanda para la cocina.
          </p>
          <Link
            id="comanda-nueva-venta"
            href="/panel/ventas"
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#108910] text-white text-xs font-semibold rounded-xl hover:bg-green-800 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Registrar venta
          </Link>
        </div>
      ) : viewMode === "board" ? (
        /* ── Board: columns by status ───────────────────── */
        <div className="grid md:grid-cols-3 gap-4">
          {(Object.keys(STATUS_META) as StatusKey[]).map((status) => {
            const meta = STATUS_META[status]
            const cards = byStatus[status]
            return (
              <div key={status} className="bg-white rounded-2xl border border-gray-100 overflow-hidden flex flex-col">
                <div className={`flex items-center gap-2 px-4 py-3 border-b border-gray-100 ${meta.bg}`}>
                  <span className={`text-xs font-bold uppercase tracking-wider ${meta.color}`}>{meta.label}</span>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${meta.bg} ${meta.color}`}>
                    {cards.length}
                  </span>
                </div>
                <div className="flex-1 p-3 space-y-3 min-h-[160px]">
                  {cards.length === 0 ? (
                    <p className="text-xs text-gray-300 text-center py-8">Sin comandas</p>
                  ) : (
                    cards.map((c) => {
                      const chan = CHANNELS.find((ch) => ch.key === (c.entry.channel || "comedor"))
                      const elapsedMin = Math.max(1, Math.round((now - c.time) / 60000))
                      const prodMin =
                        c.status === "listo" && c.readyAt
                          ? Math.max(0, Math.round((c.readyAt - (c.startedAt || c.time)) / 60000))
                          : null
                      return (
                        <div
                          key={c.entry.id}
                          className={`bg-white border rounded-xl p-3 shadow-sm ${status === "en-cocina" ? "border-blue-200 ring-1 ring-blue-100" : status === "listo" ? "border-green-200" : "border-amber-200"}`}
                        >
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <p className="font-bold text-gray-900 text-sm leading-tight">{c.entry.dishName}</p>
                            <span className="text-lg font-extrabold text-gray-700 shrink-0">×{c.entry.quantity}</span>
                          </div>
                          {c.entry.modificadores && c.entry.modificadores.length > 0 && (
                            <div className="flex flex-wrap gap-1 mb-2">
                              {c.entry.modificadores.map((m) => (
                                <span key={m.nombre} className="text-[9px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded-full font-medium">
                                  +{m.nombre}{m.precio > 0 ? ` $${m.precio.toFixed(0)}` : ""}
                                </span>
                              ))}
                            </div>
                          )}
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded-full">
                              {chan?.icon} {chan?.label}
                            </span>
                            <span className="text-[10px] text-gray-400">🕐 {fmtTime(c.time)}</span>
                          </div>
                          <div className="flex items-center justify-between text-[10px] text-gray-400 mb-2">
                            <span>
                              {c.status === "listo"
                                ? prodMin != null && `Producción: ${prodMin} min`
                                : `Esperando ${elapsedMin} min`}
                            </span>
                          </div>
                          <div className="flex gap-1.5">
                            {c.status === "pendiente" && (
                              <button
                                onClick={() => iniciar(c.entry.id, c.entry.dishName)}
                                className="flex-1 flex items-center justify-center gap-1 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 py-1.5 rounded-lg transition-colors"
                                title={`Iniciar ${c.entry.dishName} en cocina`}
                                aria-label={`Iniciar comanda de ${c.entry.dishName}`}
                              >
                                <Play className="w-3.5 h-3.5" />
                                Iniciar
                              </button>
                            )}
                            {c.status === "en-cocina" && (
                              <>
                                <button
                                  onClick={() => listo(c.entry.id, c.entry.dishName)}
                                  className="flex-1 flex items-center justify-center gap-1 text-xs font-semibold text-green-700 bg-green-50 hover:bg-green-100 py-1.5 rounded-lg transition-colors"
                                  title={`Marcar ${c.entry.dishName} como lista`}
                                  aria-label={`Marcar comanda de ${c.entry.dishName} como lista`}
                                >
                                  <Check className="w-3.5 h-3.5" />
                                  Listo
                                </button>
                                <button
                                  onClick={() => revertir(c.entry.id)}
                                  className="flex items-center justify-center text-xs font-semibold text-gray-500 bg-gray-50 hover:bg-gray-100 p-1.5 rounded-lg transition-colors"
                                  title="Volver a pendiente"
                                  aria-label="Volver comanda a pendiente"
                                >
                                  <Undo2 className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                            {c.status === "listo" && (
                              <button
                                onClick={() => revertir(c.entry.id)}
                                className="flex-1 flex items-center justify-center gap-1 text-xs font-semibold text-gray-500 bg-gray-50 hover:bg-gray-100 py-1.5 rounded-lg transition-colors"
                                title="Volver a pendiente"
                                aria-label={`Volver comanda de ${c.entry.dishName} a pendiente`}
                              >
                                <Undo2 className="w-3.5 h-3.5" />
                                Reabrir
                              </button>
                            )}
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        /* ── List view ──────────────────────────────────── */
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="text-left px-4 py-3 font-semibold text-gray-400 text-[10px] uppercase tracking-wider">Platillo</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-400 text-[10px] uppercase tracking-wider">Cant.</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-400 text-[10px] uppercase tracking-wider">Canal</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-400 text-[10px] uppercase tracking-wider">Captura</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-400 text-[10px] uppercase tracking-wider">Edad</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-400 text-[10px] uppercase tracking-wider">Estado</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => {
                  const chan = CHANNELS.find((ch) => ch.key === (c.entry.channel || "comedor"))
                  const elapsedMin = Math.max(1, Math.round((now - c.time) / 60000))
                  const meta = STATUS_META[c.status as StatusKey]
                  return (
                    <tr key={c.entry.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-gray-800">{c.entry.dishName}</p>
                        {c.entry.modificadores && c.entry.modificadores.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-0.5">
                            {c.entry.modificadores.map((m) => (
                              <span key={m.nombre} className="text-[9px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded-full font-medium">
                                +{m.nombre}{m.precio > 0 ? ` $${m.precio.toFixed(0)}` : ""}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-gray-800">×{c.entry.quantity}</td>
                      <td className="px-4 py-3 text-center text-gray-500">{chan?.icon} {chan?.label}</td>
                      <td className="px-4 py-3 text-center text-gray-500 whitespace-nowrap">{fmtTime(c.time)}</td>
                      <td className="px-4 py-3 text-center text-gray-500 whitespace-nowrap">hace {elapsedMin} min</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1">
                          {(["pendiente", "en-cocina", "listo"] as StatusKey[]).map((s) => (
                            <button
                              key={s}
                              onClick={() => {
                                if (s === "en-cocina") iniciar(c.entry.id, c.entry.dishName)
                                else if (s === "listo") listo(c.entry.id, c.entry.dishName)
                                else revertir(c.entry.id)
                              }}
                              className={`text-[10px] font-semibold px-2 py-1 rounded-lg transition-colors ${
                                c.status === s
                                  ? `${STATUS_META[s].bg} ${STATUS_META[s].color}`
                                  : "text-gray-400 bg-gray-50 hover:bg-gray-100"
                              }`}
                              aria-label={`${STATUS_META[s].label}: ${c.entry.dishName}`}
                            >
                              {STATUS_META[s].label.replace(/s$/, "")}
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {filtered.length === 0 && dayEntries.length > 0 && (
        <div className="text-center py-10">
          <p className="text-xs text-gray-400">No hay comandas para este filtro.</p>
        </div>
      )}
    </div>
  )
}
