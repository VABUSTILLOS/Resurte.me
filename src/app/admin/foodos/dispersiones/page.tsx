"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { Download, Loader2, Landmark, AlertTriangle } from "lucide-react"
import {
  getFoodosPayoutReport,
  type PayoutReport,
  type PayoutRestaurantRow,
} from "@/lib/foodos/actions/payouts-admin"
import {
  CUSTODY_HELP,
  CUSTODY_LABEL,
  CUSTODY_TONE,
  CONNECT_STATE_LABEL,
  formatPayoutAmount,
  formatOutstanding,
} from "@/lib/foodos-payouts"
import { toCsv, downloadCsv } from "@/lib/csv"
import { DEFAULT_TIMEZONE, dayKeyOf } from "@/lib/local-date"
import { useToast } from "@/components/toast"
import { RecordPayoutDialog } from "./payout-forms"
import { PlatformFeeEditor } from "./fee-editor"

/**
 * /admin/foodos/dispersiones — cuánto se le debe a cada restaurante FoodOS y
 * qué ya se le dispersó.
 *
 * Existe por la decisión C.2 del plan de mejoras. `STRIPE_CONNECT_ENABLED` no
 * está configurada en producción, así que `buildDestinationChargeParams()`
 * devuelve `{}`: el cargo se hace contra la cuenta de Resurte.me y el 100 % del
 * dinero con tarjeta de los micrositios queda en custodia de la plataforma, con
 * comisión 0. Eso hay que transferirlo a mano.
 *
 * Hasta 00157 no había dónde anotarlo. Esta pantalla cierra las tres
 * consecuencias de esa omisión:
 *
 *   1. La obligación se calcula: `foodos_payout_balances()` devuelve el saldo
 *      pendiente por restaurante, y es la única definición de «cuánto se le
 *      debe». La pantalla no lo recalcula, lo lee.
 *   2. La obligación se liquida: se registra la transferencia con su
 *      comprobante, y el saldo baja.
 *   3. La comisión retenida queda registrada por dispersión, porque lo que se
 *      retuvo es un hecho y no una tasa.
 *
 * El banner de arriba no es decorativo: mientras Connect esté apagado, este es
 * el único lugar donde se ve que hay dinero de terceros en la cuenta.
 */
export default function AdminFoodosPayoutsPage() {
  const { toast } = useToast()
  const [report, setReport] = useState<PayoutReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [target, setTarget] = useState<PayoutRestaurantRow | null>(null)

  const fetchReport = useCallback(() => getFoodosPayoutReport(), [])

  // El efecto no toca estado de forma síncrona: encadena la promesa y sólo
  // escribe cuando ya resolvió (react-hooks/set-state-in-effect).
  useEffect(() => {
    let cancelled = false
    fetchReport()
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
  }, [fetchReport])

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchReport()
      setReport(data)
      setError(null)
    } catch (e) {
      setReport(null)
      setError(e instanceof Error ? e.message : "Error al cargar")
    } finally {
      setLoading(false)
    }
  }, [fetchReport])

  function exportCsv() {
    if (!report) return
    const rows: (string | number)[][] = report.restaurants.map((r) => [
      r.restaurantName,
      r.restaurantSlug,
      CUSTODY_LABEL[r.custody],
      CONNECT_STATE_LABEL[r.connectState],
      r.grossCollected.toFixed(2),
      String(r.custodyOrderCount),
      r.settledTotal.toFixed(2),
      r.feeTotal.toFixed(2),
      r.outstanding.toFixed(2),
      String(r.payoutCount),
      r.lastPayoutAt ? r.lastPayoutAt.slice(0, 10) : "",
    ])
    const csv = toCsv(
      [
        "Restaurante",
        "Slug",
        "Custodia",
        "Cuenta Stripe",
        "Cobrado en custodia",
        "Pedidos",
        "Dispersado",
        "Comisión retenida",
        "Saldo pendiente",
        "Dispersiones",
        "Última dispersión",
      ],
      rows
    )
    downloadCsv(`dispersiones-foodos-${dayKeyOf(DEFAULT_TIMEZONE)}.csv`, csv)
  }

  const summary = report?.summary

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-gray-900 flex items-center justify-center">
            <Landmark className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Dispersiones FoodOS</h1>
            <p className="text-sm text-gray-500">
              Dinero con tarjeta de los micrositios, en custodia de la plataforma
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={exportCsv}
          disabled={!report || report.restaurants.length === 0}
          className="inline-flex items-center gap-1.5 rounded-full bg-white border border-gray-200 px-3.5 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          <Download className="w-3.5 h-3.5" />
          Exportar CSV
        </button>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-24 text-gray-400 text-sm">
          <Loader2 className="w-4 h-4 animate-spin mr-2" />
          Cargando dispersiones…
        </div>
      )}

      {error && !loading && (
        <div
          role="alert"
          className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-600"
        >
          {error}
        </div>
      )}

      {report && !loading && (
        <>
          {!report.routingEnabled && (
            <div className="mb-6 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
              <AlertTriangle className="w-5 h-5 shrink-0 text-amber-600" aria-hidden="true" />
              <div className="text-sm text-amber-800">
                <p className="font-semibold">
                  Stripe Connect está apagado: todo el dinero cae en Resurte.me.
                </p>
                <p className="mt-1">
                  La comisión de plataforma configurada es {report.defaultFeePercent}%. Mientras
                  Connect siga apagado, cada restaurante depende de que se le transfiera a mano y
                  de que esa transferencia quede registrada aquí. El estado completo de la
                  integración se ve en{" "}
                  <Link href="/admin/sistema" className="font-semibold underline">
                    Sistema
                  </Link>
                  .
                </p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <Stat
              label="Pendiente de dispersar"
              value={formatPayoutAmount(summary?.outstanding ?? 0)}
              highlight={(summary?.outstanding ?? 0) > 0}
            />
            <Stat label="Cobrado en custodia" value={formatPayoutAmount(summary?.grossCollected ?? 0)} />
            <Stat label="Ya dispersado" value={formatPayoutAmount(summary?.settledTotal ?? 0)} />
            <Stat
              label="Comisión retenida"
              value={formatPayoutAmount(summary?.feeTotal ?? 0)}
              small
            />
          </div>

          {(summary?.overpaid ?? 0) > 0 && (
            <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {summary?.overpaid} restaurante{(summary?.overpaid ?? 0) === 1 ? "" : "s"} con saldo
              negativo ({formatPayoutAmount(summary?.overpaidAmount ?? 0)}): se les dispersó más de
              lo cobrado. Se corrige con una dispersión negativa explicada, no editando el
              historial.
            </div>
          )}

          <section className="mb-8">
            <h2 className="text-sm font-semibold text-gray-900 mb-2">Saldo por restaurante</h2>
            {report.restaurants.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-sm text-gray-400">
                Todavía no hay restaurantes FoodOS.
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-left text-xs text-gray-400 font-medium">
                        <th className="px-5 py-3">Restaurante</th>
                        <th className="px-5 py-3">Custodia</th>
                        <th className="px-5 py-3 text-right">Cobrado</th>
                        <th className="px-5 py-3 text-right">Dispersado</th>
                        <th className="px-5 py-3 text-right">Comisión</th>
                        <th className="px-5 py-3 text-right">Pendiente</th>
                        <th className="px-5 py-3" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {report.restaurants.map((r) => (
                        <tr key={r.restaurantId} className="hover:bg-gray-50 transition-colors">
                          <td className="px-5 py-3">
                            <p className="font-medium text-gray-900">{r.restaurantName}</p>
                            <p className="text-xs text-gray-400">
                              {CONNECT_STATE_LABEL[r.connectState]}
                              {r.requirementsDue > 0 ? ` · ${r.requirementsDue} requisitos` : ""}
                            </p>
                          </td>
                          <td className="px-5 py-3">
                            <span
                              className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${CUSTODY_TONE[r.custody]}`}
                              title={CUSTODY_HELP[r.custody]}
                            >
                              {CUSTODY_LABEL[r.custody]}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-right text-gray-700">
                            {formatPayoutAmount(r.grossCollected)}
                            {r.custodyOrderCount > 0 && (
                              <span className="block text-xs text-gray-400">
                                {r.custodyOrderCount} pedido{r.custodyOrderCount === 1 ? "" : "s"}
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-3 text-right text-gray-700">
                            {formatPayoutAmount(r.settledTotal)}
                            {r.payoutCount > 0 && (
                              <span className="block text-xs text-gray-400">
                                {r.payoutCount} dispersi{r.payoutCount === 1 ? "ón" : "ones"}
                                {r.lastPayoutAt ? ` · ${r.lastPayoutAt.slice(0, 10)}` : ""}
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-3 text-right text-gray-500">
                            {formatPayoutAmount(r.feeTotal)}
                            <span className="block mt-1">
                              <PlatformFeeEditor
                                restaurantId={r.restaurantId}
                                restaurantName={r.restaurantName}
                                feePercent={r.platformFeePercent}
                                onSaved={() => void reload()}
                              />
                            </span>
                          </td>
                          <td className="px-5 py-3 text-right">
                            <span
                              className={`font-semibold ${
                                r.outstanding > 0
                                  ? "text-brand-600"
                                  : r.outstanding < 0
                                    ? "text-red-600"
                                    : "text-gray-400"
                              }`}
                            >
                              {formatOutstanding(r.outstanding)}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-right">
                            <button
                              type="button"
                              onClick={() => setTarget(r)}
                              disabled={r.outstanding <= 0}
                              className="inline-flex items-center gap-1.5 rounded-full bg-gray-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-gray-800 transition-colors disabled:opacity-40"
                            >
                              Dispersar
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

          <section>
            <div className="flex items-baseline justify-between gap-3 mb-2">
              <h2 className="text-sm font-semibold text-gray-900">Historial</h2>
              {report.historyTruncated && (
                <p className="text-xs text-amber-600">
                  Se muestran las últimas {report.history.length} dispersiones.
                </p>
              )}
            </div>
            {report.history.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-sm text-gray-400">
                Todavía no se ha registrado ninguna dispersión.
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-left text-xs text-gray-400 font-medium">
                        <th className="px-5 py-3">Fecha</th>
                        <th className="px-5 py-3">Restaurante</th>
                        <th className="px-5 py-3">Periodo</th>
                        <th className="px-5 py-3">Comprobante</th>
                        <th className="px-5 py-3 text-right">Monto</th>
                        <th className="px-5 py-3 text-right">Comisión</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {report.history.map((p) => (
                        <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-5 py-3 text-gray-500">
                            {p.paidAt.slice(0, 10)}
                            {p.actorEmail && (
                              <span className="block text-xs text-gray-400">{p.actorEmail}</span>
                            )}
                          </td>
                          <td className="px-5 py-3 font-medium text-gray-900">
                            {p.restaurantName}
                          </td>
                          <td className="px-5 py-3 text-gray-500">
                            {p.periodLabel}
                            {p.notes && (
                              <span className="block text-xs text-gray-400">{p.notes}</span>
                            )}
                          </td>
                          <td className="px-5 py-3 text-gray-600">{p.reference}</td>
                          <td
                            className={`px-5 py-3 text-right font-semibold ${
                              p.settledAmount < 0 ? "text-red-600" : "text-gray-900"
                            }`}
                          >
                            {formatPayoutAmount(p.settledAmount)}
                          </td>
                          <td className="px-5 py-3 text-right text-gray-500">
                            {formatPayoutAmount(p.feeAmount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        </>
      )}

      <RecordPayoutDialog
        target={target}
        onClose={() => setTarget(null)}
        onDone={() => {
          toast("Dispersión registrada")
          setTarget(null)
          void reload()
        }}
      />
    </div>
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
        className={`${small ? "text-lg font-semibold" : "text-2xl font-bold"} ${
          highlight ? "text-brand-600" : "text-gray-900"
        }`}
      >
        {value}
      </p>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
    </div>
  )
}
