"use client"

import { Receipt } from "lucide-react"
import type { AllTimeStats } from "./ventas-shared"

interface AllTimeTipProps {
  hasEntries: boolean
  allTimeStats: AllTimeStats
  foodCostRedAbove: number
}

export default function AllTimeTip({ hasEntries, allTimeStats, foodCostRedAbove }: AllTimeTipProps) {
  if (!hasEntries) return null
  return (
    <div className="mt-6 bg-gradient-to-r from-[#F0FDF4] to-white rounded-2xl border border-[#108910]/10 p-5">
      <div className="flex items-start gap-3">
        <Receipt className="w-5 h-5 text-[#108910] mt-0.5 shrink-0" />
        <div>
          <h4 className="font-semibold text-gray-900 mb-1 text-sm">Tu historial en total</h4>
          <p className="text-xs text-gray-500 leading-relaxed">
            {allTimeStats.count} registros · ${allTimeStats.revenue.toFixed(0)} ingresos · ${allTimeStats.margin.toFixed(0)} margen bruto
            {allTimeStats.foodCost > 0 && ` · food cost promedio ${allTimeStats.foodCost.toFixed(1)}%`}.
            Un food cost arriba de {foodCostRedAbove}% significa que estás regalando margen: ajusta precios desde el Costeador.
          </p>
        </div>
      </div>
    </div>
  )
}
