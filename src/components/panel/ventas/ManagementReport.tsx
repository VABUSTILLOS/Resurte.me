"use client"

import { BarChart3, Copy } from "lucide-react"
import type { Comparison, ReportChannelRow, ReportMethodRow, ReportStats, TopSeller } from "./ventas-shared"

type ReportPeriod = "hoy" | "7d" | "30d"

interface ManagementReportProps {
  reportPeriod: ReportPeriod
  reportStats: ReportStats
  reportEntries: unknown[]
  reportMethods: ReportMethodRow[]
  reportChannels: ReportChannelRow[]
  reportTop: TopSeller[]
  comparison: Comparison
  tipoCambio: number
  onPeriodChange: (p: ReportPeriod) => void
  onCopy: () => void
}

export default function ManagementReport({
  reportPeriod,
  reportStats,
  reportEntries,
  reportMethods,
  reportChannels,
  reportTop,
  comparison,
  tipoCambio,
  onPeriodChange,
  onCopy,
}: ManagementReportProps) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-6">
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <BarChart3 className="w-4 h-4 text-purple-600" />
        <h3 className="text-sm font-semibold text-gray-900">Reporte gerencial</h3>
        <div className="flex items-center gap-1 ml-auto">
          {(["hoy", "7d", "30d"] as const).map((p) => (
            <button
              key={p}
              onClick={() => onPeriodChange(p)}
              className={`px-3 py-1 text-[10px] font-semibold rounded-lg transition-colors ${
                reportPeriod === p ? "bg-purple-600 text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              }`}
            >
              {p === "hoy" ? "Hoy" : p === "7d" ? "7 días" : "30 días"}
            </button>
          ))}
          <button
            onClick={onCopy}
            disabled={reportEntries.length === 0}
            title="Copiar reporte gerencial del período"
            aria-label="Copiar reporte gerencial"
            className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Copy className="w-3.5 h-3.5" />
            Copiar reporte
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
        <div className="bg-gray-50 rounded-xl p-3 text-center">
          <p className="text-[10px] text-gray-500 mb-1">Ingresos</p>
          <p className="text-lg font-extrabold text-[#108910]">${reportStats.revenue.toFixed(0)}</p>
          <p className="text-[10px] text-gray-400">{reportStats.orders} ticket{reportStats.orders !== 1 ? "s" : ""}</p>
          {tipoCambio !== 1 && <p className="text-[10px] text-gray-300 font-semibold">≈ ${(reportStats.revenue / tipoCambio).toFixed(2)} USD</p>}
        </div>
        <div className="bg-gray-50 rounded-xl p-3 text-center">
          <p className="text-[10px] text-gray-500 mb-1">Costo de venta</p>
          <p className="text-lg font-extrabold text-gray-800">${reportStats.cost.toFixed(0)}</p>
          <p className="text-[10px] text-gray-400">{reportStats.units} platillos</p>
        </div>
        <div className="bg-gray-50 rounded-xl p-3 text-center">
          <p className="text-[10px] text-gray-500 mb-1">Margen bruto</p>
          <p className="text-lg font-extrabold text-gray-800">${reportStats.margin.toFixed(0)}</p>
          <p className="text-[10px] text-gray-400">ingresos − costo</p>
        </div>
        <div className="bg-gray-50 rounded-xl p-3 text-center">
          <p className="text-[10px] text-gray-500 mb-1">Food cost</p>
          <p className="text-lg font-extrabold text-gray-800">{reportStats.foodCost.toFixed(1)}%</p>
          <p className="text-[10px] text-gray-400">costo / ingresos</p>
        </div>
        <div className="bg-gray-50 rounded-xl p-3 text-center">
          <p className="text-[10px] text-gray-500 mb-1">Ticket promedio</p>
          <p className="text-lg font-extrabold text-gray-800">${reportStats.avgTicket.toFixed(0)}</p>
          <p className="text-[10px] text-gray-400">{reportStats.orders > 0 ? "por ticket" : "sin ventas"}</p>
        </div>
        <div className="bg-gray-50 rounded-xl p-3 text-center">
          <p className="text-[10px] text-gray-500 mb-1">Descuentos</p>
          <p className="text-lg font-extrabold text-red-600">-${reportStats.discount.toFixed(0)}</p>
          <p className="text-[10px] text-gray-400">otorgados</p>
        </div>
      </div>

      {(reportEntries.length > 0 || comparison.prev.orders > 0) && (
        <div className="grid sm:grid-cols-3 gap-3 mb-4">
          {[
            { label: "Ingresos", cur: comparison.cur.revenue, prev: comparison.prev.revenue, delta: comparison.revenueDelta },
            { label: "Tickets", cur: comparison.cur.orders, prev: comparison.prev.orders, delta: comparison.ordersDelta },
            { label: "Ticket promedio", cur: comparison.cur.avgTicket, prev: comparison.prev.avgTicket, delta: comparison.avgDelta },
          ].map((x) => (
            <div key={x.label} className="bg-gray-50 rounded-xl p-3 text-center border border-dashed border-gray-200">
              <p className="text-[10px] text-gray-500 mb-1">vs período anterior — {x.label}</p>
              <p className="text-sm font-extrabold text-gray-800">{x.label === "Tickets" ? x.cur : `$${x.cur.toFixed(0)}`}</p>
              <p className={`text-[10px] font-bold ${x.delta >= 0 ? "text-green-600" : "text-red-600"}`}>
                {x.delta >= 0 ? "↑" : "↓"} {Math.abs(x.delta).toFixed(0)}%
                <span className="text-gray-400 font-medium"> · prev {x.label === "Tickets" ? x.prev : `$${x.prev.toFixed(0)}`}</span>
              </p>
            </div>
          ))}
        </div>
      )}

      {reportEntries.length === 0 ? (
        <p className="text-xs text-gray-400">Sin ventas en este período.</p>
      ) : (
        <div className="grid sm:grid-cols-3 gap-4 text-xs">
          <div className="bg-gray-50 rounded-xl p-3">
            <p className="text-[10px] text-gray-500 font-semibold mb-2">Por método de pago</p>
            <div className="space-y-1.5">
              {reportMethods.length === 0 ? (
                <p className="text-gray-400">—</p>
              ) : reportMethods.map((m) => (
                <div key={m.key} className="flex items-center justify-between gap-2">
                  <span className="text-gray-600">{m.icon} {m.label}</span>
                  <span className="font-semibold text-gray-800">${m.revenue.toFixed(0)}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-gray-50 rounded-xl p-3">
            <p className="text-[10px] text-gray-500 font-semibold mb-2">Por canal</p>
            <div className="space-y-1.5">
              {reportChannels.length === 0 ? (
                <p className="text-gray-400">—</p>
              ) : reportChannels.map((c) => (
                <div key={c.key} className="flex items-center justify-between gap-2">
                  <span className="text-gray-600">{c.icon} {c.label}</span>
                  <span className="font-semibold text-gray-800">${c.revenue.toFixed(0)}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-gray-50 rounded-xl p-3">
            <p className="text-[10px] text-gray-500 font-semibold mb-2">Top productos</p>
            <div className="space-y-1.5">
              {reportTop.length === 0 ? (
                <p className="text-gray-400">—</p>
              ) : reportTop.map((t, i) => (
                <div key={t.name} className="flex items-center justify-between gap-2">
                  <span className="text-gray-600 truncate">{i + 1}. {t.name}</span>
                  <span className="font-semibold text-gray-800 shrink-0">{t.qty} pz</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
