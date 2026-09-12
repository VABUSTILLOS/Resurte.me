"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Mail, RefreshCcw, CheckCircle2, XCircle } from "lucide-react"

interface EmailLog {
  id: number
  email_to: string
  email_type: string
  order_id: number | null
  sent_at: string
  status: string
  error: string | null
}

const TYPE_LABEL: Record<string, string> = {
  order_confirmation: "Confirmación de pedido",
  order_status_confirmed: "Pedido confirmado",
  order_status_out_for_delivery: "Pedido en camino",
  order_status_delivered: "Pedido entregado",
  abandoned_cart: "Carrito abandonado",
  reorder_reminder: "Recordatorio de recompra",
  reactivation_30: "Reactivación 30d",
  reactivation_60: "Reactivación 60d",
  reactivation_90: "Reactivación 90d",
}

/**
 * /admin/emails — bitácora de correos enviados (transaccionales y
 * campañas), con filtro por tipo y estado.
 */
export default function AdminEmailsPage() {
  const [logs, setLogs] = useState<EmailLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [typeFilter, setTypeFilter] = useState("all")

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/email-logs", { cache: "no-store" })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Error al cargar")
      setLogs(data.logs ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // Botón reintentar/actualizar: el reset de loading/error va en el handler.
  const reload = () => {
    setLoading(true)
    setError(null)
    void load()
  }

  const types = useMemo(
    () => Array.from(new Set(logs.map((l) => l.email_type))).sort(),
    [logs]
  )
  const filtered = useMemo(
    () => (typeFilter === "all" ? logs : logs.filter((l) => l.email_type === typeFilter)),
    [logs, typeFilter]
  )
  const failedCount = logs.filter((l) => l.status !== "sent").length

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Correos enviados</h1>
          <p className="text-sm text-gray-500 mt-1">
            Bitácora de emails transaccionales y campañas (email_logs).
            {failedCount > 0 && (
              <span className="text-red-600 font-medium"> {failedCount} fallidos.</span>
            )}
          </p>
        </div>
        <button
          onClick={reload}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 px-3 py-2 rounded-lg"
        >
          <RefreshCcw className="w-3.5 h-3.5" />
          Actualizar
        </button>
      </div>

      {types.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-3 mb-4">
          {["all", ...types].map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                typeFilter === t
                  ? "bg-gray-900 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {t === "all" ? "Todos" : (TYPE_LABEL[t] ?? t)}
            </button>
          ))}
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-400 py-12 text-center">Cargando bitácora…</p>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
          <Mail className="w-10 h-10 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">Sin correos registrados</p>
          <p className="text-xs text-gray-400 mt-1">
            Los emails de pedidos y campañas aparecerán aquí al enviarse.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50 text-left text-gray-400">
                <th className="px-4 py-3 font-medium">Destinatario</th>
                <th className="px-4 py-3 font-medium">Tipo</th>
                <th className="px-4 py-3 font-medium">Pedido</th>
                <th className="px-4 py-3 font-medium">Fecha</th>
                <th className="px-4 py-3 font-medium text-center">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((log) => (
                <tr key={log.id}>
                  <td className="px-4 py-2.5 font-medium text-gray-700">{log.email_to}</td>
                  <td className="px-4 py-2.5 text-gray-500">
                    {TYPE_LABEL[log.email_type] ?? log.email_type}
                  </td>
                  <td className="px-4 py-2.5 text-gray-400">
                    {log.order_id ? `#${log.order_id}` : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-gray-400 whitespace-nowrap">
                    {new Date(log.sent_at).toLocaleString("es-MX", {
                      day: "numeric",
                      month: "short",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    {log.status === "sent" ? (
                      <span className="inline-flex items-center gap-1 text-brand-700">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Enviado
                      </span>
                    ) : (
                      <span
                        className="inline-flex items-center gap-1 text-red-600"
                        title={log.error ?? undefined}
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        Falló
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
