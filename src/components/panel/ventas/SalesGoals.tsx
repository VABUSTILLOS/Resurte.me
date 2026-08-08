"use client"

import { Check, HandCoins, Settings2, Target } from "lucide-react"
import { SALE_CHANNELS } from "./ventas-shared"
import type { DayStats } from "./ventas-shared"

interface SalesGoalsProps {
  showGoals: boolean
  goalFormDia: string
  goalFormMes: string
  dailyGoal: number
  monthlyGoal: number
  dayStats: DayStats
  dailyGoalPct: number
  monthlyGoalPct: number
  monthRevenue: number
  projectedRevenue: number
  onPace: boolean
  comisiones: Record<string, number>
  onToggle: () => void
  onGoalFormDiaChange: (v: string) => void
  onGoalFormMesChange: (v: string) => void
  onSave: () => void
  onComisionChange: (key: string, value: string) => void
}

export default function SalesGoals({
  showGoals,
  goalFormDia,
  goalFormMes,
  dailyGoal,
  monthlyGoal,
  dayStats,
  dailyGoalPct,
  monthlyGoalPct,
  monthRevenue,
  projectedRevenue,
  onPace,
  comisiones,
  onToggle,
  onGoalFormDiaChange,
  onGoalFormMesChange,
  onSave,
  onComisionChange,
}: SalesGoalsProps) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-6">
      <div className="flex items-center gap-2 mb-4">
        <Target className="w-4 h-4 text-[#0E7A0E]" />
        <h3 className="text-sm font-semibold text-gray-900">Metas de venta</h3>
        <button
          onClick={onToggle}
          className="ml-auto flex items-center gap-1.5 text-xs font-semibold text-gray-500 bg-gray-50 hover:bg-gray-100 px-2.5 py-1 rounded-lg transition-colors"
          title={showGoals ? "Cerrar edición" : "Editar metas diaria y mensual"}
          aria-label="Editar metas de venta"
        >
          <Settings2 className="w-3.5 h-3.5" />
          {showGoals ? "Cerrar" : "Editar metas"}
        </button>
      </div>

      {showGoals ? (
        <>
          <div className="grid sm:grid-cols-[1fr_1fr_auto] gap-3 items-end">
            <div>
              <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-1">Meta diaria ($)</label>
              <input
                type="number"
                value={goalFormDia}
                onChange={(e) => onGoalFormDiaChange(e.target.value)}
                min="0"
                placeholder="Ej. 12000"
                className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-[#0E7A0E]"
                aria-label="Meta de venta diaria"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-1">Meta mensual ($)</label>
              <input
                type="number"
                value={goalFormMes}
                onChange={(e) => onGoalFormMesChange(e.target.value)}
                min="0"
                placeholder="Ej. 360000"
                className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-[#0E7A0E]"
                aria-label="Meta de venta mensual"
              />
            </div>
            <button
              onClick={onSave}
              className="flex items-center justify-center gap-1.5 px-4 py-2 bg-[#0E7A0E] text-white text-xs font-semibold rounded-xl hover:bg-green-800 transition-colors"
            >
              <Check className="w-3.5 h-3.5" />
              Guardar
            </button>
          </div>
          <div className="mt-4 pt-4 border-t border-gray-100">
            <p className="text-[10px] font-semibold text-gray-400 uppercase mb-2">Comisiones por canal (%)</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {SALE_CHANNELS.map((c) => (
                <label key={c.key} className="block">
                  <span className="block text-[10px] text-gray-500 mb-1">{c.icon} {c.label}</span>
                  <input
                    type="number"
                    value={comisiones[c.key] || 0}
                    onChange={(e) => onComisionChange(c.key, e.target.value)}
                    min="0"
                    step="0.5"
                    className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-xs bg-white focus:outline-none focus:border-[#0E7A0E]"
                    aria-label={`Comisión por canal ${c.label}`}
                  />
                </label>
              ))}
            </div>
            <p className="text-[10px] text-gray-400 mt-1.5">
              <HandCoins className="w-3 h-3 inline-block mr-1 text-[#0E7A0E]" />
              Se calcula sobre los ingresos del día/período según el canal de cada venta.
            </p>
          </div>
        </>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <div className="flex items-baseline justify-between mb-1.5">
              <span className="text-xs font-medium text-gray-500">Meta diaria</span>
              <span className="text-xs text-gray-400">
                {dailyGoal > 0 ? `$${dayStats.revenue.toFixed(0)} / $${dailyGoal.toFixed(0)}` : "Sin meta"}
              </span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  dailyGoalPct >= 100 ? "bg-green-500" : dailyGoalPct >= 50 ? "bg-amber-500" : "bg-[#0E7A0E]"
                }`}
                style={{ width: `${Math.min(dailyGoalPct, 100)}%` }}
              />
            </div>
            <p className="text-[10px] text-gray-400 mt-1.5">
              {dailyGoal > 0
                ? `${dailyGoalPct.toFixed(0)}% · Proyección a cierre: $${projectedRevenue.toFixed(0)} ${
                    onPace ? "✅ En ritmo" : "⚠️ Atrasado"
                  }`
                : "Define una meta para ver tu progreso del día."}
            </p>
          </div>
          <div>
            <div className="flex items-baseline justify-between mb-1.5">
              <span className="text-xs font-medium text-gray-500">Meta mensual</span>
              <span className="text-xs text-gray-400">
                {monthlyGoal > 0 ? `$${monthRevenue.toFixed(0)} / $${monthlyGoal.toFixed(0)}` : "Sin meta"}
              </span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  monthlyGoalPct >= 100 ? "bg-green-500" : monthlyGoalPct >= 50 ? "bg-amber-500" : "bg-[#0E7A0E]"
                }`}
                style={{ width: `${Math.min(monthlyGoalPct, 100)}%` }}
              />
            </div>
            <p className="text-[10px] text-gray-400 mt-1.5">
              {monthlyGoal > 0
                ? `${monthlyGoalPct.toFixed(0)}% del mes · te faltan $${Math.max(0, monthlyGoal - monthRevenue).toFixed(0)}`
                : "Define una meta para seguir tu avance mensual."}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
