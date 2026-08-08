import { TrendingDown } from "lucide-react"
import { CAUSAS } from "./mermas-shared"

interface WasteEntryItem {
  date: string
  amountKg: number
  costPerKg: number
  cause: string
}

interface TrendsPanelProps {
  entries: WasteEntryItem[]
  monthlyGoal: number
  open: boolean
  onToggle: () => void
}

const MONTH_NAMES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]

interface MonthDatum {
  label: string
  loss: number
  byCause: Record<string, number>
}

function buildMonths(entries: WasteEntryItem[]): MonthDatum[] {
  const months: MonthDatum[] = []
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
    months.push({
      label: `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`,
      loss,
      byCause,
    })
  }
  return months
}

export default function TrendsPanel({ entries, monthlyGoal, open, onToggle }: TrendsPanelProps) {
  const months = buildMonths(entries)
  const maxLoss = Math.max(...months.map((m) => m.loss), 1)

  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden mb-6">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <TrendingDown className="w-5 h-5 text-indigo-600" />
          <h3 className="font-semibold text-gray-900">Tendencia 6 meses</h3>
        </div>
        <span className="text-xs text-gray-400">{open ? "Ocultar" : "Ver"}</span>
      </button>
      {open && (
        <div className="border-t border-gray-100 p-4">
          <div className="space-y-2">
            <div className="flex items-end gap-2 h-32">
              {months.map((m, idx) => {
                const isOverGoal = monthlyGoal > 0 && m.loss > monthlyGoal
                return (
                  <div
                    key={idx}
                    className="flex-1 flex flex-col items-center gap-1 min-w-0"
                    title={Object.entries(m.byCause).map(([k, v]) => `${CAUSAS.find((c) => c.key === k)?.label || k}: $${v.toFixed(0)}`).join(", ")}
                  >
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
        </div>
      )}
    </div>
  )
}
