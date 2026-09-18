"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Wallet, Download, Loader2, ChevronDown, Receipt, Ban, SlidersHorizontal, Check } from "lucide-react"
import {
  getCommissionLedger,
  type CommissionCandidateRow,
  type CommissionLedgerReport,
  type CommissionPeriodRow,
} from "@/lib/comercializacion/actions/commissions-admin"
import {
  formatPeriodLabel,
  recentMonthKeys,
} from "@/lib/comercializacion/commission-ledger"
import { formatMoney } from "@/lib/comercializacion/commissions"
import { toCsv, downloadCsv } from "@/lib/csv"
import { DEFAULT_TIMEZONE, dayKeyOf } from "@/lib/local-date"
import { useToast } from "@/components/toast"
import ConfirmDialog from "@/components/panel/ConfirmDialog"
import {
  AdjustCommissionDialog,
  CancelCommissionDialog,
  PayCommissionDialog,
} from "./commission-forms"

/**
 * /admin/comisiones — ledger de comisiones por vendedor.
 *
 * Antes esta pantalla solo estimaba: multiplicaba ventas pagadas por la tasa
 * y no guardaba nada, así que no podía responder la única pregunta que
 * importa —«¿ya le pagué?»—. Ahora lee `commission_periods` (00155): el monto
 * devengado lo calcula la base, cada periodo tiene estado, y pagar exige
 * referencia.
 *
 * Se separan a propósito dos listas:
 *   · Pendientes de devengar — a quién todavía no se le abrió periodo.
 *   · Ledger del mes — los periodos ya devengados, con su estado y acciones.
 *
 * La comisión de los pendientes es una estimación en JS; el monto que se paga
 * lo fija la base al devengar. Si no coinciden, manda el de la base.
 */
type DialogTarget = { kind: "pay" | "cancel" | "adjust"; period: CommissionPeriodRow } | null

export default function AdminComisionesPage() {
  const { toast } = useToast()
  const months = useMemo(() => recentMonthKeys(12), [])
  const [month, setMonth] = useState(months[0] ?? "")
  const [report, setReport] = useState<CommissionLedgerReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busySeller, setBusySeller] = useState<string | null>(null)
  const [dialog, setDialog] = useState<DialogTarget>(null)
  const [expanded, setExpanded] = useState<number | null>(null)
  const [confirmAccrue, setConfirmAccrue] = useState<CommissionCandidateRow | null>(null)

  const fetchLedger = useCallback(() => getCommissionLedger(month), [month])

  // El efecto no toca estado de forma síncrona: encadena la promesa y sólo
  // escribe cuando ya resolvió (react-hooks/set-state-in-effect).
  useEffect(() => {
    let cancelled = false
    fetchLedger()
      .then((data) => {
        if (cancelled) return
        setReport(data)
        setError(null)
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setReport(null)
        setError(e instanceof Error ? e.message : "Error al cargar")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [fetchLedger])

  /** Recarga desde un manejador (tras mutar), donde sí se puede marcar carga. */
  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchLedger()
      setReport(data)
      setError(null)
    } catch (e) {
      setReport(null)
      setError(e instanceof Error ? e.message : "Error al cargar")
    } finally {
      setLoading(false)
    }
  }, [fetchLedger])

  async function accrue(candidate: CommissionCandidateRow) {
    setBusySeller(candidate.sellerId)
    try {
      const res = await fetch("/api/admin/comisiones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sellerId: candidate.sellerId, month }),
      })
      const payload = (await res.json().catch(() => null)) as { error?: string } | null
      if (!res.ok) {
        toast(payload?.error ?? "No se pudo devengar", "error")
        return
      }
      toast(`Periodo de ${candidate.sellerName} devengado`)
      await reload()
    } catch {
      toast("No se pudo conectar con el servidor", "error")
    } finally {
      setBusySeller(null)
    }
  }

  function exportCsv() {
    if (!report) return
    const rows: (string | number)[][] = report.periods.map((p) => [
      p.sellerName,
      p.periodStart,
      p.periodEnd,
      p.status,
      p.revenue.toFixed(2),
      String(p.orderCount),
      (p.rate * 100).toFixed(2),
      p.adjustments.toFixed(2),
      p.amountDue.toFixed(2),
      p.paymentReference ?? "",
      p.paidAt ? p.paidAt.slice(0, 10) : "",
    ])
    const csv = toCsv(
      [
        "Vendedor",
        "Periodo desde",
        "Periodo hasta",
        "Estado",
        "Ventas",
        "Pedidos",
        "Tasa %",
        "Ajustes",
        "Monto a pagar",
        "Referencia",
        "Pagado el",
      ],
      rows
    )
    downloadCsv(`comisiones-${report.month}-${dayKeyOf(DEFAULT_TIMEZONE)}.csv`, csv)
  }

  const summary = report?.summary
  const hasAnyPeriod = (report?.periods.length ?? 0) > 0
  const hasAnyCandidate = (report?.candidates.length ?? 0) > 0

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-gray-900 flex items-center justify-center">
            <Wallet className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Comisiones</h1>
            <p className="text-sm text-gray-500">
              Ledger de pagos por vendedor
              {report ? ` · tasa ${(report.rate * 100).toFixed(0)}%` : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label className="sr-only" htmlFor="commission-month">
            Mes
          </label>
          <select
            id="commission-month"
            value={month}
            onChange={(e) => {
              setLoading(true)
              setMonth(e.target.value)
            }}
            className="rounded-full border border-gray-200 bg-white px-3.5 py-2 text-xs font-semibold text-gray-700"
          >
            {months.map((key) => (
              <option key={key} value={key}>
                {formatPeriodLabel(`${key}-01`)}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={exportCsv}
            disabled={!hasAnyPeriod}
            className="inline-flex items-center gap-1.5 rounded-full bg-white border border-gray-200 px-3.5 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            Exportar CSV
          </button>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-24 text-gray-600 text-sm">
          <Loader2 className="w-4 h-4 animate-spin mr-2" />
          Cargando comisiones…
        </div>
      )}

      {error && !loading && (
        <div role="alert" className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {report && !loading && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <Stat label="Por pagar" value={formatMoney(summary?.devengadaAmount ?? 0)} highlight />
            <Stat label="Pagado en el mes" value={formatMoney(summary?.pagadaAmount ?? 0)} />
            <Stat label="Ventas que comisionan" value={formatMoney(summary?.revenueTotal ?? 0)} />
            <Stat
              label="Periodos"
              value={`${summary?.devengadaCount ?? 0} por pagar · ${summary?.pagadaCount ?? 0} pagados${
                summary?.canceladaCount ? ` · ${summary.canceladaCount} cancelados` : ""
              }`}
              small
            />
          </div>

          {/* Pendientes de devengar */}
          <section className="mb-6">
            <h2 className="text-sm font-semibold text-gray-900 mb-2">Pendientes de devengar</h2>
            {!hasAnyCandidate ? (
              <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-sm text-gray-500">
                {hasAnyPeriod
                  ? "Todos los vendedores con ventas este mes ya tienen periodo devengado."
                  : "No hay ventas de clientes vinculados en este mes."}
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-left text-xs text-gray-500 font-medium">
                        <th className="px-5 py-3">Vendedor</th>
                        <th className="px-5 py-3 text-right">Clientes</th>
                        <th className="px-5 py-3 text-right">Pedidos</th>
                        <th className="px-5 py-3 text-right">Ventas del mes</th>
                        <th className="px-5 py-3 text-right">Comisión estimada</th>
                        <th className="px-5 py-3" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {report.candidates.map((c) => (
                        <tr key={c.sellerId} className="hover:bg-gray-50 transition-colors">
                          <td className="px-5 py-3">
                            <p className="font-medium text-gray-900">{c.sellerName}</p>
                            {c.sellerPhone && <p className="text-xs text-gray-600">{c.sellerPhone}</p>}
                          </td>
                          <td className="px-5 py-3 text-right text-gray-500">{c.linkedClients}</td>
                          <td className="px-5 py-3 text-right text-gray-500">{c.monthOrderCount}</td>
                          <td className="px-5 py-3 text-right text-gray-700">{formatMoney(c.monthRevenue)}</td>
                          <td className="px-5 py-3 text-right font-semibold text-brand-600">
                            {formatMoney(c.monthCommission)}
                          </td>
                          <td className="px-5 py-3 text-right">
                            <button
                              type="button"
                              onClick={() => setConfirmAccrue(c)}
                              disabled={busySeller !== null}
                              className="inline-flex items-center gap-1.5 rounded-full bg-gray-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-gray-800 transition-colors disabled:opacity-50"
                            >
                              {busySeller === c.sellerId ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Check className="w-3.5 h-3.5" />
                              )}
                              Devengar
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>

          {/* Ledger del mes */}
          <section>
            <h2 className="text-sm font-semibold text-gray-900 mb-2">
              Ledger de {formatPeriodLabel(report.range.periodStart)}
            </h2>
            {!hasAnyPeriod ? (
              <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-sm text-gray-500">
                Todavía no hay periodos devengados en {formatPeriodLabel(report.range.periodStart)}.
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-left text-xs text-gray-500 font-medium">
                        <th className="px-5 py-3">Vendedor</th>
                        <th className="px-5 py-3">Estado</th>
                        <th className="px-5 py-3 text-right">Ventas</th>
                        <th className="px-5 py-3 text-right">Pedidos</th>
                        <th className="px-5 py-3 text-right">Tasa</th>
                        <th className="px-5 py-3 text-right">Ajustes</th>
                        <th className="px-5 py-3 text-right">A pagar</th>
                        <th className="px-5 py-3 text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {report.periods.map((p) => (
                        <PeriodRow
                          key={p.id}
                          period={p}
                          expanded={expanded === p.id}
                          onToggle={() => setExpanded(expanded === p.id ? null : p.id)}
                          onAction={(kind) => setDialog({ kind, period: p })}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        </>
      )}

      <PayCommissionDialog
        period={dialog?.kind === "pay" ? dialog.period : null}
        onClose={() => setDialog(null)}
        onDone={() => {
          setDialog(null)
          toast("Pago registrado")
          void reload()
        }}
      />
      <CancelCommissionDialog
        period={dialog?.kind === "cancel" ? dialog.period : null}
        onClose={() => setDialog(null)}
        onDone={() => {
          setDialog(null)
          toast("Periodo cancelado")
          void reload()
        }}
      />
      <AdjustCommissionDialog
        period={dialog?.kind === "adjust" ? dialog.period : null}
        onClose={() => setDialog(null)}
        onDone={() => {
          setDialog(null)
          toast("Ajuste registrado")
          void reload()
        }}
      />
      <ConfirmDialog
        open={confirmAccrue !== null}
        title="Devengar periodo"
        message={
          confirmAccrue
            ? `Se calculará la comisión de ${confirmAccrue.sellerName} para ${formatPeriodLabel(
                report?.range.periodStart ?? ""
              )} con la tasa vigente (${((report?.rate ?? 0) * 100).toFixed(0)}%). El monto lo fija la base; la estimación en pantalla es solo referencial.`
            : undefined
        }
        confirmLabel="Devengar"
        onConfirm={() => {
          const target = confirmAccrue
          setConfirmAccrue(null)
          if (target) void accrue(target)
        }}
        onCancel={() => setConfirmAccrue(null)}
      />
    </div>
  )
}

const STATUS_STYLE: Record<string, string> = {
  devengada: "bg-amber-50 text-amber-700 border-amber-200",
  pagada: "bg-emerald-50 text-emerald-700 border-emerald-200",
  cancelada: "bg-gray-100 text-gray-500 border-gray-200",
}

const STATUS_LABEL: Record<string, string> = {
  devengada: "Por pagar",
  pagada: "Pagada",
  cancelada: "Cancelada",
}

function PeriodRow({
  period,
  expanded,
  onToggle,
  onAction,
}: {
  period: CommissionPeriodRow
  expanded: boolean
  onToggle: () => void
  onAction: (kind: "pay" | "cancel" | "adjust") => void
}) {
  const open = period.status === "devengada"
  return (
    <>
      <tr className="hover:bg-gray-50 transition-colors">
        <td className="px-5 py-3">
          <p className="font-medium text-gray-900">{period.sellerName}</p>
          {period.sellerPhone && <p className="text-xs text-gray-600">{period.sellerPhone}</p>}
        </td>
        <td className="px-5 py-3">
          <span
            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
              STATUS_STYLE[period.status] ?? STATUS_STYLE.devengada
            }`}
          >
            {STATUS_LABEL[period.status] ?? period.status}
          </span>
          {period.paymentReference && (
            <p className="text-xs text-gray-600 mt-1">{period.paymentReference}</p>
          )}
        </td>
        <td className="px-5 py-3 text-right text-gray-700">{formatMoney(period.revenue)}</td>
        <td className="px-5 py-3 text-right text-gray-500">{period.orderCount}</td>
        <td className="px-5 py-3 text-right text-gray-500">{(period.rate * 100).toFixed(0)}%</td>
        <td className="px-5 py-3 text-right text-gray-500">
          {period.adjustments === 0 ? (
            "—"
          ) : (
            <button
              type="button"
              onClick={onToggle}
              className="inline-flex items-center gap-1 text-gray-600 hover:text-gray-900 underline decoration-dotted"
            >
              {formatMoney(period.adjustments)}
              <ChevronDown className={`w-3 h-3 transition-transform ${expanded ? "rotate-180" : ""}`} />
            </button>
          )}
        </td>
        <td className="px-5 py-3 text-right font-semibold text-gray-900">
          {formatMoney(period.amountDue)}
        </td>
        <td className="px-5 py-3">
          <div className="flex items-center justify-end gap-1.5">
            {open ? (
              <>
                <button
                  type="button"
                  onClick={() => onAction("pay")}
                  className="inline-flex items-center gap-1 rounded-full bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 transition-colors"
                >
                  <Receipt className="w-3.5 h-3.5" />
                  Pagar
                </button>
                <button
                  type="button"
                  onClick={() => onAction("adjust")}
                  className="inline-flex items-center gap-1 rounded-full border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  Ajustar
                </button>
                <button
                  type="button"
                  onClick={() => onAction("cancel")}
                  className="inline-flex items-center gap-1 rounded-full border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-500 hover:bg-red-50 hover:text-red-700 hover:border-red-200 transition-colors"
                >
                  <Ban className="w-3.5 h-3.5" />
                  Cancelar
                </button>
              </>
            ) : (
              <span className="text-xs text-gray-600">
                {period.status === "pagada" ? "Cerrado" : "Anulado"}
              </span>
            )}
          </div>
        </td>
      </tr>
      {expanded && period.movements.length > 0 && (
        <tr className="bg-gray-50/60">
          <td colSpan={8} className="px-5 py-3">
            <p className="text-xs font-semibold text-gray-500 mb-1.5">Movimientos</p>
            <ul className="space-y-1">
              {period.movements.map((m) => (
                <li key={m.id} className="flex items-baseline justify-between gap-3 text-xs">
                  <span className="text-gray-600">{m.reason}</span>
                  <span className="text-gray-600">
                    {m.createdAt.slice(0, 10)} ·{" "}
                    <strong className={m.amount < 0 ? "text-red-700" : "text-gray-900"}>
                      {m.amount > 0 ? "+" : ""}
                      {formatMoney(m.amount)}
                    </strong>
                  </span>
                </li>
              ))}
            </ul>
          </td>
        </tr>
      )}
    </>
  )
}

function Stat({
  label,
  value,
  highlight = false,
  small = false,
}: {
  label: string
  value: string
  highlight?: boolean
  small?: boolean
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <p
        className={`${small ? "text-sm font-semibold" : "text-2xl font-bold"} ${
          highlight ? "text-brand-600" : "text-gray-900"
        }`}
      >
        {value}
      </p>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
    </div>
  )
}
