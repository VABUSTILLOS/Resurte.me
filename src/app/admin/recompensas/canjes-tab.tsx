"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Gift, RefreshCcw, Download, Play, PackageCheck, X, ExternalLink } from "lucide-react"
import { toCsv, downloadCsv } from "@/lib/csv"
import { DEFAULT_TIMEZONE, dayKeyOf } from "@/lib/local-date"
import {
  REDEMPTION_STATUS_LABEL,
  briefCompleteness,
  formatRedemptionDueDate,
  isRedemptionOverdue,
  nextRedemptionStatuses,
  slaDaysRemaining,
  type RedemptionBrief,
  type RedemptionStatus,
} from "@/lib/redemptions"

interface Row {
  id: number
  user_id: string
  email: string | null
  service_id: string
  service_name: string
  cost_credits: number
  status: RedemptionStatus
  brief: RedemptionBrief | null
  assigned_to: string | null
  due_at: string | null
  started_at: string | null
  delivered_at: string | null
  cancelled_at: string | null
  refunded_at: string | null
  cancel_reason: string | null
  deliverable_url: string | null
  deliverable_note: string | null
  created_at: string
  status_updated_at: string | null
}

const STATUS_BADGE: Record<RedemptionStatus, string> = {
  requested: "bg-amber-50 text-amber-700 border-amber-200",
  in_progress: "bg-blue-50 text-blue-700 border-blue-200",
  delivered: "bg-green-50 text-green-700 border-green-200",
  cancelled: "bg-gray-100 text-gray-600 border-gray-200",
}

function day(iso: string | null) {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("es-MX", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

/**
 * Cola operativa de servicios canjeados con créditos.
 *
 * Antes no existía ninguna: el cliente canjeaba, se le debitaban créditos y la
 * solicitud se quedaba en `requested` para siempre —nadie podía verla, nadie
 * podía moverla—. Esta pestaña es el otro extremo del canje: muestra el brief
 * que el cliente capturó (nombre del restaurante, Maps, redes, notas), el
 * plazo comprometido y el estado real, y permite avanzarlo.
 *
 * Todo el dinero (el reembolso al cancelar) lo ejecuta `advance_redemption()`;
 * aquí no se reimplementa nada. Cancelar desde aquí SÍ reembolsa los créditos
 * al cliente, por eso se confirma.
 */
export function CanjesTab() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [showAll, setShowAll] = useState(false)
  const [openId, setOpenId] = useState<number | null>(null)

  const load = useCallback(async (all: boolean) => {
    try {
      const res = await fetch(`/api/admin/redemptions${all ? "?status=all" : ""}`, {
        cache: "no-store",
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Error al cargar")
      setRows(data.redemptions ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // Diferido a microtask: ningún setState corre síncrono dentro del efecto.
    void Promise.resolve().then(() => load(showAll))
  }, [load, showAll])

  const reload = useCallback(() => {
    setLoading(true)
    setError(null)
    return load(showAll)
  }, [load, showAll])

  const advance = useCallback(
    async (row: Row, status: RedemptionStatus) => {
      if (status === "cancelled") {
        if (
          !window.confirm(
            `¿Cancelar "${row.service_name}" de ${row.email ?? row.user_id}? ` +
              `Se le devuelven ${Number(row.cost_credits).toLocaleString("es-MX")} créditos.`
          )
        )
          return
      }
      setBusyId(row.id)
      try {
        const res = await fetch("/api/admin/redemptions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: row.id, status }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? "Error al actualizar")
        if (data.changed === false) {
          alert("La solicitud ya estaba en ese estado; no se cambió nada.")
        }
        await reload()
      } catch (err) {
        alert(err instanceof Error ? err.message : "Error al actualizar")
      } finally {
        setBusyId(null)
      }
    },
    [reload]
  )

  const saveMeta = useCallback(
    async (row: Row, patch: { assigned_to?: string; note?: string; deliverable_url?: string }) => {
      setBusyId(row.id)
      try {
        const res = await fetch("/api/admin/redemptions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // Sin `status`: sólo metadatos, no se toca la máquina de estados.
          body: JSON.stringify({ id: row.id, ...patch }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? "Error al guardar")
        await reload()
      } catch (err) {
        alert(err instanceof Error ? err.message : "Error al guardar")
      } finally {
        setBusyId(null)
      }
    },
    [reload]
  )

  function exportCsv() {
    const csv = toCsv(
      [
        "ID",
        "Cliente",
        "Servicio",
        "Créditos",
        "Estatus",
        "Plazo",
        "Restaurante",
        "Maps",
        "Redes",
        "Asignado",
        "Entregable",
      ],
      rows.map((r) => [
        r.id,
        r.email ?? r.user_id,
        r.service_name,
        r.cost_credits,
        REDEMPTION_STATUS_LABEL[r.status],
        r.due_at ?? "",
        r.brief?.restaurant_name ?? "",
        r.brief?.maps_url ?? "",
        r.brief?.social_handle ?? "",
        r.assigned_to ?? "",
        r.deliverable_url ?? "",
      ])
    )
    downloadCsv(`canjes-${dayKeyOf(DEFAULT_TIMEZONE)}.csv`, csv)
  }

  const overdueCount = useMemo(
    () => rows.filter((r) => isRedemptionOverdue({ status: r.status, due_at: r.due_at })).length,
    [rows]
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <p className="text-sm text-gray-500">
          Servicios que los clientes pagaron con créditos. Cada solicitud trae el brief que
          capturaron en el checkout; el plazo comprometido se calcula solo. Cancelar devuelve los
          créditos al cliente.
          {overdueCount > 0 && (
            <span className="ml-1 font-semibold text-red-600">
              {overdueCount} fuera de plazo.
            </span>
          )}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            aria-pressed={showAll}
            className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg ${
              showAll ? "bg-brand-50 text-brand-700" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {showAll ? "Viendo todas" : "Sólo abiertas"}
          </button>
          <button
            type="button"
            onClick={exportCsv}
            disabled={rows.length === 0}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 px-3 py-2 rounded-lg disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            Exportar CSV
          </button>
          <button
            onClick={() => void reload()}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 px-3 py-2 rounded-lg"
          >
            <RefreshCcw className="w-3.5 h-3.5" />
            Actualizar
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-400 py-12 text-center">Cargando solicitudes…</p>
      ) : rows.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
          <Gift className="w-10 h-10 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No hay servicios canjeados</p>
          <p className="text-xs text-gray-400 mt-1">
            Cuando un cliente canjee créditos desde Recompensas, aparecerá aquí.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => {
            const overdue = isRedemptionOverdue({ status: row.status, due_at: row.due_at })
            const remaining = slaDaysRemaining(row.due_at)
            const completeness = briefCompleteness(row.brief)
            const next = nextRedemptionStatuses(row.status)
            const expanded = openId === row.id

            return (
              <div
                key={row.id}
                className={`bg-white rounded-2xl border p-4 ${
                  overdue ? "border-red-200" : "border-gray-100"
                }`}
              >
                <div className="flex flex-wrap items-start gap-4">
                  <div className="flex-1 min-w-[240px]">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-900 text-sm">
                        #{row.id} · {row.service_name}
                      </span>
                      <span
                        className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                          STATUS_BADGE[row.status]
                        }`}
                      >
                        {REDEMPTION_STATUS_LABEL[row.status]}
                      </span>
                      {overdue && (
                        <span className="text-[11px] font-semibold text-red-600">Fuera de plazo</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      {row.email ?? row.user_id} · {Number(row.cost_credits).toLocaleString("es-MX")}{" "}
                      créditos
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      Solicitado el {day(row.created_at)}
                      {row.due_at
                        ? ` · comprometido para el ${formatRedemptionDueDate(row.due_at)}`
                        : ""}
                      {remaining !== null && remaining >= 0 && row.status !== "delivered"
                        ? ` (${remaining} día${remaining === 1 ? "" : "s"})`
                        : ""}
                      {row.assigned_to ? ` · asignado a ${row.assigned_to}` : ""}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    {next.map((s) => (
                      <button
                        key={s}
                        type="button"
                        disabled={busyId === row.id}
                        onClick={() => void advance(row, s)}
                        className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg disabled:opacity-50 ${
                          s === "cancelled"
                            ? "bg-red-50 text-red-700 hover:bg-red-100"
                            : "bg-brand-600 text-white hover:bg-brand-700"
                        }`}
                      >
                        {s === "cancelled" ? (
                          <X className="w-3.5 h-3.5" />
                        ) : s === "delivered" ? (
                          <PackageCheck className="w-3.5 h-3.5" />
                        ) : (
                          <Play className="w-3.5 h-3.5" />
                        )}
                        {REDEMPTION_STATUS_LABEL[s]}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setOpenId(expanded ? null : row.id)}
                      aria-expanded={expanded}
                      className="text-xs font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 px-3 py-2 rounded-lg"
                    >
                      {expanded ? "Ocultar brief" : "Ver brief"}
                    </button>
                  </div>
                </div>

                {expanded && (
                  <div className="mt-4 pt-4 border-t border-gray-100 grid gap-3 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <p className="text-xs font-semibold text-gray-700 mb-1">
                        Brief del cliente ({Math.round(completeness * 100)}% completo)
                      </p>
                      {completeness === 0 ? (
                        <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
                          Sin brief: la solicitud se creó antes de que se capturara, o la escritura
                          falló. Pide los datos directamente al cliente.
                        </p>
                      ) : (
                        <dl className="text-xs text-gray-600 space-y-1">
                          <div>
                            <dt className="inline font-semibold">Restaurante: </dt>
                            <dd className="inline">{row.brief?.restaurant_name ?? "—"}</dd>
                          </div>
                          <div>
                            <dt className="inline font-semibold">Google Maps: </dt>
                            <dd className="inline">
                              {row.brief?.maps_url ? (
                                <a
                                  href={row.brief.maps_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-brand-700 underline inline-flex items-center gap-1"
                                >
                                  abrir <ExternalLink className="w-3 h-3" />
                                </a>
                              ) : (
                                "—"
                              )}
                            </dd>
                          </div>
                          <div>
                            <dt className="inline font-semibold">Redes: </dt>
                            <dd className="inline">{row.brief?.social_handle ?? "—"}</dd>
                          </div>
                          <div>
                            <dt className="inline font-semibold">Notas: </dt>
                            <dd className="inline">{row.brief?.notes ?? "—"}</dd>
                          </div>
                        </dl>
                      )}
                    </div>

                    <div>
                      <label
                        htmlFor={`assign-${row.id}`}
                        className="text-xs font-semibold text-gray-700 block mb-1"
                      >
                        Asignar a
                      </label>
                      <input
                        id={`assign-${row.id}`}
                        defaultValue={row.assigned_to ?? ""}
                        onBlur={(e) => {
                          const v = e.target.value.trim()
                          if (v !== (row.assigned_to ?? "")) void saveMeta(row, { assigned_to: v })
                        }}
                        placeholder="Nombre de quien lo ejecuta"
                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor={`url-${row.id}`}
                        className="text-xs font-semibold text-gray-700 block mb-1"
                      >
                        Link del entregable
                      </label>
                      <input
                        id={`url-${row.id}`}
                        type="url"
                        defaultValue={row.deliverable_url ?? ""}
                        onBlur={(e) => {
                          const v = e.target.value.trim()
                          if (v !== (row.deliverable_url ?? "")) void saveMeta(row, { deliverable_url: v })
                        }}
                        placeholder="https://drive.google.com/…"
                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                      />
                      {row.deliverable_note && (
                        <p className="text-xs text-gray-500 mt-1">{row.deliverable_note}</p>
                      )}
                    </div>

                    {row.status === "cancelled" && row.cancel_reason && (
                      <div className="sm:col-span-2 text-xs text-gray-500">
                        Cancelada: {row.cancel_reason}
                        {row.refunded_at ? " · créditos devueltos" : " · sin devolución"}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
