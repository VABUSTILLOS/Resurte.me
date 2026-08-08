import { BarChart3 } from "lucide-react"

interface MonthlyGoalProps {
  monthlyGoal: number
  monthLoss: number
  goalProgress: number
  mermaMaxPct: number
  open: boolean
  onToggle: () => void
  onGoalChange: (v: number) => void
}

export default function MonthlyGoal({
  monthlyGoal, monthLoss, goalProgress, mermaMaxPct, open, onToggle, onGoalChange,
}: MonthlyGoalProps) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden mb-6">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-emerald-600" />
          <h3 className="font-semibold text-gray-900">Meta mensual de merma</h3>
        </div>
        <span className="text-xs text-gray-400">{monthlyGoal > 0 ? `${goalProgress.toFixed(0)}%` : "Configurar"}</span>
      </button>
      {open && (
        <div className="border-t border-gray-100 p-4 space-y-3">
          <div className="flex items-center gap-3">
            <label className="text-sm text-gray-600 shrink-0">Meta máxima:</label>
            <input
              type="number"
              value={monthlyGoal || ""}
              onChange={(e) => onGoalChange(parseFloat(e.target.value) || 0)}
              placeholder="$5,000"
              className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#0E7A0E]"
            />
            <span className="text-sm text-gray-400">MXN</span>
          </div>
          {monthlyGoal > 0 && (
            <>
              <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    goalProgress > 100 ? "bg-red-500" : goalProgress > 100 - mermaMaxPct ? "bg-amber-500" : "bg-emerald-500"
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
  )
}
