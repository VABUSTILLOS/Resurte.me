"use client"

import { useCallback, useEffect, useState } from "react"
import { Download } from "lucide-react"
import { MetricWithDelta } from "./MetricDelta"
import { getAdminPeriodComparison, type PeriodComparison } from "../actions"
import {
  PERIOD_OPTIONS,
  metricsComparisonToCsv,
  type PeriodDays,
} from "@/lib/analytics-periods"
import { DEFAULT_TIMEZONE, dayKeyOf } from "@/lib/local-date"

function money(value: number): string {
  return `$${value.toLocaleString("es-MX", { maximumFractionDigits: 0 })}`
}

/**
 * Fase 14 — comparativa del periodo (7/30/90 días) contra el periodo
 * anterior de igual duración, con exportación CSV de las métricas.
 */
export function PeriodComparisonCard() {
  const [days, setDays] = useState<PeriodDays>(30)
  const [data, setData] = useState<PeriodComparison | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (d: PeriodDays) => {
    setError(null)
    try {
      setData(await getAdminPeriodComparison(d))
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar la comparativa")
    }
  }, [])

  useEffect(() => {
    // Diferido a microtask: ningún setState corre síncrono en el efecto.
    void Promise.resolve().then(() => load(days))
  }, [days, load])

  function exportCsv() {
    if (!data) return
    const csv = metricsComparisonToCsv([
      ["Pedidos", String(data.orders.current), String(data.orders.previous),
        data.orders.deltaPct === null ? "—" : `${data.orders.deltaPct > 0 ? "+" : ""}${data.orders.deltaPct}%`],
      ["Ingresos", money(data.revenue.current), money(data.revenue.previous),
        data.revenue.deltaPct === null ? "—" : `${data.revenue.deltaPct > 0 ? "+" : ""}${data.revenue.deltaPct}%`],
      ["Ticket promedio", money(data.avgTicket.current), money(data.avgTicket.previous),
        data.avgTicket.deltaPct === null ? "—" : `${data.avgTicket.deltaPct > 0 ? "+" : ""}${data.avgTicket.deltaPct}%`],
      ["Clientes nuevos", String(data.newCustomers), String(data.prevNewCustomers), "—"],
      ["Clientes recurrentes", String(data.recurringCustomers), String(data.prevRecurringCustomers), "—"],
    ])
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `comparativa-${data.days}d-${dayKeyOf(DEFAULT_TIMEZONE)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <section aria-label="Comparativa por periodo" className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-gray-900">Comparativa por periodo</h2>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-gray-200 overflow-hidden" role="group" aria-label="Periodo">
            {PERIOD_OPTIONS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDays(d)}
                aria-pressed={days === d}
                className={`px-2.5 py-1 text-xs font-semibold ${
                  days === d ? "bg-gray-900 text-white" : "bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                {d}d
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={exportCsv}
            disabled={!data}
            title="Exportar métricas en CSV"
            className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            CSV
          </button>
        </div>
      </div>

      {error ? (
        <div className="text-center py-6">
          <p className="text-sm text-red-700">{error}</p>
          <button
            type="button"
            onClick={() => void load(days)}
            className="mt-2 text-xs font-semibold text-gray-700 hover:underline"
          >
            Reintentar
          </button>
        </div>
      ) : !data ? (
        <div className="h-24 animate-pulse rounded-lg bg-gray-100" />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          <MetricWithDelta label="Pedidos" current={String(data.orders.current)} previous={String(data.orders.previous)} comp={data.orders} />
          <MetricWithDelta label="Ingresos" current={money(data.revenue.current)} previous={money(data.revenue.previous)} comp={data.revenue} />
          <MetricWithDelta label="Ticket promedio" current={money(data.avgTicket.current)} previous={money(data.avgTicket.previous)} comp={data.avgTicket} />
          <MetricWithDelta label="Clientes nuevos" current={String(data.newCustomers)} previous={String(data.prevNewCustomers)} />
          <MetricWithDelta label="Recurrentes" current={String(data.recurringCustomers)} previous={String(data.prevRecurringCustomers)} />
        </div>
      )}
      {data && (
        <p className="mt-3 text-[11px] text-gray-400">
          Últimos {data.days} días vs. los {data.days} días anteriores · ingresos y ticket solo cuentan pedidos pagados
        </p>
      )}
    </section>
  )
}
