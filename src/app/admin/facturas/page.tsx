"use client"

import { useCallback, useEffect, useState } from "react"
import { FileText, Check, X, ExternalLink, RefreshCcw } from "lucide-react"

interface Submission {
  id: number
  user_id: string
  user_email: string | null
  image_path: string
  signed_url: string | null
  total_amount: number | null
  notes: string | null
  status: "pending" | "approved" | "rejected"
  credits_granted: number | null
  created_at: string
}

/**
 * /admin/facturas — cola de revisión de facturas subidas desde
 * /recompensas. Aprobar abona créditos reales (grant_wallet_credit) y
 * notifica al usuario; rechazar también notifica.
 */
export default function AdminFacturasPage() {
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [creditsInput, setCreditsInput] = useState<Record<number, string>>({})

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/admin/facturas", { cache: "no-store" })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Error al cargar")
      setSubmissions(data.submissions ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const review = async (id: number, action: "approve" | "reject") => {
    setBusyId(id)
    try {
      const credits = Number(creditsInput[id]?.replace(/[^0-9.]/g, ""))
      const res = await fetch("/api/admin/facturas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          action,
          ...(action === "approve" && Number.isFinite(credits) && credits > 0
            ? { credits }
            : {}),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Error al revisar")
      await load()
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error al revisar")
    } finally {
      setBusyId(null)
    }
  }

  const pending = submissions.filter((s) => s.status === "pending")
  const reviewed = submissions.filter((s) => s.status !== "pending")

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Facturas de clientes</h1>
          <p className="text-sm text-gray-500 mt-1">
            Revisa los tickets/facturas subidos desde Recompensas. Aprobar abona
            créditos (5% del total por defecto).
          </p>
        </div>
        <button
          onClick={() => void load()}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 px-3 py-2 rounded-lg"
        >
          <RefreshCcw className="w-3.5 h-3.5" />
          Actualizar
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-400 py-12 text-center">Cargando envíos…</p>
      ) : submissions.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
          <FileText className="w-10 h-10 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No hay facturas por revisar</p>
          <p className="text-xs text-gray-400 mt-1">
            Cuando un cliente suba su factura desde Recompensas, aparecerá aquí.
          </p>
        </div>
      ) : (
        <>
          {pending.length > 0 && (
            <section className="mb-8">
              <h2 className="text-sm font-bold text-gray-700 mb-3">
                Pendientes ({pending.length})
              </h2>
              <div className="space-y-3">
                {pending.map((s) => (
                  <div
                    key={s.id}
                    className="bg-white rounded-2xl border border-amber-200 p-4 flex flex-wrap items-center gap-4"
                  >
                    <div className="flex-1 min-w-[220px]">
                      <p className="text-sm font-semibold text-gray-900">
                        #{s.id} · {s.user_email ?? s.user_id.slice(0, 8)}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {new Date(s.created_at).toLocaleString("es-MX")}
                        {s.total_amount != null &&
                          ` · Total capturado: $${Number(s.total_amount).toLocaleString("es-MX")}`}
                      </p>
                      {s.notes && (
                        <p className="text-xs text-gray-400 mt-1">{s.notes}</p>
                      )}
                    </div>
                    {s.signed_url && (
                      <a
                        href={s.signed_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:underline"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        Ver imagen
                      </a>
                    )}
                    <div className="flex items-center gap-2">
                      <input
                        inputMode="decimal"
                        placeholder={
                          s.total_amount != null
                            ? `$${Math.round(Number(s.total_amount) * 0.05)}`
                            : "Créditos"
                        }
                        value={creditsInput[s.id] ?? ""}
                        onChange={(e) =>
                          setCreditsInput((prev) => ({ ...prev, [s.id]: e.target.value }))
                        }
                        className="w-28 rounded-lg border border-gray-200 px-3 py-2 text-xs"
                        aria-label={`Créditos a otorgar para el envío ${s.id}`}
                      />
                      <button
                        onClick={() => void review(s.id, "approve")}
                        disabled={busyId === s.id}
                        className="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-3 py-2 text-xs font-bold text-white hover:bg-brand-700 disabled:opacity-50"
                      >
                        <Check className="w-3.5 h-3.5" />
                        Aprobar
                      </button>
                      <button
                        onClick={() => void review(s.id, "reject")}
                        disabled={busyId === s.id}
                        className="inline-flex items-center gap-1 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-100 disabled:opacity-50"
                      >
                        <X className="w-3.5 h-3.5" />
                        Rechazar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {reviewed.length > 0 && (
            <section>
              <h2 className="text-sm font-bold text-gray-700 mb-3">
                Revisadas ({reviewed.length})
              </h2>
              <div className="space-y-2">
                {reviewed.map((s) => (
                  <div
                    key={s.id}
                    className="bg-white rounded-xl border border-gray-100 px-4 py-3 flex items-center gap-3 text-xs text-gray-500"
                  >
                    <span className="font-semibold text-gray-700">#{s.id}</span>
                    <span className="flex-1 truncate">{s.user_email ?? s.user_id.slice(0, 8)}</span>
                    <span>{new Date(s.created_at).toLocaleDateString("es-MX")}</span>
                    {s.status === "approved" ? (
                      <span className="text-brand-700 bg-brand-50 border border-brand-200 rounded-full px-2 py-0.5 font-semibold">
                        +${Number(s.credits_granted ?? 0).toLocaleString("es-MX")}
                      </span>
                    ) : (
                      <span className="text-red-700 bg-red-50 border border-red-200 rounded-full px-2 py-0.5 font-semibold">
                        Rechazada
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}
