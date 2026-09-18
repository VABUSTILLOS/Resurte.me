"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
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

const ERROR_LABEL: Record<string, string> = {
  email_not_configured: "Sin credenciales del proveedor de correo",
}

/**
 * Bitácora de correos enviados (transaccionales y campañas), con filtro por
 * tipo y estado.
 */
export function EmailsTab() {
  const [logs, setLogs] = useState<EmailLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [typeFilter, setTypeFilter] = useState("all")
  // Optimista: solo se pinta la alerta cuando el servidor confirma el hueco.
  const [configured, setConfigured] = useState(true)

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/email-logs", { cache: "no-store" })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Error al cargar")
      setLogs(data.logs ?? [])
      setConfigured(data.configured !== false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // Diferido a microtask: ningún setState de load corre síncrono en el efecto.
    void Promise.resolve().then(load)
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
    <div>
      {!configured && (
        <div className="mb-5 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
          <strong className="font-semibold">El correo no está configurado.</strong> Ningún
          email de pedidos, campañas ni recordatorios puede salir, y todos quedan
          registrados como fallidos abajo.{" "}
          <Link href="/admin/sistema" className="font-semibold underline">
            Ver qué falta
          </Link>
          .
        </div>
      )}

      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <p className="text-sm text-gray-500">
          Bitácora de emails transaccionales y campañas (email_logs).
          {failedCount > 0 && (
            <span className="text-red-700 font-medium"> {failedCount} fallidos.</span>
          )}
        </p>
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
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50 text-left text-gray-500">
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
                          className="inline-flex items-center gap-1 text-red-700"
                          title={
                            log.error
                              ? (ERROR_LABEL[log.error] ?? log.error)
                              : undefined
                          }
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
        </div>
      )}
    </div>
  )
}
