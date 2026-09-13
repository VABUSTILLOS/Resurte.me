"use client"

import { useEffect, useState } from "react"
import { Wallet, Download, Loader2 } from "lucide-react"
import { getAdminCommissions, type CommissionsReport } from "@/lib/comercializacion/actions/commissions-admin"
import { formatMoney } from "@/lib/comercializacion/commissions"
import { toCsv, downloadCsv } from "@/lib/csv"

/**
 * /admin/comisiones — reporte de comisiones por vendedor (B4).
 *
 * Vista agregada que el admin no tenía: cada vendedor ve su comisión en su
 * propio dashboard; aquí el admin ve a todos, con ventas de sus clientes
 * vinculados (semana/mes), comisión estimada y exportación CSV.
 */
export default function AdminComisionesPage() {
  const [report, setReport] = useState<CommissionsReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getAdminCommissions()
      .then((r) => {
        if (!cancelled) setReport(r)
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Error al cargar")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  function exportCsv() {
    if (!report) return
    const csv = toCsv(
      ["Vendedor", "Email", "Clientes", "Ventas semana", "Comisión semana", "Ventas mes", "Comisión mes"],
      report.rows.map((r) => [
        r.sellerName,
        r.sellerEmail ?? "",
        r.linkedClients,
        r.weekRevenue.toFixed(2),
        r.weekCommission.toFixed(2),
        r.monthRevenue.toFixed(2),
        r.monthCommission.toFixed(2),
      ])
    )
    const stamp = new Date().toISOString().slice(0, 10)
    downloadCsv(`comisiones-admin-${stamp}.csv`, csv)
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-gray-900 flex items-center justify-center">
            <Wallet className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Comisiones</h1>
            <p className="text-sm text-gray-500">
              Ventas y comisión estimada por vendedor
              {report ? ` · tasa ${(report.rate * 100).toFixed(0)}%` : ""}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={exportCsv}
          disabled={!report || report.rows.length === 0}
          className="inline-flex items-center gap-1.5 rounded-full bg-white border border-gray-200 px-3.5 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          <Download className="w-3.5 h-3.5" />
          Exportar CSV
        </button>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-24 text-gray-400 text-sm">
          <Loader2 className="w-4 h-4 animate-spin mr-2" />
          Cargando comisiones…
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {report && !loading && (
        <>
          {report.rows.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-sm text-gray-400">
              Aún no hay vendedores con clientes vinculados.
            </div>
          ) : (
            <>
              {/* Totales */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                <Stat label="Ventas semana" value={formatMoney(report.totals.weekRevenue)} />
                <Stat label="Comisión semana" value={formatMoney(report.totals.weekCommission)} highlight />
                <Stat label="Ventas mes" value={formatMoney(report.totals.monthRevenue)} />
                <Stat label="Comisión mes" value={formatMoney(report.totals.monthCommission)} highlight />
              </div>

              {/* Tabla por vendedor */}
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-left text-xs text-gray-400 font-medium">
                        <th className="px-5 py-3">Vendedor</th>
                        <th className="px-5 py-3 text-right">Clientes</th>
                        <th className="px-5 py-3 text-right">Ventas semana</th>
                        <th className="px-5 py-3 text-right">Comisión semana</th>
                        <th className="px-5 py-3 text-right">Ventas mes</th>
                        <th className="px-5 py-3 text-right">Comisión mes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {report.rows.map((r) => (
                        <tr key={r.sellerId} className="hover:bg-gray-50 transition-colors">
                          <td className="px-5 py-3">
                            <p className="font-medium text-gray-900">{r.sellerName}</p>
                            {r.sellerEmail && (
                              <p className="text-xs text-gray-400">{r.sellerEmail}</p>
                            )}
                          </td>
                          <td className="px-5 py-3 text-right text-gray-500">{r.linkedClients}</td>
                          <td className="px-5 py-3 text-right text-gray-700">{formatMoney(r.weekRevenue)}</td>
                          <td className="px-5 py-3 text-right font-semibold text-brand-600">
                            {formatMoney(r.weekCommission)}
                          </td>
                          <td className="px-5 py-3 text-right text-gray-700">{formatMoney(r.monthRevenue)}</td>
                          <td className="px-5 py-3 text-right font-semibold text-brand-600">
                            {formatMoney(r.monthCommission)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}

function Stat({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <p className={`text-2xl font-bold ${highlight ? "text-brand-600" : "text-gray-900"}`}>{value}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  )
}
