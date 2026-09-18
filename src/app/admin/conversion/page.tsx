"use client"

import { Suspense, useCallback, useEffect, useMemo, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import {
  AlertTriangle,
  ArrowRight,
  Download,
  Globe,
  Loader2,
  Mail,
  Repeat,
  RotateCcw,
  ShoppingCart,
  TrendingUp,
  Zap,
} from "lucide-react"
import { formatMoney, formatNumber } from "@/lib/money"
import { formatRate } from "@/lib/funnel-metrics"
import { isPeriodDays, PERIOD_OPTIONS, type PeriodDays } from "@/lib/analytics-periods"
import {
  conversionFunnelToCsv,
  type BreakdownDelta,
  type ConversionFunnel,
  type FunnelComparison,
  type MethodRow,
  type OutcomeRow,
  type RecoveryTouchRow,
  type TrendPoint,
  type UtmRow,
} from "@/lib/conversion-funnel"
import type { CohortRow } from "@/lib/admin-cohorts"
import { MetricWithDelta } from "@/app/admin/components/MetricDelta"
import {
  FunnelTrendChart,
  type TrendUnavailable,
} from "@/app/admin/conversion/funnel-trend-chart"

/**
 * Respuesta de `/api/admin/funnel`. Espeja `FunnelResponse` de la ruta: cada
 * sección puede venir vacía o `null` por su cuenta, y `degraded` dice cuál.
 */
interface FunnelData {
  days: PeriodDays
  since: string
  until: string
  generatedAt: string
  source: "rpc" | "fallback"
  funnel: ConversionFunnel | null
  outcomes: OutcomeRow[]
  methods: MethodRow[]
  utm: UtmRow[] | null
  recovery: RecoveryTouchRow[] | null
  comparison: FunnelComparison | null
  methodComparison: Record<string, BreakdownDelta> | null
  utmComparison: Record<string, BreakdownDelta> | null
  bumpTakeRate: number | null
  upsellTakeRate: number | null
  detailTruncated: boolean
  recoveryTruncated: boolean
  takeRateTruncated: boolean
  trend: TrendPoint[] | null
  trendUnavailable: TrendUnavailable
  degraded: string[]
}

const CARD = "rounded-xl border border-gray-200 bg-white p-4"
const TH =
  "py-1.5 pr-4 text-left text-[11px] font-medium uppercase tracking-wide text-gray-600"
const TD = "py-1.5 pr-4 text-sm text-gray-700"
const TD_NUM = "py-1.5 pr-4 text-sm text-gray-700 text-right tabular-nums"

const SECTION_LABEL: Record<string, string> = {
  funnel: "el embudo",
  outcomes: "el desglose por desenlace",
  methods: "el desglose por método de pago",
  utm: "el desglose por origen",
  recovery: "la recuperación por toque",
  comparison: "la comparación con el periodo anterior",
  bumpTakeRate: "el take-rate de order bumps",
  upsellTakeRate: "el take-rate de upsells",
}

/**
 * Enlace de profundización de cada desenlace a la lista de pedidos.
 *
 * Los cuatro desenlaces son expresables con los filtros reales de
 * `/admin/pedidos`: `paid` y `failed` por `payment_status`, `pending` (el
 * abandono) por `status` + `payment_status`, y `cancelled` por `status`. El
 * quinto, "sin clasificar", no tiene consulta equivalente — se queda sin
 * enlace en vez de mandar a una lista que no lo contiene.
 */
function drillHref(key: OutcomeRow["key"]): string | null {
  switch (key) {
    case "paid":
      return "/admin/pedidos?payment_status=paid"
    case "failed":
      return "/admin/pedidos?payment_status=failed"
    case "pending":
      return "/admin/pedidos?status=pending&payment_status=pending"
    case "cancelled":
      return "/admin/pedidos?status=cancelled"
    default:
      return null
  }
}

/** El desenlace "pago fallido" sube cuando empeora: su delta se pinta al revés. */
const BAD_WHEN_UP: OutcomeRow["key"][] = ["failed", "pending", "cancelled", "other"]

const timeOf = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })
}

const dayOf = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("es-MX", { day: "numeric", month: "short" })
}

/**
 * /admin/conversion — embudo del carrito de alta conversión.
 *
 * Mide creados → pagados sobre los pedidos reales (no sobre GA4 ni Meta), con
 * el desglose por desenlace, método de pago y origen UTM, la recuperación por
 * toque y el take-rate de bumps y upsells 1-click.
 *
 * Dos invariantes del panel se cumplen aquí: **una tasa sin denominador es
 * `null`** ("No medido"), nunca `0%`, y **ninguna sección tumba la página** —
 * cada una que falla se anuncia arriba en vez de dejar la pantalla en blanco.
 */
export default function ConversionDashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-24 text-sm text-gray-600">
          <Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" />
          Cargando el embudo de conversión...
        </div>
      }
    >
      <ConversionContent />
    </Suspense>
  )
}

function ConversionContent() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // El período vive en la URL: un enlace del dashboard puede aterrizar en
  // "últimos 90 días" sin pasar por el selector.
  const initialDays = useMemo(() => {
    const raw = Number(searchParams.get("days"))
    return isPeriodDays(raw) ? raw : 30
  }, [searchParams])

  const [days, setDays] = useState<PeriodDays>(initialDays)
  const [data, setData] = useState<FunnelData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [cohorts, setCohorts] = useState<CohortRow[] | null>(null)

  const fetchFunnel = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/funnel?days=${days}`, { cache: "no-store" })
      if (!res.ok) throw new Error("Error al cargar el funnel")
      setData((await res.json()) as FunnelData)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar el funnel")
    } finally {
      setLoading(false)
    }
  }, [days])

  useEffect(() => {
    // Diferido a microtask: ningún setState de fetchFunnel corre síncrono en el efecto.
    // `reloadKey` vive aquí, no en fetchFunnel: el botón de reintento solo pide
    // repetir la misma consulta, no cambia lo que se consulta.
    void Promise.resolve().then(fetchFunnel)
  }, [fetchFunnel, reloadKey])

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

  function changeDays(next: PeriodDays) {
    // El reset de loading/error va en el event handler, no en el efecto.
    setLoading(true)
    setError(null)
    setDays(next)
    const qs = new URLSearchParams(searchParams.toString())
    qs.set("days", String(next))
    router.replace(`${pathname}?${qs.toString()}`, { scroll: false })
  }

  function exportCsv() {
    if (!data?.funnel) return
    const csv = conversionFunnelToCsv({
      days: data.days,
      funnel: data.funnel,
      outcomes: data.outcomes,
      methods: data.methods,
      recovery: data.recovery ?? [],
      utm: data.utm,
    })
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `funnel-conversion-${data.days}d.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const funnel = data?.funnel ?? null
  const comp = data?.comparison ?? null
  const degraded = data?.degraded ?? []
  const outcomesWithDelta = data?.outcomes ?? []
  const methodDeltas = data?.methodComparison ?? null
  const utmDeltas = data?.utmComparison ?? null

  // Un tope de filas no es una sección caída: el número existe, solo puede
  // quedar corto. Se declara aparte para que el aviso no dependa de `degraded`
  // (antes, un corte sin ninguna sección degradada no se anunciaba).
  const truncationNotes: string[] = []
  if (data?.detailTruncated) {
    truncationNotes.push(
      "Hay más pedidos de los que se pueden analizar uno por uno, así que la recuperación y el take-rate pueden quedar cortos."
    )
  }
  if (data?.recoveryTruncated) {
    truncationNotes.push(
      "Se enviaron más correos de recuperación de los que caben en una consulta: la tasa por toque puede quedar corta."
    )
  }
  if (data?.takeRateTruncated) {
    truncationNotes.push(
      "Los pedidos pagados superan el tope de la consulta: el take-rate se mide sobre los más recientes."
    )
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900">
            <TrendingUp className="h-5 w-5 text-brand-600" />
            Funnel de conversión
          </h1>
          {data && (
            <p className="mt-1 text-xs text-gray-500">
              {dayOf(data.since)} – {dayOf(data.until)} · actualizado a las{" "}
              {timeOf(data.generatedAt)}
              {data.source === "fallback" && (
                <span className="ml-2 rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700">
                  agregado en la app
                </span>
              )}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={exportCsv}
            disabled={!funnel || loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-600 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            Exportar CSV
          </button>
          <select
            value={days}
            onChange={(e) => changeDays(Number(e.target.value) as PeriodDays)}
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm"
            aria-label="Período"
          >
            {PERIOD_OPTIONS.map((d) => (
              <option key={d} value={d}>
                Últimos {d} días
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Estado de carga anunciado: el lector de pantalla sabe que algo viene. */}
      <p role="status" aria-live="polite" className="sr-only">
        {loading ? "Cargando el embudo de conversión" : error ? "" : "Embudo cargado"}
      </p>

      {loading && !data && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5" aria-hidden="true">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg bg-gray-100" />
          ))}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
          <AlertTriangle className="h-4 w-4 shrink-0 text-red-700" />
          <p className="flex-1 text-sm text-red-700">{error}</p>
          <button
            type="button"
            onClick={() => {
              setLoading(true)
              setError(null)
              setReloadKey((k) => k + 1)
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reintentar
          </button>
        </div>
      )}

      {data && !loading && (
        <>
          {(degraded.length > 0 || truncationNotes.length > 0) && (
            <div
              role="status"
              className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800"
            >
              {degraded.length > 0 && (
                <p>
                  <span className="font-semibold">Reporte incompleto:</span>{" "}
                  {degraded.map((d) => SECTION_LABEL[d] ?? d).join(", ")}. El resto del
                  embudo sigue siendo válido.
                </p>
              )}
              {truncationNotes.length > 0 && (
                <div className={degraded.length > 0 ? "mt-2" : undefined}>
                  <span className="font-semibold">Muestra recortada:</span>
                  <ul className="mt-0.5 list-disc space-y-0.5 pl-4">
                    {truncationNotes.map((note) => (
                      <li key={note}>{note}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {funnel && !funnel.reconciled && (
            <div
              role="alert"
              className="mb-6 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800"
            >
              <span className="font-semibold">Los desenlaces no cuadran:</span> se
              contaron {funnel.created} pedidos pero solo {funnel.classified} se pudieron
              clasificar. Un pedido con un estado desconocido no aparece en el desglose.
            </div>
          )}

          {/* Embudo principal */}
          {funnel && (
            <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
              <div className={CARD}>
                <MetricWithDelta
                  label="Pedidos creados"
                  current={formatNumber(funnel.created)}
                  previous={comp ? formatNumber(comp.created.previous) : undefined}
                  comp={comp?.created}
                />
              </div>
              <div className={CARD}>
                <MetricWithDelta
                  label="Pagados"
                  current={formatNumber(funnel.paid)}
                  previous={comp ? formatNumber(comp.paid.previous) : undefined}
                  comp={comp?.paid}
                />
              </div>
              <div className={CARD}>
                <MetricWithDelta
                  label="Tasa de pago"
                  current={formatRate(funnel.paidRate)}
                  previous={comp?.previous ? formatRate(comp.previous.paidRate) : undefined}
                  comp={
                    comp
                      ? { deltaPct: comp.paidRateDeltaPp, direction: deltaDirection(comp.paidRateDeltaPp) }
                      : undefined
                  }
                  unit="pp"
                />
              </div>
              <div className={CARD}>
                <MetricWithDelta
                  label="Ingresos cobrados"
                  current={formatMoney(funnel.revenue)}
                  previous={comp ? formatMoney(comp.revenue.previous) : undefined}
                  comp={comp?.revenue}
                />
              </div>
              <div className={CARD}>
                <MetricWithDelta
                  label="Ticket promedio"
                  current={funnel.avgTicket === null ? "No medido" : formatMoney(funnel.avgTicket)}
                  previous={comp?.avgTicket ? formatMoney(comp.avgTicket.previous) : undefined}
                  comp={comp?.avgTicket ?? undefined}
                />
              </div>
            </div>
          )}

          {/* Tendencia diaria: sale del mismo detalle de pedidos, sin consulta
              extra. Se dibuja si hay serie o si hay motivo para no tenerla;
              si la clave falta por completo (respuesta vieja en caché) no se
              inventa una gráfica vacía. */}
          {(data.trend != null || data.trendUnavailable != null) && (
            <div className="mb-6">
              <FunnelTrendChart
                trend={data.trend ?? null}
                unavailable={data.trendUnavailable ?? null}
              />
            </div>
          )}

          {/* Desglose por desenlace */}
          {outcomesWithDelta.length > 0 && (
            <div className={`${CARD} mb-6`}>
              <h2 className="mb-1 text-sm font-semibold text-gray-900">
                Desglose por desenlace
              </h2>
              <p className="mb-3 text-xs text-gray-500">
                Cada pedido cae en un solo desenlace. El importe de los desenlaces que
                no se cobraron es valor que no entró, no ingreso perdido contable.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <caption className="sr-only">
                    Pedidos del período agrupados por desenlace, con su participación
                    sobre el total, su importe y un enlace a la lista filtrada.
                  </caption>
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th scope="col" className={TH}>Desenlace</th>
                      <th scope="col" className={`${TH} text-right`}>Pedidos</th>
                      <th scope="col" className={`${TH} text-right`}>% del total</th>
                      <th scope="col" className={`${TH} text-right`}>Importe</th>
                      <th scope="col" className={`${TH} text-right`}>
                        <span className="sr-only">Ver pedidos</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {outcomesWithDelta.map((row) => {
                      const href = drillHref(row.key)
                      const delta = comp ? comp[row.key as "paid"] : undefined
                      return (
                        <tr key={row.key} className="border-b border-gray-50 last:border-0">
                          <td className={TD}>
                            <span className="font-medium text-gray-900">{row.label}</span>
                            <span className="block text-[11px] text-gray-600">
                              {row.description}
                            </span>
                          </td>
                          <td className={TD_NUM}>
                            <span className="font-semibold">{formatNumber(row.count)}</span>
                            {delta && (
                              <span className="ml-2 inline-block">
                                <DeltaInline
                                  deltaPct={delta.deltaPct}
                                  direction={delta.direction}
                                  goodDirection={
                                    BAD_WHEN_UP.includes(row.key) ? "down" : "up"
                                  }
                                />
                              </span>
                            )}
                          </td>
                          <td className={TD_NUM}>{formatRate(row.share)}</td>
                          <td className={TD_NUM}>{formatMoney(row.amount)}</td>
                          <td className={`${TD_NUM}`}>
                            {href && (
                              <a
                                href={href}
                                className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline"
                              >
                                Ver pedidos
                                <ArrowRight className="h-3 w-3" aria-hidden="true" />
                              </a>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Desglose por método de pago */}
          {data.methods.length > 0 && (
            <div className={`${CARD} mb-6`}>
              <h2 className="mb-1 text-sm font-semibold text-gray-900">
                Desglose por método de pago
              </h2>
              <p className="mb-3 text-xs text-gray-500">
                Explica de dónde viene el abandono: con tarjeta es un problema que se
                puede arreglar, con un método asíncrono es el flujo normal mientras el
                cliente paga en efectivo. La variación va contra el periodo anterior de
                igual duración; un método que no existía antes se marca "sin base".
              </p>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <caption className="sr-only">
                    Pedidos del período por método de pago, con tasa de pago, ingresos y
                    la variación contra el periodo anterior.
                  </caption>
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th scope="col" className={TH}>Método</th>
                      <th scope="col" className={`${TH} text-right`}>Creados</th>
                      <th scope="col" className={`${TH} text-right`}>Pagados</th>
                      <th scope="col" className={`${TH} text-right`}>Fallidos</th>
                      <th scope="col" className={`${TH} text-right`}>Tasa de pago</th>
                      <th scope="col" className={`${TH} text-right`}>Ingresos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.methods.map((m) => {
                      const delta = methodDeltas?.[m.method]
                      return (
                        <tr key={m.method} className="border-b border-gray-50 last:border-0">
                          <td className={TD}>
                            <span className="font-medium text-gray-900">{m.label}</span>
                            {m.async && (
                              <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-600">
                                asíncrono
                              </span>
                            )}
                          </td>
                          <td className={TD_NUM}>
                            {formatNumber(m.created)}
                            {delta && (
                              <span className="ml-2 inline-block">
                                <DeltaInline
                                  deltaPct={delta.created.deltaPct}
                                  direction={delta.created.direction}
                                  goodDirection="up"
                                />
                              </span>
                            )}
                          </td>
                          <td className={TD_NUM}>{formatNumber(m.paid)}</td>
                          <td className={TD_NUM}>{formatNumber(m.failed)}</td>
                          <td className={TD_NUM}>
                            {formatRate(m.paidRate)}
                            {delta && (
                              <span className="ml-2 inline-block">
                                <DeltaInline
                                  deltaPct={delta.paidRateDeltaPp}
                                  direction={deltaDirection(delta.paidRateDeltaPp)}
                                  goodDirection="up"
                                  unit="pp"
                                />
                              </span>
                            )}
                          </td>
                          <td className={TD_NUM}>{formatMoney(m.revenue)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Recuperación por toque */}
          <div className={`${CARD} mb-6`}>
            <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-gray-900">
              <Mail className="h-4 w-4 text-brand-600" />
              Recuperación por toque
            </h2>
            <p className="mb-3 text-xs text-gray-500">
              Mide <strong>correlación, no causalidad</strong>: cuenta los pedidos que
              recibieron un toque y acabaron pagados. Un pedido así pudo pagar por el
              correo o por su cuenta, y este reporte no puede distinguirlo.
            </p>
            {data.recovery === null ? (
              <p className="text-xs text-amber-700">
                No se pudieron leer los correos de recuperación en este momento.
              </p>
            ) : data.recovery.every((r) => r.sent === 0) ? (
              <p className="text-xs text-gray-500">
                La secuencia de recuperación no envió ningún correo en este período.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <caption className="sr-only">
                    Correos de recuperación enviados por toque, con los pedidos
                    contactados, los que acabaron pagados y los ingresos de esos pedidos.
                  </caption>
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th scope="col" className={TH}>Toque</th>
                      <th scope="col" className={`${TH} text-right`}>Enviados</th>
                      <th scope="col" className={`${TH} text-right`}>Pedidos contactados</th>
                      <th scope="col" className={`${TH} text-right`}>
                        De esos, pagados
                      </th>
                      <th scope="col" className={`${TH} text-right`}>Tasa</th>
                      <th scope="col" className={`${TH} text-right`}>Ingresos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recovery.map((r) => (
                      <tr key={r.type} className="border-b border-gray-50 last:border-0">
                        <td className={TD}>{r.label}</td>
                        <td className={TD_NUM}>{formatNumber(r.sent)}</td>
                        <td className={TD_NUM}>{formatNumber(r.contacted)}</td>
                        <td className={TD_NUM}>{formatNumber(r.recoveredOrders)}</td>
                        <td className={TD_NUM}>{formatRate(r.rate)}</td>
                        <td className={TD_NUM}>{formatMoney(r.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Origen UTM */}
          <div className={`${CARD} mb-6`}>
            <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-gray-900">
              <Globe className="h-4 w-4 text-brand-600" />
              Origen de los pedidos (UTM)
            </h2>
            <p className="mb-3 text-xs text-gray-500">
              Ordenado por ingresos, no por volumen: responde qué canal convierte, no
              qué canal manda más pedidos. La variación compara contra el periodo
              anterior; como solo se listan los diez orígenes con más ingresos, un
              origen que no estaba en esa lista se marca "sin base" en vez de suponer
              que no tuvo pedidos.
            </p>
            {data.utm === null ? (
              <p className="text-xs text-amber-700">
                La columna UTM no existe en la base desplegada, así que la atribución no
                se puede medir. No es lo mismo que "todo vino directo".
              </p>
            ) : data.utm.length === 0 ? (
              <p className="text-xs text-gray-500">Sin pedidos en el período.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <caption className="sr-only">
                    Pedidos del período agrupados por origen UTM, con tasa de pago,
                    ingresos y la variación contra el periodo anterior.
                  </caption>
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th scope="col" className={TH}>Origen</th>
                      <th scope="col" className={`${TH} text-right`}>Creados</th>
                      <th scope="col" className={`${TH} text-right`}>Pagados</th>
                      <th scope="col" className={`${TH} text-right`}>Tasa de pago</th>
                      <th scope="col" className={`${TH} text-right`}>Ingresos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.utm.map((u) => {
                      const delta = utmDeltas?.[u.source]
                      return (
                        <tr key={u.source} className="border-b border-gray-50 last:border-0">
                          <td className={`${TD} max-w-[16rem] truncate`} title={u.source}>
                            {u.source}
                          </td>
                          <td className={TD_NUM}>
                            {formatNumber(u.created)}
                            {delta && (
                              <span className="ml-2 inline-block">
                                <DeltaInline
                                  deltaPct={delta.created.deltaPct}
                                  direction={delta.created.direction}
                                  goodDirection="up"
                                />
                              </span>
                            )}
                          </td>
                          <td className={TD_NUM}>{formatNumber(u.paid)}</td>
                          <td className={TD_NUM}>
                            {formatRate(u.paidRate)}
                            {delta && (
                              <span className="ml-2 inline-block">
                                <DeltaInline
                                  deltaPct={delta.paidRateDeltaPp}
                                  direction={deltaDirection(delta.paidRateDeltaPp)}
                                  goodDirection="up"
                                  unit="pp"
                                />
                              </span>
                            )}
                          </td>
                          <td className={TD_NUM}>{formatMoney(u.revenue)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Take-rates */}
          <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-2">
            <TakeRateCard
              icon={Zap}
              color="text-amber-700"
              title="Take-rate de order bumps"
              value={data.bumpTakeRate}
              hint="% de pedidos pagados que incluyeron al menos un bump"
              degraded={degraded.includes("bumpTakeRate")}
            />
            <TakeRateCard
              icon={Zap}
              color="text-brand-600"
              title="Take-rate de upsells 1-click"
              value={data.upsellTakeRate}
              hint="% de pedidos pagados que aceptaron un upsell post-compra"
              degraded={degraded.includes("upsellTakeRate")}
            />
          </div>

          {/* Cohortes de recompra */}
          {cohorts && cohorts.length > 0 && (
            <div className={CARD}>
              <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-gray-900">
                <Repeat className="h-4 w-4 text-brand-600" />
                Cohortes de recompra
              </h2>
              <p className="mb-3 text-xs text-gray-500">
                % de clientes de cada cohorte (mes de su primer pedido) que volvieron a
                comprar N meses después.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-gray-600">
                  <caption className="sr-only">
                    Retención de recompra por cohorte mensual.
                  </caption>
                  <thead>
                    <tr className="text-left text-gray-600">
                      <th scope="col" className="py-1 pr-4 font-medium">Cohorte</th>
                      <th scope="col" className="py-1 pr-4 font-medium">Clientes</th>
                      {Array.from({ length: cohorts[0]?.retentions.length ?? 0 }, (_, i) => (
                        <th key={i} scope="col" className="py-1 pr-3 text-right font-medium">
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
                          <td key={i} className="py-1 pr-3 text-right tabular-nums">
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

function TakeRateCard({
  icon: Icon,
  color,
  title,
  value,
  hint,
  degraded,
}: {
  icon: typeof ShoppingCart
  color: string
  title: string
  value: number | null
  hint: string
  degraded: boolean
}) {
  return (
    <div className={CARD}>
      <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-gray-900">
        <Icon className={`h-4 w-4 ${color}`} />
        {title}
      </div>
      <p className="text-2xl font-black text-gray-900">
        {degraded ? "No medido" : formatRate(value === null ? null : Math.round(value * 100))}
      </p>
      <p className="mt-1 text-xs text-gray-500">
        {degraded ? "La fuente no está disponible en este momento." : hint}
      </p>
    </div>
  )
}

/** Chip de variación en línea, para celdas de tabla. */
function DeltaInline({
  deltaPct,
  direction,
  goodDirection,
  unit = "%",
}: {
  deltaPct: number | null
  direction: "up" | "down" | "flat"
  goodDirection: "up" | "down"
  /** Un conteo se compara en `%`; una tasa, en puntos porcentuales. */
  unit?: "%" | "pp"
}) {
  if (deltaPct === null) return <span className="text-[11px] text-gray-600">sin base</span>
  const good = direction !== "flat" && direction === goodDirection
  const bad = direction !== "flat" && direction !== goodDirection
  return (
    <span
      className={`text-[11px] font-semibold ${
        good ? "text-green-700" : bad ? "text-red-700" : "text-gray-500"
      }`}
    >
      {deltaPct > 0 ? "+" : ""}
      {deltaPct}
      {unit}
    </span>
  )
}

function deltaDirection(deltaPct: number | null): "up" | "down" | "flat" {
  if (deltaPct === null || deltaPct === 0) return "flat"
  return deltaPct > 0 ? "up" : "down"
}
