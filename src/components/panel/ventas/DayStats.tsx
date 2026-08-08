"use client"

import { BarChart3, DollarSign, Plus, Receipt, Target, TrendingUp } from "lucide-react"
import { t } from "@/lib/i18n/es"
import { dateLabel } from "@/lib/panel-utils"
import type { PanelConfig } from "@/lib/panel-config"
import { foodCostStatus } from "@/lib/panel-config"
import type { DayStats as DayStatsShape } from "./ventas-shared"

interface DayStatsProps {
  hasEntries: boolean
  dayStats: DayStatsShape
  selectedDate: string
  showAll: boolean
  tipoCambio: number
  panelCfg: PanelConfig
  onDateChange: (date: string) => void
  onToggleShowAll: () => void
  onFocusFirstDish: () => void
}

export default function DayStats({
  hasEntries,
  dayStats,
  selectedDate,
  showAll,
  tipoCambio,
  panelCfg,
  onDateChange,
  onToggleShowAll,
  onFocusFirstDish,
}: DayStatsProps) {
  return (
    <>
      <div className="flex items-center gap-2 mb-4">
        <div className="flex items-center gap-2 bg-white rounded-xl border border-gray-100 px-3 py-2">
          <span className="text-xs text-gray-400 shrink-0">Día:</span>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => onDateChange(e.target.value)}
            className="text-xs font-semibold text-gray-700 bg-transparent focus:outline-none"
            aria-label="Seleccionar día a consultar"
          />
        </div>
        <button
          onClick={onToggleShowAll}
          className={`text-xs font-semibold px-3 py-2 rounded-xl transition-colors ${
            showAll ? "bg-[#0E7A0E] text-white" : "bg-white text-gray-600 border border-gray-100 hover:bg-gray-50"
          }`}
        >
          {showAll ? "Ver solo este día" : "Ver todo el historial"}
        </button>
      </div>

      {!hasEntries ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
          <Receipt className="w-12 h-12 text-gray-200 mx-auto mb-4" />
          <p className="text-gray-400 font-medium mb-1">{t("ventas.emptyTitle")}</p>
          <p className="text-xs text-gray-300 mb-4">Registra tu primera venta del día para ver tu margen real</p>
          <button
            onClick={onFocusFirstDish}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#0E7A0E] text-white text-xs font-semibold rounded-xl hover:bg-green-800 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Registrar primera venta
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
          <div className="bg-white rounded-xl border border-gray-100 p-4 text-center">
            <DollarSign className="w-5 h-5 text-emerald-600 mx-auto mb-1" />
            <p className="text-lg font-extrabold text-emerald-700">${dayStats.revenue.toFixed(0)}</p>
            <p className="text-[10px] text-gray-400">Ingresos · {dateLabel(selectedDate)}</p>
            {tipoCambio !== 1 && <p className="text-[10px] text-gray-300 font-semibold mt-0.5">≈ ${(dayStats.revenue / tipoCambio).toFixed(2)} USD</p>}
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-4 text-center">
            <Receipt className="w-5 h-5 text-blue-600 mx-auto mb-1" />
            <p className="text-lg font-extrabold text-blue-700">${dayStats.cost.toFixed(0)}</p>
            <p className="text-[10px] text-gray-400">Costo de venta (COGS)</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-4 text-center">
            <TrendingUp className="w-5 h-5 text-[#0E7A0E] mx-auto mb-1" />
            <p className={`text-lg font-extrabold ${dayStats.margin >= 0 ? "text-[#0E7A0E]" : "text-red-600"}`}>
              ${dayStats.margin.toFixed(0)}
            </p>
            <p className="text-[10px] text-gray-400">Margen bruto</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-4 text-center">
            <Target className="w-5 h-5 text-amber-600 mx-auto mb-1" />
            <p className={`text-lg font-extrabold ${
              foodCostStatus(dayStats.foodCost, panelCfg) === "red" ? "text-red-600" :
              foodCostStatus(dayStats.foodCost, panelCfg) === "amber" ? "text-amber-600" : "text-green-700"
            }`}>
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
      )}
    </>
  )
}
