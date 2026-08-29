"use client"

import { useCallback, useEffect, useState } from "react"
import { TrendingUp, ShoppingCart, Mail, Zap, Package, Globe } from "lucide-react"

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

  const fetchFunnel = useCallback(async () => {
    setLoading(true)
    setError(null)
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
    void fetchFunnel()
  }, [fetchFunnel])

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-brand-600" />
          Funnel de conversión
        </h1>
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white"
          aria-label="Período"
        >
          <option value={7}>Últimos 7 días</option>
          <option value={30}>Últimos 30 días</option>
          <option value={90}>Últimos 90 días</option>
        </select>
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
