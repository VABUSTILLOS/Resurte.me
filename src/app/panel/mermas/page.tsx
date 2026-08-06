"use client"

import { useState, useMemo } from "react"
import { useRestaurant } from "@/contexts/restaurant-context"
import { useLocalStorage } from "@/hooks/use-local-storage"
import { useToast } from "@/components/toast"
import Link from "next/link"
import {
  Trash2, ArrowLeft, DollarSign, TrendingDown, Lightbulb,
  Plus, X, BarChart3, Edit3,
} from "lucide-react"

const WASTE_CATEGORIES = [
  { key: "frutas_verduras", label: "Frutas y verduras", icon: "🥬", avgWastePercent: 12 },
  { key: "proteinas", label: "Carnes / Proteínas", icon: "🥩", avgWastePercent: 8 },
  { key: "lacteos", label: "Lácteos", icon: "🧀", avgWastePercent: 6 },
  { key: "granos", label: "Granos y harinas", icon: "🌾", avgWastePercent: 4 },
  { key: "preparados", label: "Alimentos preparados", icon: "🍲", avgWastePercent: 10 },
  { key: "bebidas", label: "Bebidas", icon: "🥤", avgWastePercent: 3 },
]

const CAUSAS = [
  { key: "preparacion", label: "Preparación", icon: "🔪" },
  { key: "caducidad", label: "Caducidad", icon: "📅" },
  { key: "sobreproduccion", label: "Sobreproducción", icon: "📦" },
  { key: "devolucion", label: "Devolución", icon: "↩️" },
  { key: "otro", label: "Otro", icon: "❓" },
]

const TIPS: Record<string, string[]> = {
  "frutas_verduras": [
    "Refrigera verduras de hoja verde envueltas en papel para absorber humedad.",
    "Compra frutas en diferentes estados de madurez para usarlas en el momento óptimo.",
    "Almacena cebollas y papas en lugares oscuros y frescos, separados entre sí.",
    "Congela hierbas frescas picadas en aceite de oliva en charolas de hielo.",
  ],
  "proteinas": [
    "Porciona y congela al recibir. Etiqueta con fecha de congelación.",
    "Usa el sistema PEPS (primero en entrar, primero en salir) en tu refrigerador.",
    "Aprovecha huesos y recortes para fondos y caldos.",
    "Descongela en refrigeración, nunca a temperatura ambiente.",
  ],
  "lacteos": [
    "Guarda los quesos envueltos en papel encerado, no en plástico.",
    "La crema y nata se pueden congelar si es para cocinar (no para montar).",
    "Revisa fechas de caducidad al recibir mercancía de Resurte.me.",
  ],
  "granos": [
    "Almacena harinas y granos en contenedores herméticos para evitar humedad y plagas.",
    "Usa el sistema PEPS: rota el stock viejo al frente y el nuevo atrás.",
    "Revisa periódicamente señales de gorgojo o polilla en harinas y cereales.",
  ],
  "preparados": [
    "Etiqueta siempre con fecha de preparación y caducidad (máx. 3 días en refrigeración).",
    "Enfría rápidamente los preparados calientes antes de refrigerar para evitar proliferación bacteriana.",
    "Congela porciones individuales de salsas y caldos para usar solo lo necesario.",
  ],
  "bebidas": [
    "Revisa fechas de caducidad al recibir y rota el inventario mensualmente.",
    "Almacena botellas abiertas de vino o licor con tapa hermética y úsalas en máximo 1 semana.",
    "Los concentrados y jarabes abiertos deben refrigerarse y etiquetarse con fecha de apertura.",
  ],
}

interface WasteEntry {
  id: string
  category: string
  amountKg: number
  costPerKg: number
  date: string // ISO date
  note?: string
  cause: string // key from CAUSAS
}

let wasteId = 0
function nextWasteId() { wasteId++; return `waste-${Date.now()}-${wasteId}` }

export default function MermasPage() {
  const { selectedCollection } = useRestaurant()
  const { toast } = useToast()
  const slug = selectedCollection?.slug || null
  const [entries, setEntries] = useLocalStorage<WasteEntry[]>("mermas-entries", [], slug)
  const [showForm, setShowForm] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState(WASTE_CATEGORIES[0].key)
  const [amountKg, setAmountKg] = useState("")
  const [costPerKg, setCostPerKg] = useState("")
  const [note, setNote] = useState("")
  const [selectedCause, setSelectedCause] = useState(CAUSAS[0].key)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [expandedTip, setExpandedTip] = useState<string | null>(null)
  const [showTrends, setShowTrends] = useState(false)
  const [showTrendChart, setShowTrendChart] = useState(false)
  const [showMonthlyGoal, setShowMonthlyGoal] = useState(false)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [dateFilter, setDateFilter] = useState<"all" | "week" | "month">("all")
  const [monthlyGoal, setMonthlyGoal] = useLocalStorage<number>("merma-monthly-goal", 0, slug)

  // Filtro por rango de fechas — calculado siempre (nunca después de un early return)
  const filteredEntries = useMemo(() => {
    if (dateFilter === "all") return entries
    const now = new Date()
    const cutoff = new Date()
    if (dateFilter === "week") cutoff.setDate(now.getDate() - 7)
    else if (dateFilter === "month") cutoff.setDate(now.getDate() - 30)
    return entries.filter((e) => new Date(e.date) >= cutoff)
  }, [entries, dateFilter])

  function addEntry() {
    const kg = parseFloat(amountKg)
    const cost = parseFloat(costPerKg)
    if (!selectedCategory || !selectedCause || !kg || !cost || kg <= 0 || cost <= 0) return
    
    if (editingId) {
      // Update existing entry
      setEntries((prev) => prev.map((e) => e.id === editingId ? {
        ...e,
        category: selectedCategory,
        cause: selectedCause,
        amountKg: kg,
        costPerKg: cost,
        note: note.trim() || undefined,
      } : e))
      toast("Entrada de merma actualizada", "success")
    } else {
      setEntries((prev) => [...prev, {
        id: nextWasteId(),
        category: selectedCategory,
        cause: selectedCause,
        amountKg: kg,
        costPerKg: cost,
        date: new Date().toISOString(),
        note: note.trim() || undefined,
      }])
      toast("Entrada de merma registrada", "warning")
    }
    setAmountKg("")
    setCostPerKg("")
    setNote("")
    setSelectedCause(CAUSAS[0].key)
    setEditingId(null)
    setShowForm(false)
  }

  function startEditEntry(entry: WasteEntry) {
    setEditingId(entry.id)
    setSelectedCategory(entry.category)
    setSelectedCause(entry.cause || CAUSAS[0].key)
    setAmountKg(String(entry.amountKg))
    setCostPerKg(String(entry.costPerKg))
    setNote(entry.note || "")
    setShowForm(true)
  }

  function cancelForm() {
    setShowForm(false)
    setEditingId(null)
    setAmountKg("")
    setCostPerKg("")
    setNote("")
    setSelectedCause(CAUSAS[0].key)
  }

  function removeEntry(id: string) {
    setDeleteConfirmId(id)
  }

  function confirmDeleteEntry() {
    if (deleteConfirmId) {
      setEntries((prev) => prev.filter((e) => e.id !== deleteConfirmId))
      toast("Entrada de merma eliminada", "error")
      setDeleteConfirmId(null)
    }
  }

  if (!selectedCollection) {
    return (
      <div className="text-center py-16">
        <Trash2 className="w-12 h-12 text-gray-300 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-gray-700 mb-2">Selecciona tu tipo de cocina</h3>
        <p className="text-sm text-gray-400 max-w-md mx-auto">
          Selecciona tu tipo de restaurante para recibir consejos de reducción de merma personalizados.
        </p>
      </div>
    )
  }

  const totalLoss = filteredEntries.reduce((sum, e) => sum + (e.amountKg * e.costPerKg), 0)
  const monthLoss = entries
    .filter((e) => new Date(e.date).getMonth() === new Date().getMonth())
    .reduce((sum, e) => sum + e.amountKg * e.costPerKg, 0)
  const goalProgress = monthlyGoal > 0 ? (monthLoss / monthlyGoal) * 100 : 0
  const categoryTotals = new Map<string, number>()
  filteredEntries.forEach((e) => {
    categoryTotals.set(e.category, (categoryTotals.get(e.category) || 0) + (e.amountKg * e.costPerKg))
  })

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <Link href="/panel" className="p-2 rounded-xl hover:bg-gray-100 transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-400" />
        </Link>
        <div>
          <h2 className="text-xl font-bold text-gray-900">Calculadora de mermas</h2>
          <p className="text-sm text-gray-400">{selectedCollection.name}</p>
        </div>
      </div>

      {/* Date filter */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xs text-gray-400">Filtrar:</span>
        <div className="flex bg-gray-100 rounded-lg p-1">
          {(["all", "week", "month"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setDateFilter(f)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                dateFilter === f ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {f === "all" ? "Todo" : f === "week" ? "7 días" : "30 días"}
            </button>
          ))}
        </div>
        <span className="text-[10px] text-gray-400 ml-auto">
          {filteredEntries.length} de {entries.length} registros
        </span>
      </div>

      {/* Total loss banner */}
      <div className={`rounded-2xl p-6 mb-4 ${totalLoss > 5000 ? "bg-red-50 border border-red-200" : totalLoss > 1000 ? "bg-amber-50 border border-amber-200" : "bg-green-50 border border-green-200"}`}>
        <div className="flex items-center gap-3">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${totalLoss > 5000 ? "bg-red-100" : totalLoss > 1000 ? "bg-amber-100" : "bg-green-100"}`}>
            <DollarSign className={`w-6 h-6 ${totalLoss > 5000 ? "text-red-600" : totalLoss > 1000 ? "text-amber-600" : "text-green-600"}`} />
          </div>
          <div>
            <p className="text-sm text-gray-500">Pérdida total por merma</p>
            <p className={`text-3xl font-extrabold ${totalLoss > 5000 ? "text-red-700" : totalLoss > 1000 ? "text-amber-700" : "text-green-700"}`}>
              ${totalLoss.toFixed(2)}
            </p>
            <p className="text-xs text-gray-400">
              {filteredEntries.length > 0 ? `${filteredEntries.length} registros` : "Sin registros aún"}
            </p>
          </div>
        </div>
      </div>

      {/* Entries */}
      {filteredEntries.length > 0 && (
        <div className="space-y-2 mb-6">
          {filteredEntries.map((entry) => {
            const cat = WASTE_CATEGORIES.find((c) => c.key === entry.category)
            return (
              <div key={entry.id} className="flex items-center justify-between bg-white rounded-xl border border-gray-100 p-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-lg">{cat?.icon}</span>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-medium text-gray-800">{cat?.label}</p>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-red-50 text-red-600 font-medium">
                        {CAUSAS.find((c) => c.key === entry.cause)?.icon} {CAUSAS.find((c) => c.key === entry.cause)?.label || "Sin causa"}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400">{entry.amountKg} kg × ${entry.costPerKg}/kg</p>
                    {entry.note && (
                      <p className="text-xs text-gray-500 italic mt-0.5">"{entry.note}"</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="font-bold text-red-600 text-sm">
                    ${(entry.amountKg * entry.costPerKg).toFixed(2)}
                  </span>
                  <button onClick={() => startEditEntry(entry)} className="p-1.5 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-500 transition-colors" title="Editar registro">
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => removeEntry(entry.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Add form */}
      {showForm ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-6">
          <h4 className="font-semibold text-gray-900 mb-4">
            {editingId ? "Editar registro de merma" : "Registrar merma"}
          </h4>
          <div className="space-y-3">
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-[#108910] bg-white"
            >
              {WASTE_CATEGORIES.map((cat) => (
                <option key={cat.key} value={cat.key}>{cat.icon} {cat.label}</option>
              ))}
            </select>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-xs text-gray-400 mb-1 block">Cantidad (kg)</label>
                <input
                  type="number"
                  value={amountKg}
                  onChange={(e) => setAmountKg(e.target.value)}
                  placeholder="Ej: 2.5"
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-[#108910]"
                  min="0"
                  step="0.1"
                />
              </div>
              <div className="flex-1">
                <label className="text-xs text-gray-400 mb-1 block">Costo por kg ($)</label>
                <input
                  type="number"
                  value={costPerKg}
                  onChange={(e) => setCostPerKg(e.target.value)}
                  placeholder="Ej: 85"
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-[#108910]"
                  min="0"
                  step="0.5"
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Causa de la merma</label>
              <div className="flex flex-wrap gap-1.5">
                {CAUSAS.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => setSelectedCause(c.key)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      selectedCause === c.key
                        ? "bg-red-100 text-red-700 border border-red-300"
                        : "bg-gray-50 text-gray-500 border border-gray-200 hover:border-red-200"
                    }`}
                  >
                    {c.icon} {c.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Nota o motivo (opcional)</label>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Ej: Se echó a perder por cadena de frío..."
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-[#108910]"
              />
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={addEntry} className="flex-1 bg-red-600 text-white font-semibold py-2.5 rounded-xl hover:bg-red-700 transition-colors">
              {editingId ? "Guardar cambios" : "Registrar pérdida"}
            </button>
            <button onClick={cancelForm} className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-500 hover:bg-gray-50">
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl border-2 border-dashed border-gray-200 text-gray-400 hover:border-red-400 hover:text-red-400 transition-colors font-medium mb-6"
        >
          <Plus className="w-5 h-5" />
          Registrar merma
        </button>
      )}

      {/* Category breakdown & trends */}
      {entries.length > 0 && (
        <>
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden mb-6">
            <button
              onClick={() => setShowTrends(!showTrends)}
              className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-indigo-600" />
                <h3 className="font-semibold text-gray-900">Desglose por categoría</h3>
              </div>
              <span className="text-xs text-gray-400">{showTrends ? "Ocultar" : "Ver"}</span>
            </button>
            {showTrends && (
              <div className="border-t border-gray-100 p-4 space-y-3">
                {WASTE_CATEGORIES.map((cat) => {
                  const catEntries = entries.filter((e) => e.category === cat.key)
                  const catLoss = catEntries.reduce((s, e) => s + (e.amountKg * e.costPerKg), 0)
                  const catKg = catEntries.reduce((s, e) => s + e.amountKg, 0)
                  const pctOfTotal = totalLoss > 0 ? (catLoss / totalLoss) * 100 : 0
                  if (catLoss === 0) return null
                  return (
                    <div key={cat.key} className="flex items-center gap-3">
                      <span className="text-lg w-8 text-center">{cat.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium text-gray-700">{cat.label}</span>
                          <span className="text-sm font-bold text-red-600">${catLoss.toFixed(2)}</span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                          <div
                            className="bg-red-500 h-full rounded-full transition-all"
                            style={{ width: `${Math.max(pctOfTotal, 2)}%` }}
                          />
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {catKg.toFixed(1)} kg ({catEntries.length} registros)
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Top cause section */}
          {(() => {
            const byCause = new Map<string, number>()
            entries.forEach((e) => {
              const key = e.cause || "otro"
              byCause.set(key, (byCause.get(key) || 0) + e.amountKg * e.costPerKg)
            })
            const sorted = Array.from(byCause.entries()).sort((a, b) => b[1] - a[1])
            const topCause = sorted[0]
            const topCauseData = CAUSAS.find((c) => c.key === topCause?.[0])
            return (
              <div className="bg-white rounded-2xl border border-gray-100 p-4 mb-6">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg">🎯</span>
                  <h3 className="font-semibold text-gray-900">Causa principal de merma</h3>
                </div>
                {topCause && topCauseData ? (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-2xl">{topCauseData.icon}</span>
                      <div>
                        <p className="text-base font-bold text-gray-800">{topCauseData.label}</p>
                        <p className="text-sm text-red-600 font-semibold">${topCause[1].toFixed(2)} ({((topCause[1] / totalLoss) * 100).toFixed(0)}% del total)</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {sorted.map(([key, amount]) => {
                        const d = CAUSAS.find((c) => c.key === key)
                        const pct = totalLoss > 0 ? ((amount / totalLoss) * 100).toFixed(0) : 0
                        return (
                          <span key={key} className="text-[10px] px-2 py-1 rounded-lg bg-gray-100 text-gray-600">
                            {d?.icon} {d?.label}: {pct}%
                          </span>
                        )
                      })}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-gray-400">Sin datos suficientes para determinar la causa principal.</p>
                )}
              </div>
            )
          })()}
        </>
      )}

      {/* Trend chart — 6 months */}
      {entries.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden mb-6">
          <button
            onClick={() => setShowTrendChart(!showTrendChart)}
            className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <TrendingDown className="w-5 h-5 text-indigo-600" />
              <h3 className="font-semibold text-gray-900">Tendencia 6 meses</h3>
            </div>
            <span className="text-xs text-gray-400">{showTrendChart ? "Ocultar" : "Ver"}</span>
          </button>
          {showTrendChart && (
            <div className="border-t border-gray-100 p-4">
              {(() => {
                const months: { label: string; loss: number; byCause: Record<string, number> }[] = []
                const today = new Date()
                for (let i = 5; i >= 0; i--) {
                  const d = new Date(today.getFullYear(), today.getMonth() - i, 1)
                  const monthStart = new Date(d.getFullYear(), d.getMonth(), 1)
                  const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59)
                  const monthEntries = entries.filter((e) => {
                    const date = new Date(e.date)
                    return date >= monthStart && date <= monthEnd
                  })
                  const loss = monthEntries.reduce((s, e) => s + e.amountKg * e.costPerKg, 0)
                  const byCause: Record<string, number> = {}
                  monthEntries.forEach((e) => {
                    byCause[e.cause || "otro"] = (byCause[e.cause || "otro"] || 0) + e.amountKg * e.costPerKg
                  })
                  const monthNames = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]
                  months.push({
                    label: `${monthNames[d.getMonth()]} ${d.getFullYear()}`,
                    loss,
                    byCause,
                  })
                }
                const maxLoss = Math.max(...months.map((m) => m.loss), 1)
                return (
                  <div className="space-y-2">
                    <div className="flex items-end gap-2 h-32">
                      {months.map((m, idx) => {
                        const isOverGoal = monthlyGoal > 0 && m.loss > monthlyGoal
                        return (
                          <div key={idx} className="flex-1 flex flex-col items-center gap-1 min-w-0" title={m.byCause ? Object.entries(m.byCause).map(([k, v]) => `${CAUSAS.find((c) => c.key === k)?.label || k}: $${v.toFixed(0)}`).join(", ") : ""}>
                            <span className={`text-[10px] font-mono font-bold ${isOverGoal ? "text-red-600" : "text-gray-500"}`}>
                              ${m.loss.toFixed(0)}
                            </span>
                            <div className="w-full flex-1 bg-gray-100 rounded-t-lg relative overflow-hidden">
                              <div
                                className={`absolute bottom-0 w-full rounded-t-lg transition-all ${isOverGoal ? "bg-gradient-to-t from-red-500 to-red-400" : "bg-gradient-to-t from-indigo-400 to-indigo-300"}`}
                                style={{ height: `${Math.max((m.loss / maxLoss) * 100, 2)}%` }}
                              />
                            </div>
                            <span className="text-[10px] text-gray-400">{m.label}</span>
                          </div>
                        )
                      })}
                    </div>
                    {monthlyGoal > 0 && (
                      <div className="flex items-center gap-2 text-[10px] text-gray-400">
                        <div className="w-3 h-0 border-t border-dashed border-red-400" />
                        Meta mensual: ${monthlyGoal.toFixed(0)}
                      </div>
                    )}
                  </div>
                )
              })()}
            </div>
          )}
        </div>
      )}

      {/* Monthly goal */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden mb-6">
        <button
          onClick={() => setShowMonthlyGoal(!showMonthlyGoal)}
          className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-emerald-600" />
            <h3 className="font-semibold text-gray-900">Meta mensual de merma</h3>
          </div>
          <span className="text-xs text-gray-400">{monthlyGoal > 0 ? `${goalProgress.toFixed(0)}%` : "Configurar"}</span>
        </button>
        {showMonthlyGoal && (
          <div className="border-t border-gray-100 p-4 space-y-3">
            <div className="flex items-center gap-3">
              <label className="text-sm text-gray-600 shrink-0">Meta máxima:</label>
              <input
                type="number"
                value={monthlyGoal || ""}
                onChange={(e) => setMonthlyGoal(parseFloat(e.target.value) || 0)}
                placeholder="$5,000"
                className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#108910]"
              />
              <span className="text-sm text-gray-400">MXN</span>
            </div>
            {monthlyGoal > 0 && (
              <>
                <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      goalProgress > 100 ? "bg-red-500" : goalProgress > 75 ? "bg-amber-500" : "bg-emerald-500"
                    }`}
                    style={{ width: `${Math.min(goalProgress, 100)}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">
                    ${monthLoss.toFixed(0)} de ${monthlyGoal.toFixed(0)}
                  </span>
                  <span className={`font-bold ${goalProgress > 100 ? "text-red-600" : "text-emerald-600"}`}>
                    {goalProgress > 100 ? `¡Excedido por ${(goalProgress - 100).toFixed(0)}%!` : `${goalProgress.toFixed(0)}% usado`}
                  </span>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Tips */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="p-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Lightbulb className="w-5 h-5 text-amber-500" />
            <h3 className="font-semibold text-gray-900">Tips para reducir merma</h3>
          </div>
        </div>
        <div className="divide-y divide-gray-50">
          {WASTE_CATEGORIES.map((cat) => {
            const tips = TIPS[cat.key] || ["Usa el sistema PEPS en tu almacén.", "Revisa la calidad al recibir mercancía de Resurte.me."]
            return (
              <div key={cat.key}>
                <button
                  onClick={() => setExpandedTip(expandedTip === cat.key ? null : cat.key)}
                  className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors text-left"
                >
                  <span className="flex items-center gap-2 text-sm font-medium text-gray-700">
                    <span>{cat.icon}</span>
                    {cat.label}
                    <span className="text-xs text-gray-400">(~{cat.avgWastePercent}% merma típica)</span>
                  </span>
                  <TrendingDown className="w-4 h-4 text-gray-400" />
                </button>
                {expandedTip === cat.key && (
                  <div className="px-4 pb-4 space-y-2">
                    {tips.map((tip, idx) => (
                      <div key={idx} className="flex items-start gap-2 text-sm text-gray-500">
                        <span className="text-green-500 mt-0.5 shrink-0">✓</span>
                        <span>{tip}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div className="mt-4 bg-amber-50 rounded-xl p-4 border border-amber-100">
        <p className="text-xs text-amber-700">
          <strong>💡 Sabías que:</strong> La merma promedio en restaurantes mexicanos es del 8-12% del costo de alimentos. 
          Reducirla solo 2 puntos porcentuales puede aumentar tu utilidad neta hasta un 15%. 
          Resurte.me te ayuda con entregas frecuentes para que compres solo lo que necesitas.
        </p>
      </div>

      {/* Delete confirmation modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-white rounded-2xl p-6 max-w-sm mx-4 shadow-xl">
            <h4 className="font-bold text-gray-900 mb-2">¿Eliminar este registro?</h4>
            <p className="text-sm text-gray-500 mb-4">Esta acción no se puede deshacer. Perderás el registro de merma y su costo asociado.</p>
            <div className="flex gap-3">
              <button onClick={confirmDeleteEntry} className="flex-1 bg-red-600 text-white font-semibold py-2.5 rounded-xl hover:bg-red-700 text-sm">
                Sí, eliminar
              </button>
              <button onClick={() => setDeleteConfirmId(null)} className="flex-1 border border-gray-200 text-gray-600 font-semibold py-2.5 rounded-xl hover:bg-gray-50 text-sm">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
