"use client"

import { useCallback, useEffect, useState } from "react"
import { ScrollText } from "lucide-react"
import { getAdminAuditLog, type AuditLogEntry } from "../actions"
import { AUDIT_ACTION_LABEL, AUDIT_ACTIONS } from "@/lib/audit-log"
import { formatRelativeTime } from "@/lib/relative-time"

function detailSummary(detail: Record<string, unknown>): string {
  const parts: string[] = []
  if ("from" in detail && "to" in detail) parts.push(`${detail.from} → ${detail.to}`)
  if ("code" in detail) parts.push(String(detail.code))
  if ("price" in detail) parts.push(`precio: $${detail.price}`)
  if ("stock_status" in detail) parts.push(`stock: ${detail.stock_status}`)
  if ("is_visible" in detail) parts.push(detail.is_visible ? "visible" : "oculto")
  if (parts.length === 0) {
    const keys = Object.keys(detail)
    if (keys.length > 0) parts.push(keys.map((k) => `${k}: ${JSON.stringify(detail[k])}`).join(", "))
  }
  return parts.join(" · ") || "—"
}

/** Bitácora de acciones administrativas (quién, cuándo, qué cambió). */
export function AuditoriaTab() {
  const [entries, setEntries] = useState<AuditLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [action, setAction] = useState("")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setEntries(await getAdminAuditLog({ action: action || undefined, from: from || undefined, to: to || undefined }))
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar la bitácora")
    } finally {
      setLoading(false)
    }
  }, [action, from, to])

  useEffect(() => {
    // Diferido a microtask: ningún setState corre síncrono en el efecto.
    void Promise.resolve().then(load)
  }, [load])

  return (
    <div>
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <select
          value={action}
          onChange={(e) => setAction(e.target.value)}
          aria-label="Filtrar por acción"
          className="border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-600 bg-white"
        >
          <option value="">Todas las acciones</option>
          {AUDIT_ACTIONS.map((a) => (
            <option key={a} value={a}>{AUDIT_ACTION_LABEL[a]}</option>
          ))}
        </select>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500" htmlFor="audit-from">Desde</label>
          <input
            id="audit-from"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-600"
          />
          <label className="text-xs text-gray-500" htmlFor="audit-to">Hasta</label>
          <input
            id="audit-to"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-600"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24 text-gray-400 text-sm">
          Cargando bitácora...
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <p className="text-red-700 text-sm font-medium">{error}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-4 rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-700 transition-colors"
          >
            Reintentar
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left text-xs text-gray-500 font-medium">
                  <th className="px-5 py-3">Fecha</th>
                  <th className="px-5 py-3">Actor</th>
                  <th className="px-5 py-3">Acción</th>
                  <th className="px-5 py-3">Entidad</th>
                  <th className="px-5 py-3">Detalle</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {entries.map((e) => (
                  <tr key={e.id} className="hover:bg-gray-50">
                    <td
                      className="px-5 py-3 text-xs text-gray-400 whitespace-nowrap"
                      title={new Date(e.created_at).toLocaleString("es-MX")}
                    >
                      {formatRelativeTime(e.created_at)}
                    </td>
                    <td className="px-5 py-3 text-xs text-gray-600">{e.actor_email ?? "—"}</td>
                    <td className="px-5 py-3 text-xs font-medium text-gray-800">
                      {AUDIT_ACTION_LABEL[e.action as keyof typeof AUDIT_ACTION_LABEL] ?? e.action}
                    </td>
                    <td className="px-5 py-3 text-xs text-gray-500">
                      {e.entity}
                      {e.entity_id ? ` #${e.entity_id}` : ""}
                    </td>
                    <td className="px-5 py-3 text-xs text-gray-500 max-w-[280px] truncate" title={detailSummary(e.detail)}>
                      {detailSummary(e.detail)}
                    </td>
                  </tr>
                ))}
                {entries.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-5 py-8 text-center text-sm text-gray-400">
                      <ScrollText className="w-8 h-8 text-gray-200 mx-auto mb-2" aria-hidden="true" />
                      Sin eventos registrados con estos filtros
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
