"use client"

import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

import { formatMoney, formatNumber } from "@/lib/money"
import type { TrendPoint } from "@/lib/conversion-funnel"
import { describeTrend, shortDay } from "@/app/admin/conversion/trend-format"

/** Motivos por los que la serie no se puede dibujar (espeja la ruta). */
export type TrendUnavailable = "truncated" | "detailError" | null

const CREATED_COLOR = "#2563eb"
const PAID_COLOR = "#16a34a"

const TH = "py-1.5 pr-4 text-[11px] font-medium uppercase tracking-wide text-gray-600"
const TD = "py-1.5 pr-4 text-sm text-gray-700"
const TD_NUM = "py-1.5 pr-4 text-sm text-gray-700 text-right tabular-nums"

/**
 * Tendencia diaria del embudo.
 *
 * Se dibuja con los mismos pedidos que ya trae el reporte, así que no cuesta
 * una consulta extra; cuando ese detalle viene recortado la ruta apaga la serie
 * (`trendUnavailable`) en vez de graficar un crecimiento inventado, y aquí solo
 * queda explicar por qué.
 */
export function FunnelTrendChart({
  trend,
  unavailable,
}: {
  trend: TrendPoint[] | null
  unavailable: TrendUnavailable
}) {
  if (!trend || trend.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-900">Tendencia diaria</h2>
        <p className="mt-1 text-xs text-gray-500">
          {unavailable === "truncated"
            ? "No se dibuja: el período tiene más pedidos de los que se analizan uno por uno, y con un corte la gráfica mostraría un crecimiento que no ocurrió. Acorta el período para verla."
            : unavailable === "detailError"
              ? "No se pudo leer el detalle de pedidos, así que no hay tendencia que dibujar. El resto del reporte sigue siendo válido."
              : "Todavía no hay pedidos en el período."}
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-gray-900">Tendencia diaria</h2>
      <p className="mb-3 text-xs text-gray-500">
        Pedidos creados y pagados por día, en la fecha local del restaurante. Los días
        sin pedidos se dibujan en cero, no se omiten
        {trend.some((p) => p.partial)
          ? ", y el primer y/o el último día están incompletos por el corte de la ventana"
          : ""}
        .
      </p>
      <div
        role="img"
        aria-label={describeTrend(trend)}
        className="h-56 w-full motion-reduce:transition-none"
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={trend} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={shortDay}
              tick={{ fontSize: 11, fill: "#94a3b8" }}
              tickLine={false}
              axisLine={false}
              minTickGap={24}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fontSize: 11, fill: "#94a3b8" }}
              tickLine={false}
              axisLine={false}
              width={32}
            />
            <Tooltip
              labelFormatter={(label) => {
                const key = String(label ?? "")
                const partial = trend.find((p) => p.date === key)?.partial
                return partial ? `${shortDay(key)} (día incompleto)` : shortDay(key)
              }}
              formatter={(value, name) => [formatNumber(Number(value ?? 0)), String(name)]}
              contentStyle={{ fontSize: 12, borderRadius: 8, borderColor: "#e2e8f0" }}
            />
            <Area
              type="monotone"
              dataKey="created"
              name="Pedidos creados"
              stroke={CREATED_COLOR}
              fill={CREATED_COLOR}
              fillOpacity={0.08}
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="paid"
              name="Pagados"
              stroke={PAID_COLOR}
              strokeWidth={2}
              dot={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {/* Alternativa en texto: la gráfica no es la única forma de leer la serie.
          Plegada porque un período de 90 días son 90 filas. */}
      <details className="mt-3">
        <summary className="cursor-pointer text-xs font-medium text-brand-600">
          Ver los datos por día
        </summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full">
            <caption className="sr-only">
              Pedidos creados y pagados por día, con los ingresos cobrados.
            </caption>
            <thead>
              <tr className="border-b border-gray-100">
                <th scope="col" className={`${TH} text-left`}>Día</th>
                <th scope="col" className={`${TH} text-right`}>Creados</th>
                <th scope="col" className={`${TH} text-right`}>Pagados</th>
                <th scope="col" className={`${TH} text-right`}>Cobrado</th>
              </tr>
            </thead>
            <tbody>
              {trend.map((point) => (
                <tr key={point.date} className="border-b border-gray-50 last:border-0">
                  <td className={TD}>
                    {shortDay(point.date)}
                    {point.partial && (
                      <span className="ml-1 text-gray-600" title="Día incompleto">
                        *
                      </span>
                    )}
                  </td>
                  <td className={TD_NUM}>{formatNumber(point.created)}</td>
                  <td className={TD_NUM}>{formatNumber(point.paid)}</td>
                  <td className={TD_NUM}>{formatMoney(point.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  )
}
