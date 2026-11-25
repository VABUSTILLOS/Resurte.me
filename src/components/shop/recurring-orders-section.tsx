"use client"

import { useCallback, useEffect, useState } from "react"
import { CalendarClock, Pause, Play, X } from "lucide-react"

/**
 * «Mis pedidos recurrentes» (Ola 5, 00234): las plantillas del
 * cliente con sesión, en su página de pedidos. Muestra la
 * frecuencia, la próxima fecha y el desenlace del último ciclo,
 * y deja pausar, reanudar o cancelar con confirmación en línea.
 * Editar artículos o frecuencia es del panel (o por WhatsApp
 * con el equipo), no de esta superficie.
 *
 * Sin sesión, sin recurrencias o sin la migración, el
 * componente no pinta nada: la página queda como siempre.
 */

interface RecurringItem {
  product_id: number
  variant_id: number | null
  quantity: number
  product_name: string | null
}

interface RecurringTemplate {
  id: string
  name: string | null
  status: string
  schedule_text: string
  next_run_on: string
  last_run_on: string | null
  last_order_id: number | null
  last_result: string | null
  items: RecurringItem[]
}

const RESULT_LABEL: Record<string, string> = {
  created: "Último pedido generado sin problema",
  below_minimum: "El último ciclo no llegó al mínimo de $500 y no se generó",
  insufficient_stock: "El último ciclo no se generó por falta de existencia",
  quantity_violation: "El último ciclo no se generó: una cantidad quedó fuera del rango permitido",
  invalid_items: "El último ciclo no se generó: un artículo cambió en la tienda",
  error: "El último ciclo tuvo un error; el equipo ya lo está revisando",
}

function formatDay(dayKey: string): string {
  const d = new Date(`${dayKey}T12:00:00`)
  return d.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" })
}

export function RecurringOrdersSection() {
  const [templates, setTemplates] = useState<RecurringTemplate[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Fetcher puro (sin setState): el efecto encadena la promesa y
  // escribe al resolver; el manejador recarga tras mutar
  // (react-hooks/set-state-in-effect).
  const fetchTemplates = useCallback(async (): Promise<RecurringTemplate[] | null> => {
    try {
      const res = await fetch("/api/recurring-orders", { cache: "no-store" })
      if (!res.ok) return null
      const data = (await res.json()) as { available?: boolean; templates?: RecurringTemplate[] }
      return data.available ? (data.templates ?? []) : null
    } catch {
      // Sin red: la sección simplemente no aparece.
      return null
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void fetchTemplates().then((rows) => {
      if (!cancelled && rows) setTemplates(rows)
    })
    return () => {
      cancelled = true
    }
  }, [fetchTemplates])

  async function changeStatus(id: string, status: string) {
    setBusyId(id)
    setError(null)
    try {
      const res = await fetch(`/api/recurring-orders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) throw new Error()
      setConfirmCancelId(null)
      const rows = await fetchTemplates()
      if (rows) setTemplates(rows)
    } catch {
      setError("No se pudo guardar el cambio. Inténtalo de nuevo.")
    } finally {
      setBusyId(null)
    }
  }

  if (templates.length === 0) return null

  return (
    <section className="mb-8 rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4">
      <h2 className="flex items-center gap-2 text-base font-bold text-gray-900">
        <CalendarClock className="h-5 w-5 text-emerald-600" />
        Mis pedidos recurrentes
      </h2>
      <p className="mt-1 text-xs text-gray-500">
        Tu pedido fijo se genera solo el día que toca, con los precios de ese día. Para cambiar
        artículos o cantidades, escríbenos por WhatsApp.
      </p>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <ul className="mt-3 space-y-3">
        {templates.map((t) => (
          <li key={t.id} className="rounded-xl bg-white p-3 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-gray-900">
                  {t.name ?? "Pedido recurrente"}
                  <span className="ml-2 font-normal text-gray-500">{t.schedule_text}</span>
                </p>
                <p className="mt-0.5 text-xs text-gray-500">
                  {t.status === "active" && (
                    <>Próximo pedido: {formatDay(t.next_run_on)}</>
                  )}
                  {t.status === "paused" && <>En pausa: no se generará hasta que lo reanudes</>}
                  {t.status === "cancelled" && <>Cancelado</>}
                </p>
                {t.last_result && t.status !== "cancelled" && (
                  <p className="mt-0.5 text-xs text-gray-400">
                    {RESULT_LABEL[t.last_result] ?? ""}
                    {t.last_result === "created" && t.last_order_id
                      ? ` (pedido #${t.last_order_id})`
                      : ""}
                  </p>
                )}
                <p className="mt-1 text-xs text-gray-600">
                  {t.items
                    .map((i) => `${i.quantity}× ${i.product_name ?? `Producto ${i.product_id}`}`)
                    .join(" · ")}
                </p>
              </div>
              <div className="flex shrink-0 gap-1.5">
                {t.status === "active" && (
                  <button
                    type="button"
                    disabled={busyId === t.id}
                    onClick={() => void changeStatus(t.id, "paused")}
                    className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    <Pause className="h-3.5 w-3.5" /> Pausar
                  </button>
                )}
                {t.status === "paused" && (
                  <button
                    type="button"
                    disabled={busyId === t.id}
                    onClick={() => void changeStatus(t.id, "active")}
                    className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                  >
                    <Play className="h-3.5 w-3.5" /> Reanudar
                  </button>
                )}
                {t.status !== "cancelled" &&
                  (confirmCancelId === t.id ? (
                    <>
                      <button
                        type="button"
                        disabled={busyId === t.id}
                        onClick={() => void changeStatus(t.id, "cancelled")}
                        className="inline-flex items-center gap-1 rounded-lg bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                      >
                        Sí, cancelar
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmCancelId(null)}
                        className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                      >
                        Volver
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      disabled={busyId === t.id}
                      onClick={() => setConfirmCancelId(t.id)}
                      className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                      <X className="h-3.5 w-3.5" /> Cancelar
                    </button>
                  ))}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
