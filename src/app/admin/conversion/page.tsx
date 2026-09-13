"use client"

import { useCallback, useEffect, useState } from "react"
import { TrendingUp, ShoppingCart, Mail, Zap, Package, Globe, Download, Repeat } from "lucide-react"
import { toCsv, downloadCsv } from "@/lib/csv"
import type { CohortRow } from "@/lib/admin-cohorts"

interface FunnelData {
  days: number
  funnel: {
    ordersCreated: number
    ordersPaid: number
    pendingAbandoned: number
    paidRate: number
  }
  bumpTakeRate: number | null
  upsellTakeRate: number | null
  recoveryByTouch: Record<string, number>
  utmBreakdown: Array<{ source: string; orders: number }> | null
}

const TOUCH_LABEL: Record<string, string> = {
  abandoned_cart: "Toque 1 (2h · recordatorio)",
  abandoned_cart_24h: "Toque 2 (24h · cupón)",
  abandoned_cart_48h: "Toque 3 (48h · último aviso)",
}

const pct = (v: number | null) => (v === null ? "—" : `${(v * 100).toFixed(1)}%`)

/**
 * /admin/conversion — funnel del carrito de alta conversión:
 * creados → pagados, take-rate de bumps/upsells, recuperación por toque
 * y desglose UTM. Métricas internas (BD), complementarias a GA4/Meta.
 */
export default function ConversionDashboardPage() {
  const [days, setDays] = useState(30)
  const [data, setData] = useState<FunnelData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [cohorts, setCohorts] = useState<CohortRow[] | null>(null)

  const fetchFunnel = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/funnel?days=${days}`)
      if (!res.ok) throw new Error("Error al cargar el funnel")
      setData((await res.json()) as FunnelData)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar el funnel")
    } finally {
      setLoading(false)
    }
  }, [days])

  useEffect(() => {
    // Diferido a microtask: ningún setState de fetchFunnel corre síncrono en el efecto.
    void Promise.resolve().then(fetchFunnel)
  }, [fetchFunnel])

  // Cohortes de recompra (independiente del funnel; best-effort).
  useEffect(() => {
    let cancelled = false
    fetch("/api/admin/cohorts?months=12", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((d: { cohorts?: CohortRow[] } | null) => {
        if (!cancelled && d?.cohorts) setCohorts(d.cohorts)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  // Exporta el funnel completo del período a CSV (resumen + toques + UTM).
  function exportCsv() {
    if (!data) return
    const csv = toCsv(
      ["Sección", "Métrica", "Valor"],
      [
        ["Resumen", "Período (días)", data.days],
        ["Resumen", "Pedidos creados", data.funnel.ordersCreated],
        ["Resumen", "Pedidos pagados", data.funnel.ordersPaid],
        ["Resumen", "Abandonados pendientes", data.funnel.pendingAbandoned],
        ["Resumen", "Tasa de pago", pct(data.funnel.paidRate)],
        ["Take-rates", "Order bumps", pct(data.bumpTakeRate)],
        ["Take-rates", "Upsells 1-click", pct(data.upsellTakeRate)],
        ...Object.entries(TOUCH_LABEL).map(
          ([type, label]): [string, string, number] => [
            "Recuperación",
            label,
            data.recoveryByTouch[type] ?? 0,
          ]
        ),
        ...(data.utmBreakdown ?? []).map(
          (row): [string, string, number] => ["UTM", row.source, row.orders]
        ),
      ]
    )
    downloadCsv(`funnel-conversion-${data.days}d.csv`, csv)
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-brand-600" />
          Funnel de conversión
        </h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={exportCsv}
            disabled={!data || loading}
            className="inline-flex items-center gap-1.5 text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="w-4 h-4" />
            Exportar CSV
          </button>
          <select
            value={days}
            onChange={(e) => {
              // El reset de loading/error va en el event handler, no en el efecto.
              setLoading(true)
              setError(null)
              setDays(Number(e.target.value))
            }}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white"
            aria-label="Período"
          >
            <option value={7}>Últimos 7 días</option>
            <option value={30}>Últimos 30 días</option>
            <option value={90}>Últimos 90 días</option>
          </select>
        </div>
      </div>

      {loading && <p className="text-sm text-gray-500">Cargando…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {data && !loading && (
        <>
          {/* Funnel principal */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <StatCard
              icon={ShoppingCart}
              label="Pedidos creados"
              value={String(data.funnel.ordersCreated)}
            />
            <StatCard
              icon={Package}
              label="Pagados"
              value={String(data.funnel.ordersPaid)}
            />
            <StatCard
              icon={TrendingUp}
              label="Tasa de pago"
              value={pct(data.funnel.paidRate)}
            />
            <StatCard
              icon={Mail}
              label="Abandonados pendientes"
              value={String(data.funnel.pendingAbandoned)}
            />
          </div>

          {/* Take-rates */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-900 mb-1">
                <Zap className="w-4 h-4 text-amber-500" />
                Take-rate de order bumps
              </div>
              <p className="text-2xl font-black text-gray-900">{pct(data.bumpTakeRate)}</p>
              <p className="text-xs text-gray-500 mt-1">
                % de pedidos pagados que incluyeron al menos un bump
              </p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-900 mb-1">
                <Zap className="w-4 h-4 text-brand-600" />
                Take-rate de upsells 1-click
              </div>
              <p className="text-2xl font-black text-gray-900">{pct(data.upsellTakeRate)}</p>
              <p className="text-xs text-gray-500 mt-1">
                % de pedidos pagados que aceptaron un upsell post-compra
              </p>
            </div>
          </div>

          {/* Recuperación por toque */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
            <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <Mail className="w-4 h-4 text-brand-600" />
              Emails de recuperación enviados
            </h2>
            <ul className="space-y-1.5 text-sm text-gray-600">
              {Object.entries(TOUCH_LABEL).map(([type, label]) => (
                <li key={type} className="flex justify-between">
                  <span>{label}</span>
                  <span className="font-semibold">{data.recoveryByTouch[type] ?? 0}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* UTM */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <Globe className="w-4 h-4 text-brand-600" />
              Pedidos pagados por fuente (UTM)
            </h2>
            {data.utmBreakdown === null ? (
              <p className="text-xs text-amber-600">
                Las columnas UTM aún no existen en la base de datos — aplica la
                migración 00061 para activar este reporte.
              </p>
            ) : data.utmBreakdown.length === 0 ? (
              <p className="text-xs text-gray-500">Sin pedidos pagados en el período.</p>
            ) : (
              <ul className="space-y-1.5 text-sm text-gray-600">
                {data.utmBreakdown.map((row) => (
                  <li key={row.source} className="flex justify-between">
                    <span className="truncate">{row.source}</span>
                    <span className="font-semibold">{row.orders}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {/* Cohortes de recompra */}
          {cohorts && cohorts.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-4 mt-6">
              <h2 className="text-sm font-semibold text-gray-900 mb-1 flex items-center gap-2">
                <Repeat className="w-4 h-4 text-brand-600" />
                Cohortes de recompra
              </h2>
              <p className="text-xs text-gray-500 mb-3">
                % de clientes de cada cohorte (mes de su primer pedido) que
                volvieron a comprar N meses después.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-gray-600">
                  <thead>
                    <tr className="text-left text-gray-400">
                      <th className="py-1 pr-4 font-medium">Cohorte</th>
                      <th className="py-1 pr-4 font-medium">Clientes</th>
                      {Array.from({ length: cohorts[0]?.retentions.length ?? 0 }, (_, i) => (
                        <th key={i} className="py-1 pr-3 font-medium text-right">
                          M+{i + 1}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {cohorts.map((c) => (
                      <tr key={c.month} className="border-t border-gray-100">
                        <td className="py-1 pr-4 font-medium text-gray-900">{c.month}</td>
                        <td className="py-1 pr-4">{c.size}</td>
                        {c.retentions.map((r, i) => (
                          <td key={i} className="py-1 pr-3 text-right">
                            {r === null ? "—" : `${r}%`}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof ShoppingCart
  label: string
  value: string
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
        <Icon className="w-4 h-4 text-brand-600" />
        {label}
      </div>
      <p className="text-2xl font-black text-gray-900">{value}</p>
    </div>
  )
}
