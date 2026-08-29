"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useRestaurant } from "@/contexts/restaurant-context"
import { useSharedDishes } from "@/hooks/use-local-storage"
import { useSyncedStorage } from "@/hooks/use-synced-storage"
import { useSyncedRows } from "@/hooks/use-synced-rows"
import { t } from "@/lib/i18n/es"
import { normalizeName } from "@/lib/normalize"
import EmptyState from "@/components/panel/EmptyState"
import { entryTotal, type SaleEntry } from "@/components/panel/ventas/ventas-shared"
import type { WasteEntry } from "@/components/panel/mermas/mermas-shared"
import { ALERT_HISTORY_KEY, type AlertHistoryEvent } from "@/components/panel/hub/use-alert-history"
import {
  ArrowLeft, BarChart3, AlertTriangle, AlertCircle, Info, CheckCircle2,
} from "lucide-react"

type RangeKey = "7d" | "30d" | "month"

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function rangeStart(range: RangeKey, today: string): string {
  if (range === "month") return `${today.slice(0, 7)}-01`
  const d = new Date(`${today}T12:00:00`)
  d.setDate(d.getDate() - (range === "7d" ? 6 : 29))
  return isoDay(d)
}

function eachDay(start: string, today: string): string[] {
  const days: string[] = []
  const d = new Date(`${start}T12:00:00`)
  while (isoDay(d) <= today) {
    days.push(isoDay(d))
    d.setDate(d.getDate() + 1)
  }
  return days
}

const ALERT_ICON = { danger: AlertTriangle, warning: AlertCircle, info: Info, success: CheckCircle2 } as const
const ALERT_COLOR = {
  danger: "text-red-500", warning: "text-amber-500", info: "text-blue-500", success: "text-emerald-500",
} as const

export default function AnaliticaPage() {
  const { selectedCollection } = useRestaurant()
  const slug = selectedCollection?.slug || null
  const [sharedDishes] = useSharedDishes(slug)
  const [ventasEntries] = useSyncedRows<SaleEntry>("ventas-entries", [], slug)
  const [mermaEntries] = useSyncedRows<WasteEntry>("mermas-entries", [], slug)
  const [alertHistory] = useSyncedStorage<AlertHistoryEvent[]>(ALERT_HISTORY_KEY, [], slug)
  const [range, setRange] = useState<RangeKey>("30d")

  const today = isoDay(new Date())
  const start = rangeStart(range, today)

  // Costo unitario por platillo según el costeo real (Costeando mi menú)
  const dishCostByName = useMemo(() => {
    const map = new Map<string, number>()
    sharedDishes.forEach((d) => {
      map.set(normalizeName(d.name), d.ingredients.reduce((s, i) => s + i.quantity * i.unitPrice, 0))
    })
    return map
  }, [sharedDishes])

  const unitCostOf = (e: SaleEntry): number =>
    e.unitCost > 0 ? e.unitCost : dishCostByName.get(normalizeName(e.dishName)) ?? 0

  const ventas = useMemo(
    () => ventasEntries.filter((e) => e.date >= start && e.date <= today),
    [ventasEntries, start, today],
  )
  const mermas = useMemo(
    () => mermaEntries.filter((e) => e.date.slice(0, 10) >= start && e.date.slice(0, 10) <= today),
    [mermaEntries, start, today],
  )

  const kpis = useMemo(() => {
    const revenue = ventas.reduce((s, e) => s + entryTotal(e), 0)
    const cost = ventas.reduce((s, e) => s + e.quantity * unitCostOf(e), 0)
    const waste = mermas.reduce((s, e) => s + e.amountKg * e.costPerKg, 0)
    return {
      revenue,
      cost,
      margin: revenue - cost,
      foodCost: revenue > 0 ? (cost / revenue) * 100 : 0,
      waste,
      wasteRate: revenue > 0 ? (waste / revenue) * 100 : 0,
      tickets: ventas.length,
      avgTicket: ventas.length > 0 ? revenue / ventas.length : 0,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ventas, mermas, dishCostByName])

  const trend = useMemo(() => {
    const revByDay = new Map<string, number>()
    const wasteByDay = new Map<string, number>()
    ventas.forEach((e) => revByDay.set(e.date, (revByDay.get(e.date) || 0) + entryTotal(e)))
    mermas.forEach((e) => {
      const day = e.date.slice(0, 10)
      wasteByDay.set(day, (wasteByDay.get(day) || 0) + e.amountKg * e.costPerKg)
    })
    const days = eachDay(start, today).map((date) => ({
      date,
      label: date.slice(8),
      revenue: revByDay.get(date) || 0,
      waste: wasteByDay.get(date) || 0,
    }))
    return { days, max: Math.max(1, ...days.map((d) => d.revenue)) }
  }, [ventas, mermas, start, today])

  const topDishes = useMemo(() => {
    const byDish = new Map<string, { name: string; units: number; revenue: number; cost: number }>()
    ventas.forEach((e) => {
      const key = normalizeName(e.dishName) || e.dishName
      const cur = byDish.get(key) || { name: e.dishName, units: 0, revenue: 0, cost: 0 }
      cur.units += e.quantity
      cur.revenue += entryTotal(e)
      cur.cost += e.quantity * unitCostOf(e)
      byDish.set(key, cur)
    })
    return [...byDish.values()]
      .map((d) => ({ ...d, margin: d.revenue - d.cost }))
      .sort((a, b) => b.margin - a.margin)
      .slice(0, 5)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ventas, dishCostByName])

  const topMax = Math.max(1, ...topDishes.map((d) => d.margin))

  const alertsGrouped = useMemo(() => {
    const map = new Map<string, { title: string; type: AlertHistoryEvent["type"]; count: number; lastAt: string }>()
    alertHistory.forEach((ev) => {
      const cur = map.get(ev.id)
      if (cur) {
        cur.count += 1
        if (ev.at > cur.lastAt) cur.lastAt = ev.at
      } else {
        map.set(ev.id, { title: ev.title, type: ev.type, count: 1, lastAt: ev.at })
      }
    })
    return [...map.values()].sort((a, b) => b.lastAt.localeCompare(a.lastAt)).slice(0, 10)
  }, [alertHistory])

  if (!selectedCollection) {
    return (
      <EmptyState
        icon={BarChart3}
        title={t("analitica.selectCuisineTitle")}
        description={t("analitica.selectCuisineDescription")}
        action={
          <Link
            href="/panel"
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#0E7A0E] text-white text-xs font-semibold rounded-xl hover:bg-[#0D720D] transition-colors"
          >
            {t("rentabilidad.emptyAction")}
          </Link>
        }
      />
    )
  }

  const hasData = ventas.length > 0 || mermas.length > 0
  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "short" })

  return (
    <div className="max-w-4xl mx-auto">
      <Link href="/panel" className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 mb-3">
        <ArrowLeft className="w-3.5 h-3.5" /> {t("common.back")}
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-emerald-600" /> {t("analitica.pageTitle")}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">{t("analitica.description")}</p>
        </div>
        <div className="flex items-center gap-1 bg-gray-100 rounded-full p-1" role="group" aria-label={t("analitica.rangeLabel")}>
          {(["7d", "30d", "month"] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              aria-pressed={range === r}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                range === r ? "bg-[#0E7A0E] text-white" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {t(`analitica.range_${r}`)}
            </button>
          ))}
        </div>
      </div>

      {!hasData ? (
        <EmptyState
          icon={BarChart3}
          title={t("analitica.emptyTitle")}
          description={t("analitica.emptyDescription")}
          action={
            <Link
              href="/panel/ventas"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#0E7A0E] text-white text-xs font-semibold rounded-xl hover:bg-[#0D720D] transition-colors"
            >
              {t("ventas.newSale")}
            </Link>
          }
        />
      ) : (
        <>
          {/* KPIs cruzados */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
            <div className="bg-white rounded-2xl border border-gray-100 p-4">
              <p className="text-[11px] text-gray-400 font-medium uppercase tracking-wide">{t("analitica.kpiRevenue")}</p>
              <p className="text-xl font-bold text-gray-900 mt-1">${kpis.revenue.toFixed(0)}</p>
              <p className="text-[11px] text-gray-400 mt-0.5">{t("analitica.kpiTickets", { count: String(kpis.tickets) })}</p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 p-4">
              <p className="text-[11px] text-gray-400 font-medium uppercase tracking-wide">{t("analitica.kpiMargin")}</p>
              <p className={`text-xl font-bold mt-1 ${kpis.margin >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                ${kpis.margin.toFixed(0)}
              </p>
              <p className="text-[11px] text-gray-400 mt-0.5">{t("analitica.kpiAvgTicket")}: ${kpis.avgTicket.toFixed(0)}</p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 p-4">
              <p className="text-[11px] text-gray-400 font-medium uppercase tracking-wide">{t("analitica.kpiFoodCost")}</p>
              <p className={`text-xl font-bold mt-1 ${kpis.foodCost > 38 ? "text-red-600" : kpis.foodCost > 30 ? "text-amber-500" : "text-emerald-600"}`}>
                {kpis.foodCost.toFixed(1)}%
              </p>
              <p className="text-[11px] text-gray-400 mt-0.5">{t("analitica.kpiCost")}: ${kpis.cost.toFixed(0)}</p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 p-4">
              <p className="text-[11px] text-gray-400 font-medium uppercase tracking-wide">{t("analitica.kpiWaste")}</p>
              <p className="text-xl font-bold text-red-600 mt-1">-${kpis.waste.toFixed(0)}</p>
              <p className="text-[11px] text-gray-400 mt-0.5">{t("analitica.wasteEntries", { count: String(mermas.length) })}</p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 p-4">
              <p className="text-[11px] text-gray-400 font-medium uppercase tracking-wide">{t("analitica.kpiWasteRate")}</p>
              <p className={`text-xl font-bold mt-1 ${kpis.wasteRate > 8 ? "text-red-600" : kpis.wasteRate > 4 ? "text-amber-500" : "text-emerald-600"}`}>
                {kpis.wasteRate.toFixed(1)}%
              </p>
              <p className="text-[11px] text-gray-400 mt-0.5">{t("analitica.wasteRateHint")}</p>
            </div>
          </div>

          {/* Tendencia */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-5">
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 className="w-4 h-4 text-emerald-600" />
              <h3 className="text-sm font-semibold text-gray-900">{t("analitica.trendTitle")}</h3>
            </div>
            <div className="flex items-end gap-[3px] h-32">
              {trend.days.map((d) => (
                <div key={d.date} className="flex-1 flex flex-col items-center gap-1 group min-w-0">
                  <span className="text-[9px] text-gray-400 font-medium opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                    ${d.revenue.toFixed(0)}
                  </span>
                  <div
                    className={`w-full rounded-t transition-all ${
                      d.revenue > 0 ? "bg-emerald-500 group-hover:bg-emerald-600" : "bg-gray-100"
                    }`}
                    style={{ height: `${Math.max(d.revenue > 0 ? (d.revenue / trend.max) * 100 : 3, 3)}%` }}
                    title={`${d.date}: $${d.revenue.toFixed(0)}${d.waste > 0 ? ` · ${t("analitica.kpiWaste")} $${d.waste.toFixed(0)}` : ""}`}
                  />
                  {(range === "7d" || d.date.endsWith("-01") || d.date.endsWith("-15")) && (
                    <span className="text-[9px] text-gray-400">{d.label}</span>
                  )}
                </div>
              ))}
            </div>
            <p className="text-[10px] text-gray-400 mt-3">{t("analitica.trendHint")}</p>
          </div>

          {/* Top platillos por margen real */}
          {topDishes.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">{t("analitica.topDishesTitle")}</h3>
              <div className="space-y-3">
                {topDishes.map((d) => (
                  <div key={d.name}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-medium text-gray-700 truncate">{d.name}</span>
                      <span className="text-gray-400 whitespace-nowrap ml-2">
                        {t("analitica.topDishesUnits", { units: String(d.units) })} ·{" "}
                        <span className={`font-semibold ${d.margin >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                          ${d.margin.toFixed(0)}
                        </span>
                      </span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${d.margin >= 0 ? "bg-emerald-500" : "bg-red-400"}`}
                        style={{ width: `${Math.max((Math.abs(d.margin) / topMax) * 100, 2)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Historial de alertas */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">{t("analitica.alertsHistoryTitle")}</h3>
        {alertsGrouped.length === 0 ? (
          <p className="text-sm text-gray-400">{t("analitica.alertsHistoryEmpty")}</p>
        ) : (
          <ul className="divide-y divide-gray-50">
            {alertsGrouped.map((a, i) => {
              const Icon = ALERT_ICON[a.type]
              return (
                <li key={i} className="flex items-center gap-3 py-2.5">
                  <Icon className={`w-4 h-4 shrink-0 ${ALERT_COLOR[a.type]}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-gray-700 truncate">{a.title}</p>
                    <p className="text-[11px] text-gray-400">
                      {t("analitica.alertFiredAt", { date: fmtDate(a.lastAt) })}
                      {a.count > 1 && ` · ${t("analitica.timesFired", { count: String(a.count) })}`}
                    </p>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
