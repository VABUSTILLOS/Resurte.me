"use client"

import { TrendingUp } from "lucide-react"
import type { TopSeller } from "./ventas-shared"

interface TopSellersProps {
  topSellers: TopSeller[]
  totalUnits: number
  selectedDateLabel: string
}

export default function TopSellers({ topSellers, totalUnits, selectedDateLabel }: TopSellersProps) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5">
      <div className="flex items-center gap-2 mb-4">
        <TrendingUp className="w-4 h-4 text-[#108910]" />
        <h3 className="text-sm font-semibold text-gray-900">Top ventas · {selectedDateLabel}</h3>
      </div>
      {topSellers.length === 0 ? (
        <p className="text-xs text-gray-400">Sin ventas este día.</p>
      ) : (
        <div className="space-y-2">
          {topSellers.map((t, i) => {
            const pct = totalUnits > 0 ? (t.qty / totalUnits) * 100 : 0
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
  )
}
