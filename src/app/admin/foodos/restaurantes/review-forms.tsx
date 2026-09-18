"use client"

import { useState } from "react"
import { Check, Loader2, Pause, X } from "lucide-react"
import { MAX_REVIEW_NOTE_LENGTH, type ReviewDecision } from "@/lib/foodos-moderation"
import { useToast } from "@/components/toast"
import type { ReviewQueueRow } from "@/lib/foodos/actions/moderation-admin"

type SubmitState = { busy: ReviewDecision | null; error: string | null }

/**
 * Las tres decisiones sobre un restaurante: aprobar, rechazar y pausar.
 *
 * Aprobar y pausar se ejecutan en un clic porque son reversibles: pausar se
 * deshace aprobando otra vez. **Rechazar exige motivo**, y ese requisito no
 * vive aquí: el campo se marca obligatorio para que la pantalla no ofrezca algo
 * que el servidor va a negar, pero la regla la aplica `validateReviewInput()`.
 * Un formulario no es una garantía.
 */
export function ReviewActions({
  row,
  onDone,
}: {
  row: ReviewQueueRow
  onDone: () => void
}) {
  const { toast } = useToast()
  const [state, setState] = useState<SubmitState>({ busy: null, error: null })
  const [reason, setReason] = useState("")
  const [openReject, setOpenReject] = useState(false)

  async function submit(decision: ReviewDecision, note: string) {
    setState({ busy: decision, error: null })
    try {
      const res = await fetch("/api/admin/foodos/restaurantes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restaurantId: row.restaurantId, decision, reason: note }),
      })
      const payload = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        const message = payload.error ?? "No se pudo revisar el restaurante"
        setState({ busy: null, error: message })
        toast(message, "error")
        return
      }
      toast(
        decision === "approve"
          ? `${row.name} quedó publicado.`
          : decision === "reject"
            ? `${row.name} volvió a borrador con tu motivo.`
            : `${row.name} quedó pausado.`,
        "success"
      )
      setReason("")
      setOpenReject(false)
      setState({ busy: null, error: null })
      onDone()
    } catch {
      const message = "No se pudo revisar el restaurante"
      setState({ busy: null, error: message })
      toast(message, "error")
    }
  }

  const busy = state.busy !== null

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy || row.blocker !== null}
          title={row.blocker ?? undefined}
          onClick={() => submit("approve", "")}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold bg-[#0E7A0E] text-white hover:bg-[#0e7a0e] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {state.busy === "approve" ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Check className="w-4 h-4" />
          )}
          Publicar
        </button>

        <button
          type="button"
          disabled={busy || row.status !== "pending_review"}
          onClick={() => setOpenReject((v) => !v)}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <X className="w-4 h-4" />
          Pedir cambios
        </button>

        <button
          type="button"
          disabled={busy || row.status !== "active"}
          onClick={() => submit("pause", reason)}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold bg-amber-100 text-amber-800 hover:bg-amber-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {state.busy === "pause" ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Pause className="w-4 h-4" />
          )}
          Pausar
        </button>
      </div>

      {openReject && (
        <div className="space-y-2">
          <label
            htmlFor={`motivo-${row.restaurantId}`}
            className="block text-xs font-semibold text-gray-700"
          >
            Qué tiene que cambiar (obligatorio)
          </label>
          <textarea
            id={`motivo-${row.restaurantId}`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={MAX_REVIEW_NOTE_LENGTH}
            rows={3}
            placeholder="Falta la dirección de la sucursal y una foto del logo."
            className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-[#0E7A0E] focus:ring-1 focus:ring-[#0E7A0E]"
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">
              {reason.trim().length}/{MAX_REVIEW_NOTE_LENGTH}
            </span>
            <button
              type="button"
              disabled={busy || reason.trim().length === 0}
              onClick={() => submit("reject", reason)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold bg-red-600 text-white hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {state.busy === "reject" && <Loader2 className="w-4 h-4 animate-spin" />}
              Enviar y devolver a borrador
            </button>
          </div>
        </div>
      )}

      {state.error && <p className="text-xs text-red-700">{state.error}</p>}
    </div>
  )
}
