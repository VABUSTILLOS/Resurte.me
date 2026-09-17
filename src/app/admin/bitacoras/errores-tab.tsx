"use client"

import { useCallback, useEffect, useState } from "react"
import { Download, RefreshCw, Loader2 } from "lucide-react"
import { getErrorLogs, type ErrorLogsReport } from "@/lib/admin-errors"
import { toCsv, downloadCsv } from "@/lib/csv"
import { DEFAULT_TIMEZONE, dayKeyOf } from "@/lib/local-date"

const SEVERITY_STYLE: Record<string, string> = {
  fatal: "bg-red-100 text-red-700",
  error: "bg-red-50 text-red-600",
  warn: "bg-amber-50 text-amber-700",
  info: "bg-blue-50 text-blue-600",
}

const SOURCES = ["all", "client", "server", "edge"] as const

/**
 * Salud de la app: lee `error_logs` (poblada por /api/log-error desde cliente,
 * servidor y edge) sin depender de Sentry.
 */
export function ErroresTab() {
  const [report, setReport] = useState<ErrorLogsReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [severity, setSeverity] = useState<string>("all")
  const [source, setSource] = useState<string>("all")

  const load = useCallback(async (sev: string, src: string) => {
    try {
      const r = await getErrorLogs({
        severity: sev === "all" ? undefined : sev,
        source: src === "all" ? undefined : src,
      })
      setReport(r)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void Promise.resolve().then(() => load(severity, source))
  }, [load, severity, source])

  function refresh() {
    setLoading(true)
    void load(severity, source)
  }

  function exportCsv() {
    if (!report) return
    const csv = toCsv(
      ["Fecha", "Severidad", "Fuente", "Mensaje", "URL", "Usuario"],
      report.entries.map((e) => [
        new Date(e.created_at).toLocaleString("es-MX"),
        e.severity,
        e.source,
        e.message.slice(0, 300),
        e.url ?? "",
        e.user_id ? e.user_id.slice(0, 8) : "",
      ])
    )
    const stamp = dayKeyOf(DEFAULT_TIMEZONE)
    downloadCsv(`error-logs-${stamp}.csv`, csv)
  }

  return (
    <div>
      <div className="flex items-center justify-end gap-2 mb-6 flex-wrap">
        <button
          type="button"
          onClick={exportCsv}
          disabled={!report || report.entries.length === 0}
          className="inline-flex items-center gap-1.5 rounded-full bg-white border border-gray-200 px-3.5 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          <Download className="w-3.5 h-3.5" />
          Exportar CSV
        </button>
        <button
          type="button"
          onClick={refresh}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-full bg-white border border-gray-200 px-3.5 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          Actualizar
        </button>
      </div>

      {/* Conteos por severidad */}
      {report && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {(["fatal", "error", "warn", "info"] as const).map((sev) => (
            <button
              key={sev}
              type="button"
              onClick={() => setSeverity(severity === sev ? "all" : sev)}
              aria-pressed={severity === sev}
              className={`rounded-xl border p-4 text-left transition-colors ${
                severity === sev
                  ? "border-gray-900 bg-gray-900 text-white"
                  : "bg-white border-gray-200 hover:bg-gray-50"
              }`}
            >
              <p className="text-2xl font-bold">{report.bySeverity[sev] ?? 0}</p>
              <p className={`text-xs ${severity === sev ? "text-gray-300" : "text-gray-500"}`}>
                {sev}
              </p>
            </button>
          ))}
        </div>
      )}

      {/* Filtro por fuente */}
      <div className="flex gap-2 mb-4 overflow-x-auto">
        {SOURCES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSource(s)}
            className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              source === s
                ? "bg-gray-900 text-white"
                : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
          >
            {s === "all" ? "Todas las fuentes" : s}
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-24 text-gray-400 text-sm">
          <Loader2 className="w-4 h-4 animate-spin mr-2" />
          Cargando errores…
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {report && !loading && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {report.entries.length === 0 ? (
            <p className="px-5 py-12 text-center text-sm text-gray-400">
              Sin errores en la vista actual. 🎉
            </p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {report.entries.map((e) => (
                <li key={e.id} className="px-5 py-3">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${SEVERITY_STYLE[e.severity] ?? "bg-gray-100 text-gray-600"}`}
                    >
                      {e.severity}
                    </span>
                    <span className="text-[10px] font-medium text-gray-400 uppercase">
                      {e.source}
                    </span>
                    {e.url && (
                      <span className="text-[10px] text-gray-400 truncate max-w-[220px]">
                        {e.url}
                      </span>
                    )}
                    <time className="text-[10px] text-gray-400 ml-auto shrink-0">
                      {new Date(e.created_at).toLocaleString("es-MX")}
                    </time>
                  </div>
                  <p className="text-sm text-gray-800 break-words">{e.message}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
