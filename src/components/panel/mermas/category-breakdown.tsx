import { BarChart3 } from "lucide-react"
import { WASTE_CATEGORIES } from "./mermas-shared"

interface WasteEntryItem {
  id: string
  category: string
  amountKg: number
  costPerKg: number
  cause: string
}

interface CategoryBreakdownProps {
  entries: WasteEntryItem[]
  totalLoss: number
  open: boolean
  onToggle: () => void
}

export default function CategoryBreakdown({ entries, totalLoss, open, onToggle }: CategoryBreakdownProps) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden mb-6">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-indigo-600" />
          <h3 className="font-semibold text-gray-900">Desglose por categoría</h3>
        </div>
        <span className="text-xs text-gray-400">{open ? "Ocultar" : "Ver"}</span>
      </button>
      {open && (
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
  )
}
