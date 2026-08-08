"use client"

import Link from "next/link"
import { Receipt, Copy, ArrowRight, Target } from "lucide-react"
import type { HubGoalProgress, HubTodaySales } from "./hub-data"

interface DaySummaryProps {
  todaySales: HubTodaySales
  puntosHoy: number
  goalProgress: HubGoalProgress | null
  onCopy: () => void
}

export default function DaySummary({ todaySales, puntosHoy, goalProgress, onCopy }: DaySummaryProps) {
  const copyDisabled = todaySales.count === 0 && todaySales.todayMerma === 0

  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden mb-6">
      <div className="flex items-center justify-between p-4 pb-3">
        <div className="flex items-center gap-2">
          <Receipt className="w-5 h-5 text-[#108910]" />
          <h3 className="font-semibold text-gray-900 text-sm">Resumen del día</h3>
          {todaySales.count === 0 && (
            <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Sin ventas aún</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onCopy}
            disabled={copyDisabled}
            className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Copiar resumen del día"
            aria-label="Copiar resumen del día"
          >
            <Copy className="w-3.5 h-3.5" />
            Copiar resumen
          </button>
          <Link href="/panel/ventas" className="text-xs font-semibold text-[#108910] hover:text-green-800 flex items-center gap-1">
            Registrar ventas
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 px-4 pb-4">
        <div className="bg-green-50 rounded-xl p-3 text-center">
          <p className="text-[10px] text-green-600">Ingresos hoy</p>
          <p className="text-lg font-extrabold text-green-700">${todaySales.revenue.toFixed(0)}</p>
        </div>
        <div className="bg-blue-50 rounded-xl p-3 text-center">
          <p className="text-[10px] text-blue-600">Margen bruto</p>
          <p className="text-lg font-extrabold text-blue-700">${todaySales.margin.toFixed(0)}</p>
        </div>
        <div className="bg-purple-50 rounded-xl p-3 text-center">
          <p className="text-[10px] text-purple-600">Ticket promedio</p>
          <p className="text-lg font-extrabold text-purple-700">{todaySales.count > 0 ? `$${todaySales.avgTicket.toFixed(0)}` : "—"}</p>
        </div>
        <div className="bg-amber-50 rounded-xl p-3 text-center">
          <p className="text-[10px] text-amber-600">Unidades</p>
          <p className="text-lg font-extrabold text-amber-700">{todaySales.units}</p>
        </div>
      </div>
      <div className="border-t border-gray-100 px-4 py-3 grid sm:grid-cols-2 gap-3">
        <div className="space-y-2">
          <p className="text-[10px] font-semibold text-gray-400 uppercase">Por método de pago</p>
          {todaySales.methods.filter((m) => m.count > 0).length === 0 ? (
            <p className="text-xs text-gray-400">Sin ventas registradas hoy.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {todaySales.methods.filter((m) => m.count > 0).map((m) => (
                <span key={m.key} className="text-[11px] bg-gray-50 border border-gray-100 rounded-lg px-2 py-1 text-gray-700">
                  {m.icon} {m.label}: <b>${m.revenue.toFixed(0)}</b> ({m.count})
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="space-y-2">
          <p className="text-[10px] font-semibold text-gray-400 uppercase">Hoy</p>
          <div className="flex flex-wrap gap-1.5">
            <span className="text-[11px] bg-gray-50 border border-gray-100 rounded-lg px-2 py-1 text-gray-700">
              Food cost real: <b>{todaySales.foodCost.toFixed(1)}%</b>
            </span>
            <span className="text-[11px] bg-gray-50 border border-gray-100 rounded-lg px-2 py-1 text-gray-700">
              Merma: <b>${todaySales.todayMerma.toFixed(0)}</b>
            </span>
            <span className="text-[11px] bg-gray-50 border border-gray-100 rounded-lg px-2 py-1 text-gray-700">
              {todaySales.count} registro{todaySales.count !== 1 ? "s" : ""}
            </span>
            <span className="text-[11px] bg-amber-50 border border-amber-100 rounded-lg px-2 py-1 text-amber-700">
              🎁 Puntos otorgados hoy: <b>{puntosHoy}</b>
            </span>
          </div>
        </div>
      </div>
      {goalProgress && goalProgress.goal > 0 && (
        <div className="border-t border-gray-100 px-4 py-3">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-semibold text-gray-400 uppercase flex items-center gap-1">
              <Target className="w-3.5 h-3.5 text-purple-600" />
              Meta del día
            </span>
            <span className={`text-xs font-bold ${goalProgress.pct >= 100 ? "text-green-600" : goalProgress.pct >= 50 ? "text-[#108910]" : "text-amber-600"}`}>
              ${todaySales.revenue.toFixed(0)} / ${goalProgress.goal.toFixed(0)} ({goalProgress.projected}%)
            </span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${goalProgress.pct >= 100 ? "bg-green-500" : goalProgress.pct >= 50 ? "bg-[#108910]" : "bg-amber-500"}`}
              style={{ width: `${Math.min(goalProgress.pct, 100)}%` }}
            />
          </div>
          <p className="text-[10px] text-gray-400 mt-1.5">
            {goalProgress.pct >= 100 ? "¡Meta cumplida! 🎉" : goalProgress.pct >= 50 ? `Vas al ${goalProgress.projected}% de tu meta del día.` : "Aún por debajo del 50% de tu meta."}
          </p>
        </div>
      )}
    </div>
  )
}
