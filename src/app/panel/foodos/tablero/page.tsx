"use client"

// ============================================================
// Tablero FoodTech — métricas del sistema de pedidos:
// pedidos por día, por canal, por sucursal y por turno de caja,
// ticket promedio, top platillos y cierre diario exportable.
//
// Toda la aritmética vive en `@/lib/foodos-reportes` (módulo puro y probado).
// Aquí solo se pinta: la regla que más se equivoca en un POS —los ingresos se
// cuentan por `payment_status = "paid"`, nunca por número de filas— tiene que
// estar en un solo lugar, no repartida entre componentes.
// ============================================================

import { useCallback, useEffect, useMemo, useState } from "react"
import { getAiUsage, getFoodosPanelData } from "../actions"
import { getFoodosReportData, type FoodosReportData } from "./actions"
import { formatMoney } from "@/lib/foodos"
import {
  FULFILLMENT_LABELS,
  NO_SHIFT,
  computeDailyClose,
  computeReport,
  dailyCloseCsv,
  paymentMethodLabel,
  shiftOptions,
  type ShiftCloseRow,
} from "@/lib/foodos-reportes"
import type { FoodosRestaurant, FoodosBranch, FoodosCustomer } from "@/types/foodos"
import type { AiUsageSnapshot } from "@/lib/ai/usage"
import {
  Loader2,
  TrendingUp,
  ShoppingBag,
  Repeat,
  Users,
  Percent,
  Sparkles,
  Download,
  TriangleAlert,
  Clock,
} from "lucide-react"
import ToolGuideHost from "@/components/panel/guide/tool-guide-host"
import { t } from "@/lib/i18n/es"

export default function TableroPage() {
  const [restaurant, setRestaurant] = useState<FoodosRestaurant | null>(null)
  const [branches, setBranches] = useState<FoodosBranch[]>([])
  const [customers, setCustomers] = useState<FoodosCustomer[]>([])
  const [aiUsage, setAiUsage] = useState<AiUsageSnapshot | null>(null)
  const [data, setData] = useState<FoodosReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [reportLoading, setReportLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [days, setDays] = useState(30)
  const [branchId, setBranchId] = useState("")
  const [shiftId, setShiftId] = useState("")
  // El instante del reporte se fija al cargar: el corte en SQL y el agrupado
  // por día tienen que usar el mismo reloj, o el pedido de la medianoche del
  // límite entra por un lado y desaparece por el otro.
  const [now, setNow] = useState(() => Date.now())

  const loadStatic = useCallback(async () => {
    try {
      const [{ restaurant: r, branches: bs, customers: cs }, usage] = await Promise.all([
        getFoodosPanelData(),
        getAiUsage(),
      ])
      setRestaurant(r)
      setBranches(bs)
      setCustomers(cs)
      setAiUsage(usage)
    } catch (e) {
      setError(e instanceof Error ? e.message : t("foodos.tablero.loadError"))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const run = async () => {
      await loadStatic()
    }
    run()
  }, [loadStatic])

  const loadReport = useCallback(async () => {
    const stamp = Date.now()
    try {
      const next = await getFoodosReportData({
        days,
        branchId: branchId || null,
        now: stamp,
      })
      setData(next)
      setNow(stamp)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : t("foodos.tablero.loadError"))
    } finally {
      setReportLoading(false)
    }
  }, [days, branchId])

  useEffect(() => {
    const run = async () => {
      await loadReport()
    }
    run()
  }, [loadReport])

  const orders = useMemo(() => data?.orders ?? [], [data])
  const shifts = useMemo(() => data?.shifts ?? [], [data])

  const report = useMemo(
    () =>
      computeReport(
        orders,
        { days, branchId: branchId || null, shiftId: shiftId || null },
        now
      ),
    [orders, days, branchId, shiftId, now]
  )

  const close = useMemo(
    () =>
      computeDailyClose(orders, shifts, {
        now,
        shiftId: shiftId || null,
      }),
    [orders, shifts, now, shiftId]
  )

  const branchNames = useMemo(
    () => new Map(branches.map((b) => [b.id, b.name])),
    [branches]
  )

  const shiftLabels = useMemo(() => {
    const map = new Map(shiftOptions(shifts, branchNames).map((o) => [o.id, o.label]))
    map.set(NO_SHIFT, t("foodos.tablero.shiftNone"))
    return map
  }, [shifts, branchNames])

  const repeat = useMemo(() => {
    const repeatCustomers = customers.filter((c) => c.total_orders >= 2).length
    return {
      count: customers.length,
      rate: customers.length ? (repeatCustomers / customers.length) * 100 : 0,
    }
  }, [customers])

  const maxDay = useMemo(
    () => Math.max(...report.byDay.map((d) => d.count), 1),
    [report.byDay]
  )

  const exportDailyClose = () => {
    const csv = dailyCloseCsv(close, shiftLabels)
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `cierre-${close.dayKey}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (!restaurant) {
    if (loading) {
      return (
        <div className="flex items-center justify-center py-24 text-stone-500">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> {t("foodos.common.loading")}
        </div>
      )
    }
    return (
      <div className="max-w-2xl mx-auto mt-16 bg-amber-50 border border-amber-200 rounded-2xl p-8 text-center">
        <h1 className="text-xl font-black text-stone-900">{t("foodos.common.setupTitle")}</h1>
        <p className="text-stone-600 mt-2">{t("foodos.tablero.setupBody")}</p>
      </div>
    )
  }

  const busy = reportLoading || data === null

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-black text-stone-900">{t("foodos.tablero.title")}</h1>
          <p className="text-sm text-stone-500">{t("foodos.tablero.subtitle")}</p>
        </div>
        <div className="flex gap-2">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              onClick={() => {
                setReportLoading(true)
                setDays(d)
              }}
              aria-pressed={days === d}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
                days === d ? "bg-stone-900 text-white" : "bg-white border border-stone-200 text-stone-600"
              }`}
            >
              {t("foodos.tablero.days", { days: d })}
            </button>
          ))}
        </div>
      </div>

      {/* Filtros: el tablero de un restaurante con sucursales no puede sumar
          todas juntas y dejar que el dueño adivine qué local va mal. */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        <select
          value={branchId}
          onChange={(e) => {
            setReportLoading(true)
            setBranchId(e.target.value)
          }}
          aria-label={t("foodos.tablero.branchFilter")}
          className="h-11 rounded-xl border border-stone-200 bg-white px-3 text-sm font-semibold text-stone-700"
        >
          <option value="">{t("foodos.tablero.branchAll")}</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        {shifts.length > 0 && (
          <select
            value={shiftId}
            onChange={(e) => {
              setReportLoading(true)
              setShiftId(e.target.value)
            }}
            aria-label={t("foodos.tablero.shiftFilter")}
            className="h-11 rounded-xl border border-stone-200 bg-white px-3 text-sm font-semibold text-stone-700"
          >
            <option value="">{t("foodos.tablero.shiftAll")}</option>
            {shiftOptions(shifts, branchNames).map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
            <option value={NO_SHIFT}>{t("foodos.tablero.shiftNone")}</option>
          </select>
        )}
        {busy && <Loader2 className="w-4 h-4 animate-spin text-stone-400" aria-hidden="true" />}
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{error}</div>
      )}

      {data?.truncated && (
        <p className="mb-4 flex items-start gap-2 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3">
          <TriangleAlert className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
          {t("foodos.tablero.truncated")}
        </p>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Kpi icon={<ShoppingBag className="w-5 h-5" />} label={t("foodos.tablero.kpiOrders")} value={String(report.orderCount)} accent="bg-emerald-100 text-emerald-600" />
        <Kpi icon={<TrendingUp className="w-5 h-5" />} label={t("foodos.tablero.kpiRevenue")} value={formatMoney(report.revenue)} accent="bg-blue-100 text-blue-600" />
        <Kpi icon={<Percent className="w-5 h-5" />} label={t("foodos.tablero.kpiAvgTicket")} value={formatMoney(report.avgTicket)} accent="bg-purple-100 text-purple-600" />
        <Kpi icon={<Repeat className="w-5 h-5" />} label={t("foodos.tablero.kpiRepeat")} value={`${repeat.rate.toFixed(0)}%`} accent="bg-amber-100 text-amber-600" />
      </div>

      {aiUsage && <AiUsageCard usage={aiUsage} />}

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Pedidos por día */}
        <Card title={t("foodos.tablero.byDay")}>
          <div className="flex items-end gap-1 h-40">
            {report.byDay.map((d) => (
              <div key={d.key} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                <span className="text-[10px] text-stone-400 font-semibold">{d.count || ""}</span>
                <div
                  title={`${d.key} · ${d.count} · ${formatMoney(d.revenue)}`}
                  className="w-full rounded-t-lg bg-emerald-700 hover:bg-emerald-800 transition-colors"
                  style={{ height: `${Math.max((d.count / maxDay) * 100, d.count ? 8 : 2)}%` }}
                />
                <span className="text-[10px] text-stone-500 capitalize truncate">{d.label}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* Canales */}
        <Card title={t("foodos.tablero.channelsCard")}>
          <div className="space-y-3">
            {report.byChannel.map((row) => (
              <div key={row.channel}>
                <div className="flex justify-between text-sm mb-1 gap-3">
                  <span className="text-stone-600 truncate">{row.label}</span>
                  <span className="font-bold text-stone-900 shrink-0">
                    {row.count}
                    <span className="text-stone-400 font-normal"> · {formatMoney(row.revenue)}</span>
                  </span>
                </div>
                <div className="h-2 bg-stone-100 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-700 rounded-full" style={{ width: `${row.share}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Top platillos */}
        <Card title={t("foodos.tablero.topItems")}>
          {report.topItems.length === 0 ? (
            <p className="text-sm text-stone-400 py-6 text-center">{t("foodos.tablero.emptyPeriod")}</p>
          ) : (
            <div className="space-y-3">
              {report.topItems.map((item, idx) => (
                <div key={item.itemId} className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${
                      idx === 0 ? "bg-amber-100 text-amber-700" : "bg-stone-100 text-stone-600"
                    }`}>
                      {idx + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-stone-900 truncate">{item.name}</p>
                      <p className="text-xs text-stone-500">{t("foodos.tablero.sold", { qty: item.qty })}</p>
                    </div>
                  </div>
                  <p className="text-sm font-bold text-stone-900 shrink-0">{formatMoney(item.revenue)}</p>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Combos / cross-sell */}
        <Card title={t("foodos.tablero.combosCard")}>
          <div className="flex items-center gap-4">
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-emerald-100 to-amber-100 flex items-center justify-center shrink-0">
              <div className="text-center">
                <Sparkles className="w-5 h-5 text-emerald-600 mx-auto" aria-hidden="true" />
                <p className="text-lg font-black text-stone-900">{report.comboShare.toFixed(0)}%</p>
              </div>
            </div>
            <div>
              <p className="text-sm text-stone-600">
                <strong className="text-stone-900">{formatMoney(report.comboRevenue)}</strong> {t("foodos.tablero.comboSales")}
              </p>
              <p className="text-xs text-stone-500 mt-1">{t("foodos.tablero.ofTotal", { total: formatMoney(report.revenue) })}</p>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-stone-100 flex items-center gap-2 text-sm text-stone-600">
            <Users className="w-4 h-4 text-stone-400" aria-hidden="true" />
            {t("foodos.tablero.customersRepeat", { count: repeat.count, rate: repeat.rate.toFixed(0) })}
          </div>
        </Card>
      </div>

      {/* Por sucursal */}
      {report.byBranch.length > 0 && (
        <Card title={t("foodos.tablero.byBranch")} className="mt-6">
          <div className="grid gap-3 md:grid-cols-3">
            {report.byBranch.map((row) => (
              <div key={row.branchId} className="bg-stone-50 rounded-xl p-4">
                <p className="text-sm font-bold text-stone-900 truncate">
                  {branchNames.get(row.branchId) ?? t("foodos.tablero.noBranch")}
                </p>
                <p className="text-2xl font-black text-stone-900 mt-1">{formatMoney(row.revenue)}</p>
                <p className="text-xs text-stone-500">
                  {row.count} {t("foodos.tablero.orders")}
                </p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Por turno de caja */}
      {report.byShift.length > 0 && (
        <Card title={t("foodos.tablero.byShift")} className="mt-6">
          <div className="space-y-3">
            {report.byShift.map((row) => (
              <div key={row.shiftId} className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <Clock className="w-4 h-4 text-stone-400 shrink-0" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-stone-900 truncate">
                      {shiftLabels.get(row.shiftId) ?? row.shiftId}
                    </p>
                    <p className="text-xs text-stone-500">
                      {row.count} {t("foodos.tablero.orders")} · {t("foodos.tablero.shiftCash", { amount: formatMoney(row.cash) })}
                    </p>
                  </div>
                </div>
                <p className="text-sm font-bold text-stone-900 shrink-0">{formatMoney(row.revenue)}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Cierre diario */}
      <Card title={t("foodos.tablero.closeTitle")} className="mt-6">
        {close.orderCount === 0 ? (
          <p className="text-sm text-stone-400 py-6 text-center">{t("foodos.tablero.closeEmpty")}</p>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <CloseStat label={t("foodos.tablero.closeOrders")} value={String(close.orderCount)} />
              <CloseStat label={t("foodos.tablero.closeRevenue")} value={formatMoney(close.revenue)} />
              <CloseStat label={t("foodos.tablero.closeTips")} value={formatMoney(close.tips)} />
              <CloseStat label={t("foodos.tablero.closeDiscounts")} value={formatMoney(close.discounts)} />
              <CloseStat label={t("foodos.tablero.closePending")} value={formatMoney(close.pending)} accent={close.pending > 0} />
            </div>

            <div className="grid md:grid-cols-3 gap-4">
              <div>
                <p className="text-xs font-bold text-stone-500 uppercase tracking-wide mb-2">
                  {t("foodos.tablero.closeByPayment")}
                </p>
                <div className="space-y-1.5">
                  {close.byPayment.map((row) => (
                    <div key={row.method} className="flex justify-between gap-3 text-sm">
                      <span className="text-stone-600 truncate">{paymentMethodLabel(row.method)}</span>
                      <span className="font-semibold text-stone-900 shrink-0">
                        {row.count} · {formatMoney(row.total)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-bold text-stone-500 uppercase tracking-wide mb-2">
                  {t("foodos.tablero.closeByChannel")}
                </p>
                <div className="space-y-1.5">
                  {close.byChannel.map((row) => (
                    <div key={row.channel} className="flex justify-between gap-3 text-sm">
                      <span className="text-stone-600 truncate">{row.label}</span>
                      <span className="font-semibold text-stone-900 shrink-0">
                        {row.count} · {formatMoney(row.revenue)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-bold text-stone-500 uppercase tracking-wide mb-2">
                  {t("foodos.tablero.closeByService")}
                </p>
                <div className="space-y-1.5">
                  {close.byFulfillment.map((row) => (
                    <div key={row.fulfillment} className="flex justify-between gap-3 text-sm">
                      <span className="text-stone-600 truncate">
                        {FULFILLMENT_LABELS[row.fulfillment] ?? row.fulfillment}
                      </span>
                      <span className="font-semibold text-stone-900 shrink-0">{row.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {close.shifts.length > 0 && (
              <div className="pt-3 border-t border-stone-100">
                <p className="text-xs font-bold text-stone-500 uppercase tracking-wide mb-2">
                  {t("foodos.tablero.closeShifts")}
                </p>
                <div className="space-y-2">
                  {close.shifts.map((row) => (
                    <ShiftCloseLine key={row.id} row={row} />
                  ))}
                </div>
              </div>
            )}

            <button
              onClick={exportDailyClose}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-stone-900 text-white text-sm font-semibold hover:bg-stone-700"
            >
              <Download className="w-4 h-4" aria-hidden="true" /> {t("foodos.tablero.closeExport")}
            </button>
          </div>
        )}
      </Card>
      <ToolGuideHost toolKey="tablero" pathname="/panel/foodos/tablero" slug={null} icon="📊" title={t("foodos.tablero.guideTitle")} />
    </div>
  )
}

function Kpi({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode
  label: string
  value: string
  accent: string
}) {
  return (
    <div className="bg-white border border-stone-200 rounded-2xl p-4">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-2 ${accent}`}>{icon}</div>
      <p className="text-xl font-black text-stone-900 truncate">{value}</p>
      <p className="text-xs text-stone-500">{label}</p>
    </div>
  )
}

const ARQUEO_TONE: Record<string, string> = {
  ok: "bg-emerald-50 text-emerald-700 border-emerald-200",
  short: "bg-red-50 text-red-700 border-red-200",
  over: "bg-amber-50 text-amber-700 border-amber-200",
}

function arqueoLabel(arqueo: ShiftCloseRow["arqueo"]): string {
  if (arqueo === "ok") return t("foodos.tablero.arqueoOk")
  if (arqueo === "short") return t("foodos.tablero.arqueoShort")
  if (arqueo === "over") return t("foodos.tablero.arqueoOver")
  return t("foodos.tablero.arqueoOpen")
}

/**
 * Un turno del cierre. Mientras siga abierto no hay faltante ni sobrante que
 * mostrar: el corte todavía no cuadra porque no ha terminado.
 */
function ShiftCloseLine({ row }: { row: ShiftCloseRow }) {
  const tone = ARQUEO_TONE[row.arqueo ?? ""] ?? "bg-stone-100 text-stone-600 border-stone-200"
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
      <div className="min-w-0">
        <p className="font-semibold text-stone-900 truncate">{row.label}</p>
        <p className="text-xs text-stone-500">
          {row.orderCount} · {formatMoney(row.revenue)} · {formatMoney(row.cashSales)}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {row.expectedCash !== null && (
          <span className="text-xs text-stone-500">
            {t("foodos.tablero.expectedCash")} {formatMoney(row.expectedCash)}
          </span>
        )}
        {row.declaredCash !== null && (
          <span className="text-xs text-stone-500">
            {t("foodos.tablero.declaredCash")} {formatMoney(row.declaredCash)}
          </span>
        )}
        <span className={`px-2 py-0.5 rounded-full text-xs font-bold border ${tone}`}>
          {arqueoLabel(row.arqueo)}
        </span>
      </div>
    </div>
  )
}

function AiUsageCard({ usage }: { usage: AiUsageSnapshot }) {
  const pct = Math.min(100, Math.round(usage.ratio * 100))
  return (
    <Card title={t("foodos.tablero.aiUsageCard")} className="mb-6">
      <div className="flex items-baseline justify-between gap-3 mb-2">
        <p className="text-sm font-semibold text-stone-900">
          {usage.calls === 0
            ? t("foodos.tablero.aiUsageEmpty")
            : t("foodos.tablero.aiUsageToday", {
                tokens: usage.tokensUsed.toLocaleString("es-MX"),
                cap: usage.cap.toLocaleString("es-MX"),
              })}
        </p>
        {usage.calls > 0 && (
          <p className="text-xs text-stone-500 shrink-0">
            {t("foodos.tablero.aiUsageCalls", { count: usage.calls })}
            {usage.fallbacks > 0
              ? ` · ${t("foodos.tablero.aiUsageFallbacks", { count: usage.fallbacks })}`
              : ""}
          </p>
        )}
      </div>
      <div className="h-2 bg-stone-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-[width] ${usage.nearCap ? "bg-amber-700" : "bg-emerald-700"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {usage.nearCap && (
        <p className="mt-3 flex items-start gap-2 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3">
          <TriangleAlert className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
          {t("foodos.tablero.aiUsageNearCap")}
        </p>
      )}
      {usage.history.length > 1 && (
        <div className="mt-4 pt-3 border-t border-stone-100">
          <p className="text-xs font-bold text-stone-500 uppercase tracking-wide mb-2">
            {t("foodos.tablero.aiUsageHistory")}
          </p>
          <div className="space-y-1">
            {usage.history.map((d) => (
              <div key={d.day} className="flex items-center justify-between text-sm">
                <span className="text-stone-600">{d.day}</span>
                <span className="font-semibold text-stone-900">
                  {d.tokensUsed.toLocaleString("es-MX")}
                  <span className="text-stone-500 font-normal"> · {d.calls}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  )
}

function CloseStat({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-xl p-3 ${accent ? "bg-amber-50 border border-amber-200" : "bg-stone-50"}`}>
      <p className="text-base font-black text-stone-900 truncate">{value}</p>
      <p className="text-[11px] text-stone-500">{label}</p>
    </div>
  )
}

function Card({
  title,
  children,
  className = "",
}: {
  title: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={`bg-white border border-stone-200 rounded-2xl p-5 ${className}`}>
      <h2 className="font-bold text-stone-900 mb-4">{title}</h2>
      {children}
    </div>
  )
}
