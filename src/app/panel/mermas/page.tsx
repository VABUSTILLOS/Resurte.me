"use client"

import { useState, useMemo } from "react"
import { useRestaurant } from "@/contexts/restaurant-context"
import { useLocalStorage } from "@/hooks/use-local-storage"
import Link from "next/link"
import {
  Trash2, ArrowLeft, DollarSign, TrendingDown, Lightbulb,
  Plus, X, BarChart3,
} from "lucide-react"

const WASTE_CATEGORIES = [
  { key: "frutas_verduras", label: "Frutas y verduras", icon: "🥬", avgWastePercent: 12 },
  { key: "proteinas", label: "Carnes / Proteínas", icon: "🥩", avgWastePercent: 8 },
  { key: "lacteos", label: "Lácteos", icon: "🧀", avgWastePercent: 6 },
  { key: "granos", label: "Granos y harinas", icon: "🌾", avgWastePercent: 4 },
  { key: "preparados", label: "Alimentos preparados", icon: "🍲", avgWastePercent: 10 },
  { key: "bebidas", label: "Bebidas", icon: "🥤", avgWastePercent: 3 },
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
}

interface WasteEntry {
  id: string
  category: string
  amountKg: number
  costPerKg: number
  date: string // ISO date
}

let wasteId = 0
function nextWasteId() { wasteId++; return `waste-${Date.now()}-${wasteId}` }

export default function MermasPage() {
  const { selectedCollection } = useRestaurant()
  const slug = selectedCollection?.slug || null
  const [entries, setEntries] = useLocalStorage<WasteEntry[]>("mermas-entries", [], slug)
  const [showForm, setShowForm] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState(WASTE_CATEGORIES[0].key)
  const [amountKg, setAmountKg] = useState("")
  const [costPerKg, setCostPerKg] = useState("")
  const [expandedTip, setExpandedTip] = useState<string | null>(null)
  const [showTrends, setShowTrends] = useState(false)

  function addEntry() {
    const kg = parseFloat(amountKg)
    const cost = parseFloat(costPerKg)
    if (!selectedCategory || !kg || !cost || kg <= 0 || cost <= 0) return
    setEntries((prev) => [...prev, {
      id: nextWasteId(),
      category: selectedCategory,
      amountKg: kg,
      costPerKg: cost,
      date: new Date().toISOString(),
    }])
    setAmountKg("")
    setCostPerKg("")
    setShowForm(false)
  }

  function removeEntry(id: string) {
    setEntries((prev) => prev.filter((e) => e.id !== id))
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

  const totalLoss = entries.reduce((sum, e) => sum + (e.amountKg * e.costPerKg), 0)
  const categoryTotals = new Map<string, number>()
  entries.forEach((e) => {
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

      {/* Total loss banner */}
      <div className={`rounded-2xl p-6 mb-6 ${totalLoss > 5000 ? "bg-red-50 border border-red-200" : totalLoss > 1000 ? "bg-amber-50 border border-amber-200" : "bg-green-50 border border-green-200"}`}>
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
              {entries.length > 0 ? `${entries.length} registros` : "Sin registros aún"}
            </p>
          </div>
        </div>
      </div>

      {/* Entries */}
      {entries.length > 0 && (
        <div className="space-y-2 mb-6">
          {entries.map((entry) => {
            const cat = WASTE_CATEGORIES.find((c) => c.key === entry.category)
            return (
              <div key={entry.id} className="flex items-center justify-between bg-white rounded-xl border border-gray-100 p-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-lg">{cat?.icon}</span>
                  <div>
                    <p className="text-sm font-medium text-gray-800">{cat?.label}</p>
                    <p className="text-xs text-gray-400">{entry.amountKg} kg × ${entry.costPerKg}/kg</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="font-bold text-red-600 text-sm">
                    ${(entry.amountKg * entry.costPerKg).toFixed(2)}
                  </span>
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
          <h4 className="font-semibold text-gray-900 mb-4">Registrar merma</h4>
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
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={addEntry} className="flex-1 bg-red-600 text-white font-semibold py-2.5 rounded-xl hover:bg-red-700 transition-colors">
              Registrar pérdida
            </button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-500 hover:bg-gray-50">
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
      )}

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
    </div>
  )
}
