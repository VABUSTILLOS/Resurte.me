"use client"

import { Copy, Landmark } from "lucide-react"
import type { MethodRow } from "./ventas-shared"

interface CorteCajaProps {
  methodBreakdown: MethodRow[]
  revenue: number
  dayEntryCount: number
  selectedDateLabel: string
  tipoCambio: number
  onCopy: () => void
}

export default function CorteCaja({ methodBreakdown, revenue, dayEntryCount, selectedDateLabel, tipoCambio, onCopy }: CorteCajaProps) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-6">
      <div className="flex items-center gap-2 mb-4">
        <Landmark className="w-4 h-4 text-[#0E7A0E]" />
        <h3 className="text-sm font-semibold text-gray-900">Corte de caja · {selectedDateLabel}</h3>
        <button
          onClick={onCopy}
          disabled={dayEntryCount === 0}
          className="ml-auto flex items-center gap-1.5 text-xs font-semibold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title="Copiar corte de caja del día seleccionado"
          aria-label="Copiar corte de caja"
        >
          <Copy className="w-3.5 h-3.5" />
          Copiar corte
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {methodBreakdown.map((m) => (
          <div key={m.key} className="bg-gray-50 rounded-xl p-3 text-center">
            <p className="text-[10px] text-gray-500 mb-1">{m.icon} {m.label}</p>
            <p className="text-lg font-extrabold text-gray-800">${m.revenue.toFixed(0)}</p>
            <p className="text-[10px] text-gray-400">{m.count} venta{m.count !== 1 ? "s" : ""}</p>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
        <span className="text-xs text-gray-500">Total del día</span>
        <span className="flex flex-col items-end">
          <span className="text-lg font-extrabold text-[#0E7A0E]">${revenue.toFixed(0)}</span>
          {tipoCambio !== 1 && <span className="text-[10px] text-gray-400">≈ ${(revenue / tipoCambio).toFixed(2)} USD</span>}
        </span>
      </div>
    </div>
  )
}
