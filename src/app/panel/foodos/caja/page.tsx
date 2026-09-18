"use client"

// ============================================================
// Corte de caja y arqueo (`/panel/foodos/caja`).
//
// Cuatro bloques, en el orden en que el cajero los usa:
//   1. Abrir turno con el fondo inicial.
//   2. Entradas y salidas de efectivo del turno.
//   3. Cierre contando el cajón por denominación.
//   4. Historial de cortes, con exportación a CSV.
//
// Reglas que la pantalla hace visibles:
//   * Sin turno abierto no hay a dónde imputar la venta, así que la caja se
//     abre antes de cobrar. El texto lo dice, no lo insinúa.
//   * El esperado y la diferencia **nunca** se editan aquí: se muestran. El
//     conteo es lo único que el cajero declara, y el servidor recalcula el
//     resto con las ventas y los movimientos guardados.
//   * Un faltante queda con nombre, fecha y hora. Por eso el historial existe
//     aunque el turno se vea bien hoy.
// ============================================================

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  addShiftMovementAction,
  closeShiftAction,
  getCajaData,
  openShiftAction,
  type CajaData,
  type CajaMovement,
} from "../caja-actions"
import { getFoodosPanelData } from "../actions"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import StatCard from "@/components/panel/StatCard"
import ToolPreviewNotice from "@/components/panel/foodos/tool-preview-notice"
import { useTierGuard } from "@/hooks/use-tier-guard"
import ToolGuideHost from "@/components/panel/guide/tool-guide-host"
import { t } from "@/lib/i18n/es"
import { DEFAULT_TIMEZONE, dayKeyOf } from "@/lib/local-date"
import { formatMoney } from "@/lib/foodos"
import { downloadCsv, toCsv } from "@/lib/csv"
import {
  arqueoStatus,
  computeArqueo,
  MXN_DENOMINATIONS,
  shiftHistoryCsv,
  type ArqueoStatus,
  type ShiftHistoryRow,
} from "@/lib/foodos-cash"
import type { FoodosBranch, FoodosRestaurant } from "@/types/foodos"
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Banknote,
  CalendarClock,
  Check,
  CircleAlert,
  Loader2,
  Lock,
  LockOpen,
  Receipt,
  RefreshCw,
  Scale,
  TrendingUp,
} from "lucide-react"

const EMPTY_DATA: CajaData = {
  shift: null,
  movements: [],
  sales: { count: 0, total: 0, cash: 0, byMethod: {} },
  expectedCash: 0,
  history: [],
}

export default function CajaPage() {
  const { run, upsellDialog } = useTierGuard("pos_mostrador")

  const [restaurant, setRestaurant] = useState<FoodosRestaurant | null>(null)
  const [branches, setBranches] = useState<FoodosBranch[]>([])
  const [branchId, setBranchId] = useState("")
  const [data, setData] = useState<CajaData>(EMPTY_DATA)

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)

  const [floatDraft, setFloatDraft] = useState("")
  const [movement, setMovement] = useState<{ type: "in" | "out"; amount: string; reason: string }>({
    type: "out",
    amount: "",
    reason: "",
  })
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [notes, setNotes] = useState("")
  const [confirmClose, setConfirmClose] = useState(false)

  const load = useCallback(async (scopeBranch: string) => {
    try {
      const panel = await getFoodosPanelData()
      setRestaurant(panel.restaurant)
      setBranches(panel.branches ?? [])
      if (!panel.restaurant) return
      setData((await getCajaData(panel.restaurant.id, scopeBranch || null)) ?? EMPTY_DATA)
    } catch (err) {
      setNotice({
        ok: false,
        text: err instanceof Error ? err.message : t("foodos.caja.actionError"),
      })
    }
  }, [])

  useEffect(() => {
    const run = async () => {
      setLoading(true)
      await load(branchId)
      setLoading(false)
    }
    run()
  }, [load, branchId])

  async function refresh() {
    setRefreshing(true)
    await load(branchId)
    setRefreshing(false)
  }

  const shift = data.shift

  // Vista previa del arqueo: el mismo cálculo que hace el servidor, para que el
  // cajero vea el faltante antes de firmar el corte y no después.
  const declaredCash = useMemo(
    () =>
      MXN_DENOMINATIONS.reduce((total, d) => total + d.value * (counts[String(d.value)] ?? 0), 0),
    [counts]
  )

  const preview = useMemo(() => {
    if (!shift) return null
    const { cashIn, cashOut } = movementsTotals(data.movements)
    return computeArqueo({
      openingFloat: shift.opening_float,
      cashSales: data.sales.cash,
      cashIn,
      cashOut,
      declaredCash,
    })
  }, [shift, data.movements, data.sales.cash, declaredCash])

  async function openShift() {
    if (!restaurant) return
    setBusy("open")
    setNotice(null)
    try {
      const attempt = await run(() =>
        openShiftAction({
          restaurant_id: restaurant.id,
          branch_id: branchId || null,
          opening_float: Number(floatDraft || 0),
        })
      )
      if (!attempt.ran) return
      const result = attempt.value
      if (!result.ok) {
        setNotice({ ok: false, text: result.error ?? t("foodos.caja.openError") })
        return
      }
      setFloatDraft("")
      setNotice({ ok: true, text: t("foodos.caja.openSuccess") })
      await load(branchId)
    } catch (err) {
      setNotice({
        ok: false,
        text: err instanceof Error ? err.message : t("foodos.caja.openError"),
      })
    } finally {
      setBusy(null)
    }
  }

  async function addMovement() {
    if (!shift) return
    setBusy("movement")
    setNotice(null)
    try {
      const attempt = await run(() =>
        addShiftMovementAction({
          shift_id: shift.id,
          type: movement.type,
          amount: Number(movement.amount || 0),
          reason: movement.reason,
        })
      )
      if (!attempt.ran) return
      const result = attempt.value
      if (!result.ok) {
        setNotice({ ok: false, text: result.error ?? t("foodos.caja.movementError") })
        return
      }
      setMovement({ type: movement.type, amount: "", reason: "" })
      await load(branchId)
    } catch (err) {
      setNotice({
        ok: false,
        text: err instanceof Error ? err.message : t("foodos.caja.movementError"),
      })
    } finally {
      setBusy(null)
    }
  }

  async function closeShift() {
    if (!shift) return
    setBusy("close")
    setNotice(null)
    try {
      const attempt = await run(() =>
        closeShiftAction({ shift_id: shift.id, counts, notes })
      )
      if (!attempt.ran) return
      const result = attempt.value
      if (!result.ok) {
        setNotice({ ok: false, text: result.error ?? t("foodos.caja.closeError") })
        return
      }
      setConfirmClose(false)
      setCounts({})
      setNotes("")
      await load(branchId)
    } catch (err) {
      setNotice({
        ok: false,
        text: err instanceof Error ? err.message : t("foodos.caja.closeError"),
      })
    } finally {
      setBusy(null)
    }
  }

  function exportHistory() {
    if (data.history.length === 0) return
    const rows: ShiftHistoryRow[] = data.history.map((s) => ({
      id: s.id,
      status: s.status,
      openedAt: s.opened_at,
      closedAt: s.closed_at,
      openingFloat: s.opening_float,
      declaredCash: s.declared_cash,
      expectedCash: s.expected_cash,
      difference: s.difference,
      arqueo:
        s.status === "closed" && typeof s.difference === "number" ? arqueoStatus(s.difference) : null,
      notes: s.notes,
    }))
    const csv = shiftHistoryCsv(rows)
    downloadCsv(`cortes-${dayKeyOf(DEFAULT_TIMEZONE)}.csv`, toCsv(csv.headers, csv.rows))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-[#0E7A0E]" />
      </div>
    )
  }

  if (!restaurant) {
    return (
      <div className="space-y-6">
        <Header />
        <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
          <Receipt className="w-12 h-12 text-gray-300 mx-auto mb-3" aria-hidden />
          <p className="text-sm text-gray-500">{t("foodos.common.setupTitle")}</p>
          <Link
            href="/panel/foodos/restaurante"
            className="inline-block mt-3 text-[#0E7A0E] font-semibold hover:underline"
          >
            {t("foodos.common.setupTitle")}
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-24">
      <ToolGuideHost
        toolKey="caja"
        pathname="/panel/foodos/caja"
        slug={restaurant.slug}
        icon="💵"
        title={t("foodos.caja.title")}
        subtitle={t("foodos.caja.guideSubtitle")}
      />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <Header />
        <div className="flex items-center gap-2">
          {branches.length > 0 && (
            <select
              aria-label={t("foodos.caja.branch")}
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              className="touch-target rounded-xl border border-gray-200 px-3 py-2 text-sm"
            >
              <option value="">{t("foodos.caja.allBranches")}</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            onClick={refresh}
            disabled={refreshing}
            className="touch-target inline-flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} aria-hidden />
            {refreshing ? t("foodos.caja.refreshing") : t("foodos.caja.refresh")}
          </button>
        </div>
      </div>

      <ToolPreviewNotice feature="pos_mostrador" />

      {notice && (
        <p
          role="status"
          aria-live="polite"
          className={`flex items-start gap-2 rounded-xl border px-4 py-3 text-sm ${
            notice.ok
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {notice.ok ? (
            <Check className="w-4 h-4 mt-0.5 shrink-0" aria-hidden />
          ) : (
            <CircleAlert className="w-4 h-4 mt-0.5 shrink-0" aria-hidden />
          )}
          {notice.text}
        </p>
      )}

      {!shift ? (
        <section className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
              <Lock className="w-5 h-5 text-amber-600" aria-hidden />
            </span>
            <div>
              <h2 className="font-bold text-gray-900">{t("foodos.caja.noShiftTitle")}</h2>
              <p className="text-sm text-gray-500">{t("foodos.caja.noShiftBody")}</p>
            </div>
          </div>

          <Field label={t("foodos.caja.openingFloat")}>
            <input
              value={floatDraft}
              onChange={(e) => setFloatDraft(e.target.value)}
              inputMode="decimal"
              placeholder={t("foodos.caja.openingFloatPlaceholder")}
              className="touch-target w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
            />
          </Field>

          <button
            type="button"
            onClick={openShift}
            disabled={busy === "open"}
            className="touch-target w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-[#0E7A0E] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0b5f0b] disabled:opacity-50"
          >
            {busy === "open" ? (
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
            ) : (
              <LockOpen className="w-4 h-4" aria-hidden />
            )}
            {busy === "open" ? t("foodos.caja.opening") : t("foodos.caja.openAction")}
          </button>

          <p className="text-xs text-gray-400">{t("foodos.caja.openHint")}</p>
        </section>
      ) : (
        <>
          <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard
              label={t("foodos.caja.kpiExpected")}
              value={formatMoney(data.expectedCash)}
              icon={Banknote}
              tone="positive"
            />
            <StatCard
              label={t("foodos.caja.kpiSales")}
              value={formatMoney(data.sales.total)}
              icon={TrendingUp}
            />
            <StatCard
              label={t("foodos.caja.kpiCashSales")}
              value={formatMoney(data.sales.cash)}
              icon={Scale}
            />
            <StatCard
              label={t("foodos.caja.kpiTickets")}
              value={data.sales.count}
              icon={Receipt}
              hint={
                data.sales.count > 0
                  ? `${t("foodos.caja.kpiAverage")}: ${formatMoney(data.sales.total / data.sales.count)}`
                  : undefined
              }
            />
          </section>

          <section className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-bold text-gray-900">{t("foodos.caja.shiftOpenTitle")}</h2>
              <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500">
                <span className="inline-flex items-center gap-1">
                  <CalendarClock className="w-3.5 h-3.5" aria-hidden />
                  {t("foodos.caja.openedAt")}: {formatStamp(shift.opened_at)}
                </span>
                <span>
                  {t("foodos.caja.openedBy")}: {shift.openedByName ?? t("foodos.caja.unknownUser")}
                </span>
                <span>
                  {t("foodos.caja.openingFloat")}: {formatMoney(shift.opening_float)}
                </span>
              </div>
            </div>

            <MovementList movements={data.movements} />

            <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-4 space-y-3">
              <h3 className="text-sm font-bold text-gray-900">{t("foodos.caja.movementsTitle")}</h3>
              <p className="text-xs text-gray-500">{t("foodos.caja.movementsHint")}</p>
              <div className="grid gap-3 sm:grid-cols-4">
                <Field label={t("foodos.caja.movementType")}>
                  <select
                    value={movement.type}
                    onChange={(e) =>
                      setMovement({ ...movement, type: e.target.value === "in" ? "in" : "out" })
                    }
                    className="touch-target w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
                  >
                    <option value="out">{t("foodos.caja.movementOut")}</option>
                    <option value="in">{t("foodos.caja.movementIn")}</option>
                  </select>
                </Field>
                <Field label={t("foodos.caja.movementAmount")}>
                  <input
                    value={movement.amount}
                    onChange={(e) => setMovement({ ...movement, amount: e.target.value })}
                    inputMode="decimal"
                    className="touch-target w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
                  />
                </Field>
                <Field label={t("foodos.caja.movementReason")}>
                  <input
                    value={movement.reason}
                    onChange={(e) => setMovement({ ...movement, reason: e.target.value })}
                    placeholder={t("foodos.caja.movementReasonPlaceholder")}
                    className="touch-target w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
                  />
                </Field>
                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={addMovement}
                    disabled={busy === "movement"}
                    className="touch-target w-full inline-flex items-center justify-center gap-2 rounded-xl border border-[#0E7A0E] px-3 py-2 text-sm font-semibold text-[#0E7A0E] hover:bg-emerald-50 disabled:opacity-50"
                  >
                    {busy === "movement" ? (
                      <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
                    ) : (
                      <ArrowDownCircle className="w-4 h-4" aria-hidden />
                    )}
                    {busy === "movement"
                      ? t("foodos.caja.movementAdding")
                      : t("foodos.caja.movementAdd")}
                  </button>
                </div>
              </div>
            </div>
          </section>

          <section className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
            <div>
              <h2 className="font-bold text-gray-900">{t("foodos.caja.closeTitle")}</h2>
              <p className="text-sm text-gray-500">{t("foodos.caja.closeHint")}</p>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">
                {t("foodos.caja.closeCounts")}
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                {MXN_DENOMINATIONS.map((d) => (
                  <label
                    key={d.value}
                    className="flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2"
                  >
                    <span className="w-14 text-sm font-semibold text-gray-700">{d.label}</span>
                    <span className="text-xs text-gray-400">×</span>
                    <input
                      value={counts[String(d.value)] ? String(counts[String(d.value)]) : ""}
                      onChange={(e) => {
                        const pieces = Number.parseInt(e.target.value, 10)
                        setCounts((current) => ({
                          ...current,
                          [String(d.value)]: Number.isFinite(pieces) && pieces > 0 ? pieces : 0,
                        }))
                      }}
                      inputMode="numeric"
                      aria-label={`${d.label} — ${t("foodos.caja.closePieces")}`}
                      className="touch-target w-full min-w-0 rounded-lg border border-gray-200 px-2 py-1.5 text-sm text-right"
                    />
                  </label>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setCounts({})}
                className="touch-target mt-2 text-xs font-semibold text-gray-500 hover:text-gray-700"
              >
                {t("foodos.caja.closeClear")}
              </button>
            </div>

            {preview && (
              <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-4 space-y-2">
                <Row
                  label={t("foodos.caja.closeExpected")}
                  value={formatMoney(preview.expectedCash)}
                />
                <Row
                  label={t("foodos.caja.closeDeclared")}
                  value={formatMoney(preview.declaredCash)}
                />
                <div className="flex items-center justify-between gap-3 pt-2 border-t border-gray-200">
                  <span className="text-sm font-semibold text-gray-700">
                    {t("foodos.caja.closeDifference")}
                  </span>
                  <span className={`text-lg font-bold ${differenceTone(preview.status)}`}>
                    {formatMoney(preview.difference)} · {arqueoText(preview.status)}
                  </span>
                </div>
              </div>
            )}

            <Field label={t("foodos.caja.closeNotes")}>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder={t("foodos.caja.closeNotesPlaceholder")}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
              />
            </Field>

            <button
              type="button"
              onClick={() => setConfirmClose(true)}
              disabled={busy === "close"}
              className="touch-target w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-[#0E7A0E] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0b5f0b] disabled:opacity-50"
            >
              <Scale className="w-4 h-4" aria-hidden />
              {t("foodos.caja.closeAction")}
            </button>
          </section>
        </>
      )}

      <HistorySection rows={data.history} onExport={exportHistory} />

      <BottomSheet
        open={confirmClose}
        onClose={() => setConfirmClose(false)}
        ariaLabel={t("foodos.caja.closeConfirmTitle")}
      >
        <div className="p-5 space-y-4">
          <h2 className="text-lg font-bold text-gray-900">{t("foodos.caja.closeConfirmTitle")}</h2>
          <p className="text-sm text-gray-500">{t("foodos.caja.closeConfirmBody")}</p>
          {preview && (
            <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-4 space-y-2">
              <Row
                label={t("foodos.caja.closeDeclared")}
                value={formatMoney(preview.declaredCash)}
              />
              <Row
                label={t("foodos.caja.closeExpected")}
                value={formatMoney(preview.expectedCash)}
              />
              <div className="flex items-center justify-between pt-2 border-t border-gray-200">
                <span className="text-sm font-semibold text-gray-700">
                  {t("foodos.caja.closeDifference")}
                </span>
                <span className={`text-base font-bold ${differenceTone(preview.status)}`}>
                  {formatMoney(preview.difference)} · {arqueoText(preview.status)}
                </span>
              </div>
            </div>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setConfirmClose(false)}
              className="touch-target flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              {t("common.cancel")}
            </button>
            <button
              type="button"
              onClick={closeShift}
              disabled={busy === "close"}
              className="touch-target flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-[#0E7A0E] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0b5f0b] disabled:opacity-50"
            >
              {busy === "close" && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />}
              {busy === "close" ? t("foodos.caja.closing") : t("foodos.caja.closeAction")}
            </button>
          </div>
        </div>
      </BottomSheet>

      {upsellDialog}
    </div>
  )
}

// ------------------------------------------------------------

function movementsTotals(movements: CajaMovement[]): { cashIn: number; cashOut: number } {
  let cashIn = 0
  let cashOut = 0
  for (const m of movements) {
    if (m.type === "in") cashIn += m.amount
    else cashOut += m.amount
  }
  return { cashIn, cashOut }
}

function arqueoText(status: ArqueoStatus): string {
  if (status === "ok") return t("foodos.caja.arqueoOk")
  return status === "short" ? t("foodos.caja.arqueoShort") : t("foodos.caja.arqueoOver")
}

function differenceTone(status: ArqueoStatus): string {
  if (status === "ok") return "text-[#0E7A0E]"
  return status === "short" ? "text-red-600" : "text-amber-600"
}

function formatStamp(iso: string | null): string {
  if (!iso) return t("foodos.caja.unknownUser")
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) return t("foodos.caja.unknownUser")
  return new Date(ms).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" })
}

function Header() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">{t("foodos.caja.title")}</h1>
      <p className="text-sm text-gray-500 mt-1">{t("foodos.caja.subtitle")}</p>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-semibold text-gray-600">{label}</span>
      {children}
    </label>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-gray-500">{label}</span>
      <span className="font-semibold text-gray-900">{value}</span>
    </div>
  )
}

function MovementList({ movements }: { movements: CajaMovement[] }) {
  if (movements.length === 0) {
    return <p className="text-sm text-gray-400">{t("foodos.caja.movementsEmpty")}</p>
  }
  return (
    <ul className="divide-y divide-gray-100 rounded-xl border border-gray-100">
      {movements.map((m) => (
        <li key={m.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
          <span className="inline-flex items-center gap-2 text-sm text-gray-700">
            {m.type === "in" ? (
              <ArrowUpCircle className="w-4 h-4 text-emerald-600" aria-hidden />
            ) : (
              <ArrowDownCircle className="w-4 h-4 text-red-500" aria-hidden />
            )}
            {m.type === "in" ? t("foodos.caja.movementIn") : t("foodos.caja.movementOut")}
            {m.reason ? <span className="text-gray-400">· {m.reason}</span> : null}
          </span>
          <span className="text-right">
            <span
              className={`block text-sm font-semibold ${
                m.type === "in" ? "text-emerald-700" : "text-red-600"
              }`}
            >
              {m.type === "in" ? "+" : "−"}
              {formatMoney(m.amount)}
            </span>
            <span className="block text-xs text-gray-400">{formatStamp(m.created_at)}</span>
          </span>
        </li>
      ))}
    </ul>
  )
}

function HistorySection({
  rows,
  onExport,
}: {
  rows: CajaData["history"]
  onExport: () => void
}) {
  return (
    <section className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-bold text-gray-900">{t("foodos.caja.historyTitle")}</h2>
          <p className="text-sm text-gray-500">{t("foodos.caja.historyHint")}</p>
        </div>
        <button
          type="button"
          onClick={onExport}
          disabled={rows.length === 0}
          className="touch-target inline-flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {t("foodos.caja.historyExport")}
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-gray-400">{t("foodos.caja.historyEmpty")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500">
                <th className="py-2 pr-3 font-semibold">{t("foodos.caja.historyShift")}</th>
                <th className="py-2 pr-3 font-semibold">{t("foodos.caja.historyStatus")}</th>
                <th className="py-2 pr-3 font-semibold">{t("foodos.caja.historyOpened")}</th>
                <th className="py-2 pr-3 font-semibold">{t("foodos.caja.historyOpeningFloat")}</th>
                <th className="py-2 pr-3 font-semibold">{t("foodos.caja.historyExpected")}</th>
                <th className="py-2 pr-3 font-semibold">{t("foodos.caja.historyDeclared")}</th>
                <th className="py-2 pr-3 font-semibold">{t("foodos.caja.historyDifference")}</th>
                <th className="py-2 pr-3 font-semibold">{t("foodos.caja.historyArqueo")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((s) => {
                const status =
                  s.status === "closed" && typeof s.difference === "number"
                    ? arqueoStatus(s.difference)
                    : null
                return (
                  <tr key={s.id}>
                    <td className="py-2 pr-3 font-mono text-xs text-gray-500">
                      {s.id.slice(0, 8).toUpperCase()}
                    </td>
                    <td className="py-2 pr-3">
                      {s.status === "open"
                        ? t("foodos.caja.statusOpen")
                        : t("foodos.caja.statusClosed")}
                    </td>
                    <td className="py-2 pr-3 text-gray-500">{formatStamp(s.opened_at)}</td>
                    <td className="py-2 pr-3">{formatMoney(s.opening_float)}</td>
                    <td className="py-2 pr-3">
                      {typeof s.expected_cash === "number" ? formatMoney(s.expected_cash) : "—"}
                    </td>
                    <td className="py-2 pr-3">
                      {typeof s.declared_cash === "number" ? formatMoney(s.declared_cash) : "—"}
                    </td>
                    <td
                      className={`py-2 pr-3 font-semibold ${status ? differenceTone(status) : ""}`}
                    >
                      {typeof s.difference === "number" ? formatMoney(s.difference) : "—"}
                    </td>
                    <td className="py-2 pr-3">
                      {status ? arqueoText(status) : "—"}
                      {s.closedByName ? (
                        <span className="block text-xs text-gray-400">{s.closedByName}</span>
                      ) : null}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
