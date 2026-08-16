"use client"

import { AlertCircle, TrendingUp, Users } from "lucide-react"
import { WASTE_CATEGORIES } from "./planificador-shared"
import type { RealDemand } from "./planificador-shared"
import { toInt } from "@/lib/panel-utils"

interface PlannerControlsProps {
  covers: number
  setCovers: (v: number) => void
  realDemand: RealDemand | null
  onUseDemand: () => void
  wastePcts: Record<string, number>
  setWastePcts: (updater: (prev: Record<string, number>) => Record<string, number>) => void
}

// Controls: comensales esperados + % de merma por categoría.
export default function PlannerControls({
  covers,
  setCovers,
  realDemand,
  onUseDemand,
  wastePcts,
  setWastePcts,
}: PlannerControlsProps) {
  return (
    <div className="grid sm:grid-cols-2 gap-4 mb-6">
      <div className="bg-white rounded-2xl border border-gray-100 p-5">
        <div className="flex items-center gap-2 mb-3">
          <Users className="w-5 h-5 text-emerald-600" />
          <h3 className="font-semibold text-gray-900">Comensales esperados</h3>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => setCovers(Math.max(5, covers - 10))}
            className="w-10 h-10 rounded-xl bg-gray-100 hover:bg-gray-200 font-bold text-gray-600 text-lg transition-colors"
            aria-label="Reducir comensales"
          >
            −
          </button>
          <input
            type="number"
            value={covers}
            onChange={(e) => setCovers(Math.max(1, toInt(e.target.value)))}
            className="w-24 text-center text-2xl font-bold text-gray-900 bg-transparent border-b-2 border-gray-200 focus:border-[#0E7A0E] focus:outline-none py-1"
          />
          <button
            onClick={() => setCovers(covers + 10)}
            className="w-10 h-10 rounded-xl bg-gray-100 hover:bg-gray-200 font-bold text-gray-600 text-lg transition-colors"
            aria-label="Aumentar comensales"
          >
            +
          </button>
        </div>
        {realDemand && (
          <div className="mt-3 flex items-center gap-2 bg-emerald-50 rounded-xl px-3 py-2">
            <TrendingUp className="w-4 h-4 text-emerald-600 shrink-0" />
            <p className="text-xs text-emerald-800 min-w-0">
              <span className="font-semibold">📈 Demanda real: {realDemand.avg} platillos/día</span>
              <span className="block text-[10px] text-emerald-600">
                Promedio de ventas en los últimos 7 días ({realDemand.days} registros)
              </span>
            </p>
            <button
              onClick={onUseDemand}
              className="ml-auto text-xs font-semibold bg-emerald-600 text-white px-3 py-1.5 rounded-lg hover:bg-emerald-700 transition-colors shrink-0"
              aria-label="Usar demanda real como comensales esperados"
            >
              Usar
            </button>
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 p-5">
        <div className="flex items-center gap-2 mb-3">
          <AlertCircle className="w-5 h-5 text-amber-600" />
          <h3 className="font-semibold text-gray-900">% de merma por categoría</h3>
        </div>
        <div className="space-y-2">
          {WASTE_CATEGORIES.map((wc) => {
            const pct = wastePcts[wc.key] ?? wc.defaultPct
            return (
              <div key={wc.key} className="flex items-center gap-2">
                <span className="text-[10px] text-gray-500 w-20 shrink-0">{wc.label}</span>
                <input
                  type="range"
                  min="0"
                  max="25"
                  value={pct}
                  onChange={(e) => setWastePcts((prev) => ({ ...prev, [wc.key]: parseInt(e.target.value) }))}
                  className="flex-1 accent-amber-500 h-1.5"
                />
                <span className="text-xs font-bold text-amber-600 w-10 text-right">{pct}%</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
