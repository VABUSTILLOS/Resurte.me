"use client"

import { BarChart3 } from "lucide-react"
import type { WeekTrend } from "./ventas-shared"

interface WeekTrendProps {
  weekTrend: WeekTrend
}

export default function WeekTrend({ weekTrend }: WeekTrendProps) {
  return (
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
  )
}
