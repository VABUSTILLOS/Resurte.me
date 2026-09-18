"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import {
  AlertTriangle,
  ArrowUpRight,
  Check,
  Lightbulb,
  Loader2,
  Minus,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from "lucide-react"
import { getAdminCityPerformance, type AdminCityPerformance } from "../actions"
import type { CityTier } from "@/lib/admin-city-performance"
import { PERIOD_OPTIONS, type PeriodDays } from "@/lib/analytics-periods"

function money(value: number): string {
  return `$${value.toLocaleString("es-MX", { maximumFractionDigits: 0 })}`
}

const TIER_META: Record<CityTier, { label: string; className: string }> = {
  top: { label: "Destacada", className: "bg-green-100 text-green-800" },
  estable: { label: "Estable", className: "bg-blue-100 text-blue-800" },
  atencion: { label: "Atención", className: "bg-amber-100 text-amber-900" },
  sin_pedidos: { label: "Sin pedidos", className: "bg-gray-100 text-gray-600" },
}

function TierBadge({ tier }: { tier: CityTier }) {
  const meta = TIER_META[tier]
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${meta.className}`}>
      {meta.label}
    </span>
  )
}

/** Barra de score en CSS puro: sin recharts y legible por lectores de pantalla. */
function ScoreBar({ score }: { score: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-gray-100" aria-hidden="true">
        <div
          className={`h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none ${
            score >= 70 ? "bg-green-700" : score >= 45 ? "bg-blue-500" : "bg-amber-700"
          }`}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className="text-xs font-semibold tabular-nums text-gray-900">{score}</span>
    </div>
  )
}

function Delta({ value }: { value: number | null }) {
  if (value === null) {
    return <span className="text-[11px] text-gray-400">sin base</span>
  }
  const Icon = value > 0 ? TrendingUp : value < 0 ? TrendingDown : Minus
  const color = value > 0 ? "text-green-700" : value < 0 ? "text-red-700" : "text-gray-500"
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold ${color}`}>
      <Icon className="h-3 w-3" aria-hidden="true" />
      {value > 0 ? "+" : ""}
      {value}%
    </span>
  )
}

interface TipState {
  loading: boolean
  text?: string
  error?: string
}

/**
 * Fase 44 — Desempeño de cada ciudad. Rankea las ciudades por un score compuesto,
 * separa las que no vendieron y traduce cada debilidad en tips accionables
 * (reglas deterministas + un tip de IA opcional bajo demanda).
 */
export function CityPerformance() {
  const [days, setDays] = useState<PeriodDays>(30)
  const [data, setData] = useState<AdminCityPerformance | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tips, setTips] = useState<Record<number, TipState>>({})

  const load = useCallback(async (d: PeriodDays) => {
    setError(null)
    try {
      setData(await getAdminCityPerformance(d))
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar el desempeño por ciudad")
    }
  }, [])

  useEffect(() => {
    // Diferido a microtask: ningún setState corre síncrono en el efecto.
    void Promise.resolve().then(() => load(days))
  }, [days, load])

  const requestTip = useCallback(
    async (cityId: number) => {
      setTips((prev) => ({ ...prev, [cityId]: { loading: true } }))
      try {
        const res = await fetch("/api/admin/city-performance/tip", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ cityId, days }),
        })
        const body = (await res.json().catch(() => null)) as { tip?: string; error?: string } | null
        if (!res.ok) {
          setTips((prev) => ({
            ...prev,
            [cityId]: {
              loading: false,
              error:
                res.status === 503
                  ? "La IA no está configurada (falta KIE_AI_API_KEY)."
                  : body?.error ?? "No se pudo generar el tip.",
            },
          }))
          return
        }
        setTips((prev) => ({ ...prev, [cityId]: { loading: false, text: body?.tip ?? "" } }))
      } catch {
        setTips((prev) => ({
          ...prev,
          [cityId]: { loading: false, error: "No se pudo generar el tip." },
        }))
      }
    },
    [days]
  )

  const best = data?.cities[0]
  const worst = data?.needsAttention[0]

  return (
    <section aria-label="Desempeño de cada ciudad" className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold text-gray-900">Desempeño de cada ciudad</h2>
          <p className="text-[11px] text-gray-400">
            Ranking por ingresos, pedidos, tendencia y calidad · comparado con los {days} días anteriores
          </p>
        </div>
        <div
          className="flex overflow-hidden rounded-lg border border-gray-200"
          role="group"
          aria-label="Periodo del desempeño por ciudad"
        >
          {PERIOD_OPTIONS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDays(d)}
              aria-pressed={days === d}
              className={`min-h-11 px-3 text-xs font-semibold sm:min-h-0 sm:py-1 ${
                days === d ? "bg-gray-900 text-white" : "bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <div className="py-6 text-center">
          <p className="text-sm text-red-700">{error}</p>
          <button
            type="button"
            onClick={() => void load(days)}
            className="mt-2 min-h-11 text-xs font-semibold text-gray-700 hover:underline"
          >
            Reintentar
          </button>
        </div>
      ) : !data ? (
        <div className="h-40 animate-pulse rounded-lg bg-gray-100" />
      ) : (
        <div className="space-y-6">
          {data.truncated && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
              Hay más pedidos de los que se pueden analizar en una sola carga: los totales son parciales.
            </p>
          )}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SummaryTile label="Ciudades con ventas" value={String(data.totals.withOrders)} />
            <SummaryTile label="Sin pedidos" value={String(data.totals.withoutOrders)} />
            <SummaryTile label="Ingresos pagados" value={money(data.totals.revenue)} />
            <SummaryTile label="Ticket mediano" value={money(data.medianAov)} />
          </div>

          {data.cities.length === 0 ? (
            <p className="py-4 text-center text-sm text-gray-500">
              Ninguna ciudad registró pedidos en este periodo.
            </p>
          ) : (
            <>
              <div className="hidden overflow-x-auto sm:block">
                <table className="w-full text-sm">
                  <caption className="sr-only">
                    Desempeño de cada ciudad en los últimos {days} días, ordenado por score
                  </caption>
                  <thead>
                    <tr className="border-b border-gray-100 text-left text-[11px] uppercase tracking-wide text-gray-400">
                      <th scope="col" className="py-2 pr-3 font-medium">Ciudad</th>
                      <th scope="col" className="py-2 pr-3 font-medium">Score</th>
                      <th scope="col" className="py-2 pr-3 text-right font-medium">Pedidos</th>
                      <th scope="col" className="py-2 pr-3 text-right font-medium">Ingresos</th>
                      <th scope="col" className="py-2 pr-3 text-right font-medium">Ticket</th>
                      <th scope="col" className="py-2 pr-3 text-right font-medium">Cancel.</th>
                      <th scope="col" className="py-2 pr-3 text-right font-medium">WhatsApp</th>
                      <th scope="col" className="py-2 pr-3 text-right font-medium">Catálogo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.cities.map((city) => (
                      <tr key={city.cityId} className="border-b border-gray-50 last:border-0">
                        <td className="py-2.5 pr-3">
                          <div className="flex items-center gap-2">
                            <Link
                              href={`/admin/productos?city=${city.cityId}`}
                              className="font-medium text-gray-900 hover:underline"
                            >
                              {city.name}
                            </Link>
                            <TierBadge tier={city.tier} />
                          </div>
                        </td>
                        <td className="py-2.5 pr-3"><ScoreBar score={city.score} /></td>
                        <td className="py-2.5 pr-3 text-right tabular-nums">
                          {city.orders}
                          <div><Delta value={city.ordersDeltaPct} /></div>
                        </td>
                        <td className="py-2.5 pr-3 text-right tabular-nums">
                          {money(city.revenue)}
                          <div><Delta value={city.revenueDeltaPct} /></div>
                        </td>
                        <td className="py-2.5 pr-3 text-right tabular-nums">{money(city.aov)}</td>
                        <td className="py-2.5 pr-3 text-right tabular-nums">
                          <span className={city.cancellationRate >= 15 ? "font-semibold text-red-700" : ""}>
                            {city.cancellationRate}%
                          </span>
                        </td>
                        <td className="py-2.5 pr-3 text-right tabular-nums">{city.whatsappShare}%</td>
                        <td className="py-2.5 pr-3 text-right tabular-nums">
                          {city.catalogCoverage === null ? (
                            <span className="text-gray-400">—</span>
                          ) : (
                            <span
                              className={
                                data.maxCatalogCoverage !== null &&
                                city.catalogCoverage < data.maxCatalogCoverage * 0.4
                                  ? "font-semibold text-amber-700"
                                  : ""
                              }
                            >
                              {city.catalogCoverage}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <ul className="space-y-3 sm:hidden">
                {data.cities.map((city) => (
                  <li key={city.cityId} className="rounded-lg border border-gray-100 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <Link
                        href={`/admin/productos?city=${city.cityId}`}
                        className="font-medium text-gray-900 hover:underline"
                      >
                        {city.name}
                      </Link>
                      <TierBadge tier={city.tier} />
                    </div>
                    <div className="mt-2"><ScoreBar score={city.score} /></div>
                    <dl className="mt-2 grid grid-cols-2 gap-2 text-xs">
                      <MobileStat label="Pedidos" value={String(city.orders)} delta={city.ordersDeltaPct} />
                      <MobileStat label="Ingresos" value={money(city.revenue)} delta={city.revenueDeltaPct} />
                      <MobileStat label="Ticket" value={money(city.aov)} />
                      <MobileStat label="Cancelaciones" value={`${city.cancellationRate}%`} />
                      <MobileStat label="WhatsApp" value={`${city.whatsappShare}%`} />
                      <MobileStat
                        label="Catálogo"
                        value={city.catalogCoverage === null ? "—" : String(city.catalogCoverage)}
                      />
                    </dl>
                  </li>
                ))}
              </ul>
            </>
          )}

          {best && (
            <div className="rounded-lg bg-green-50 px-3 py-2 text-xs text-green-900">
              <p>
                Mejor desempeño: <strong>{best.name}</strong> con {best.orders} pedidos y{" "}
                {money(best.revenue)} en ingresos pagados.
                {worst && worst.cityId !== best.cityId && (
                  <> La que más necesita atención: <strong>{worst.name}</strong>.</>
                )}
              </p>
              {best.tips
                .filter((tip) => tip.id === "referencia")
                .map((tip) => (
                  <p key={tip.id} className="mt-1 text-green-800">
                    {tip.detail}
                  </p>
                ))}
            </div>
          )}

          {data.needsAttention.length > 0 && (
            <div>
              <h3 className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
                <AlertTriangle className="h-4 w-4 text-amber-700" aria-hidden="true" />
                Ciudades que necesitan atención
              </h3>
              <p className="mb-3 text-[11px] text-gray-400">
                Señales detectadas con las métricas del periodo y qué hacer al respecto.
              </p>
              <ul className="grid gap-3 lg:grid-cols-2">
                {data.needsAttention.map((city) => (
                  <li key={city.cityId} className="rounded-lg border border-amber-200 bg-amber-50/40 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <Link
                        href={`/admin/productos?city=${city.cityId}`}
                        className="font-medium text-gray-900 hover:underline"
                      >
                        {city.name}
                      </Link>
                      <span className="text-[11px] font-semibold text-gray-500">Score {city.score}</span>
                    </div>

                    <ul className="mt-2 space-y-1.5">
                      {city.tips.map((tip) => (
                        <li key={tip.id} className="flex gap-1.5 text-xs text-gray-700">
                          <Lightbulb
                            className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${
                              tip.severity === "critical"
                                ? "text-red-700"
                                : tip.severity === "warning"
                                  ? "text-amber-700"
                                  : "text-blue-500"
                            }`}
                            aria-hidden="true"
                          />
                          <span>
                            <strong className="font-semibold text-gray-900">{tip.title}:</strong>{" "}
                            {tip.detail}{" "}
                            {tip.href && (
                              <Link
                                href={tip.href}
                                className="inline-flex items-center gap-0.5 font-semibold text-gray-900 hover:underline"
                              >
                                Ir
                                <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
                              </Link>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>

                    <div className="mt-3 border-t border-amber-200/70 pt-3">
                      {tips[city.cityId]?.text ? (
                        <div className="text-xs text-gray-700">
                          <p className="mb-1 flex items-center gap-1 font-semibold text-gray-900">
                            <Sparkles className="h-3.5 w-3.5 text-purple-500" aria-hidden="true" />
                            Plan sugerido por IA
                          </p>
                          <p className="whitespace-pre-wrap">{tips[city.cityId]?.text}</p>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void requestTip(city.cityId)}
                          disabled={tips[city.cityId]?.loading}
                          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60 sm:min-h-0 sm:py-1.5"
                        >
                          {tips[city.cityId]?.loading ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                          ) : (
                            <Sparkles className="h-3.5 w-3.5 text-purple-500" aria-hidden="true" />
                          )}
                          {tips[city.cityId]?.loading ? "Generando plan…" : "Generar plan con IA"}
                        </button>
                      )}
                      {tips[city.cityId]?.error && (
                        <p className="mt-1.5 text-[11px] text-red-700">{tips[city.cityId]?.error}</p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {data.withoutOrders.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Sin pedidos en el periodo</h3>
              <p className="mb-3 text-[11px] text-gray-400">
                {data.withoutOrders.length}{" "}
                {data.withoutOrders.length === 1 ? "ciudad" : "ciudades"} sin ventas en los últimos {days} días.
              </p>
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {data.withoutOrders.map((city) => (
                  <li
                    key={city.cityId}
                    className="rounded-lg border border-gray-100 bg-gray-50/60 p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <Link
                        href={`/admin/productos?city=${city.cityId}`}
                        className="text-sm font-medium text-gray-900 hover:underline"
                      >
                        {city.name}
                      </Link>
                      {!city.isActive && (
                        <span className="rounded-full bg-gray-200 px-2 py-0.5 text-[11px] text-gray-600">
                          Inactiva
                        </span>
                      )}
                    </div>
                    <ul className="mt-1.5 space-y-1">
                      {city.tips.length === 0 ? (
                        <li className="text-[11px] text-gray-500">Sin señales: revisa zona de entrega y demanda.</li>
                      ) : (
                        city.tips.map((tip) => (
                          <li key={tip.id} className="flex gap-1.5 text-[11px] text-gray-600">
                            <Check className="mt-0.5 h-3 w-3 shrink-0 text-gray-400" aria-hidden="true" />
                            <span>
                              <strong className="font-semibold text-gray-800">{tip.title}:</strong>{" "}
                              {tip.detail}{" "}
                              {tip.href && (
                                <Link href={tip.href} className="font-semibold text-gray-900 hover:underline">
                                  Ir
                                </Link>
                              )}
                            </span>
                          </li>
                        ))
                      )}
                    </ul>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-[11px] text-gray-400">
            Últimos {data.days} días vs. los {data.days} anteriores · ingresos y ticket solo cuentan pedidos
            pagados · el score combina ingresos (40%), pedidos (25%), tendencia (20%) y calidad (15%).
          </p>
        </div>
      )}
    </section>
  )
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50/60 px-3 py-2">
      <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-0.5 text-lg font-bold tabular-nums text-gray-900">{value}</p>
    </div>
  )
}

function MobileStat({
  label,
  value,
  delta,
}: {
  label: string
  value: string
  delta?: number | null
}) {
  return (
    <div>
      <dt className="text-[11px] text-gray-400">{label}</dt>
      <dd className="font-semibold tabular-nums text-gray-900">
        {value} {delta !== undefined && <Delta value={delta} />}
      </dd>
    </div>
  )
}
