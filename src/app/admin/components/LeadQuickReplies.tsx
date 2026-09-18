"use client"

import { useCallback, useEffect, useState } from "react"
import { Loader2, Pencil, Plus, RefreshCw, Trash2, Zap } from "lucide-react"
import {
  deleteQuickReply,
  getAdminQuickReplies,
  saveQuickReply,
  type AdminQuickReply,
} from "../actions"
import {
  QUICK_REPLY_BODY_MAX,
  QUICK_REPLY_TITLE_MAX,
  QUICK_REPLY_VARIABLES,
  quickReplyDraftError,
} from "@/lib/crm-inbox"
import { useToast } from "@/components/toast"

const CARD = "rounded-xl border border-gray-200 bg-white"
const FIELD =
  "w-full rounded-lg border border-gray-200 px-2.5 py-2 text-xs text-gray-700 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"

interface Draft {
  id: number | null
  title: string
  body: string
  category: string
  isActive: boolean
  sortOrder: number
}

const EMPTY_DRAFT: Draft = { id: null, title: "", body: "", category: "", isActive: true, sortOrder: 0 }

/** "18/60" — verde mientras quepa, rojo cuando ya no. */
function counterClass(length: number, max: number): string {
  return length > max ? "text-red-700 font-semibold" : "text-gray-600"
}

/**
 * Gestor de respuestas rápidas.
 *
 * Vive en la pestaña Bandeja y no dentro del compositor a propósito: el
 * compositor lo comparten las dos mitades del panel (vendedor y admin) y editar
 * el catálogo de atajos no es algo que deba estar a un clic de un envío.
 *
 * Apagar una respuesta aquí la quita del compositor y la deja en esta lista: es
 * el único sitio donde se puede volver a encender.
 */
export function LeadQuickReplies() {
  const { toast } = useToast()
  const [replies, setReplies] = useState<AdminQuickReply[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setReplies(await getAdminQuickReplies())
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron cargar las respuestas rápidas")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void Promise.resolve().then(load)
  }, [load])

  function edit(reply: AdminQuickReply) {
    setDraft({
      id: reply.id,
      title: reply.title,
      body: reply.body,
      category: reply.category ?? "",
      isActive: reply.isActive,
      sortOrder: reply.sortOrder,
    })
    setFormError(null)
  }

  const draftError = draft === null ? null : quickReplyDraftError(draft)

  async function submit() {
    if (draft === null) return
    const problem = quickReplyDraftError(draft)
    if (problem) {
      setFormError(problem)
      return
    }
    setBusy(true)
    try {
      await saveQuickReply({
        id: draft.id ?? undefined,
        title: draft.title,
        body: draft.body,
        category: draft.category.trim() || null,
        isActive: draft.isActive,
        sortOrder: draft.sortOrder,
      })
      toast(draft.id === null ? "Respuesta rápida creada" : "Respuesta rápida guardada", "success")
      setDraft(null)
      setFormError(null)
      await load()
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "No se pudo guardar la respuesta rápida")
    } finally {
      setBusy(false)
    }
  }

  async function toggleActive(reply: AdminQuickReply) {
    setBusy(true)
    try {
      await saveQuickReply({
        id: reply.id,
        title: reply.title,
        body: reply.body,
        category: reply.category,
        isActive: !reply.isActive,
        sortOrder: reply.sortOrder,
      })
      toast(
        reply.isActive
          ? `«${reply.title}» fuera del compositor`
          : `«${reply.title}» disponible en el compositor`,
        "success",
      )
      await load()
    } catch (e) {
      toast(e instanceof Error ? e.message : "No se pudo cambiar la respuesta rápida", "error")
    } finally {
      setBusy(false)
    }
  }

  async function remove(reply: AdminQuickReply) {
    setBusy(true)
    try {
      await deleteQuickReply(reply.id)
      toast(`«${reply.title}» borrada`, "success")
      setConfirmId(null)
      await load()
    } catch (e) {
      toast(e instanceof Error ? e.message : "No se pudo borrar la respuesta rápida", "error")
    } finally {
      setBusy(false)
    }
  }

  const activeCount = replies.filter((reply) => reply.isActive).length

  return (
    <div className="space-y-3">
      <div className={`${CARD} flex flex-wrap items-center gap-2 p-3`}>
        <p className="flex-1 text-xs text-gray-500">
          Las respuestas rápidas son atajos del compositor de la Bandeja. Solo las activas
          aparecen ahí; apagarlas no las borra. Las variables{" "}
          {QUICK_REPLY_VARIABLES.map((name) => `{{${name}}}`).join(", ")} se rellenan con los datos
          del prospecto al enviar.
        </p>
        <button
          type="button"
          onClick={() => void load()}
          aria-label="Refrescar respuestas rápidas"
          className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border border-gray-200 px-3 text-xs font-semibold text-gray-600 hover:bg-gray-50"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${loading ? "animate-spin motion-reduce:animate-none" : ""}`}
          />
          Refrescar
        </button>
        <button
          type="button"
          onClick={() => {
            setDraft({ ...EMPTY_DRAFT, sortOrder: replies.length })
            setFormError(null)
          }}
          className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl bg-brand-600 px-3 text-xs font-semibold text-white hover:bg-brand-700"
        >
          <Plus className="h-3.5 w-3.5" /> Nueva respuesta
        </button>
      </div>

      {draft !== null && (
        <div className={`${CARD} p-3`}>
          <p className="text-xs font-semibold text-gray-900">
            {draft.id === null ? "Nueva respuesta rápida" : "Editar respuesta rápida"}
          </p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <div>
              <label className="text-[11px] font-medium text-gray-600" htmlFor="qr-title">
                Título
              </label>
              <input
                id="qr-title"
                value={draft.title}
                disabled={busy}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                className={FIELD}
              />
              <p className={`mt-0.5 text-[10px] ${counterClass(draft.title.length, QUICK_REPLY_TITLE_MAX)}`}>
                {draft.title.length}/{QUICK_REPLY_TITLE_MAX} · es el nombre del atajo, único
              </p>
            </div>
            <div>
              <label className="text-[11px] font-medium text-gray-600" htmlFor="qr-category">
                Categoría (opcional)
              </label>
              <input
                id="qr-category"
                value={draft.category}
                disabled={busy}
                onChange={(e) => setDraft({ ...draft, category: e.target.value })}
                placeholder="primer contacto, seguimiento..."
                className={FIELD}
              />
              <div className="mt-0.5 flex items-center gap-2">
                <label className="text-[11px] font-medium text-gray-600" htmlFor="qr-order">
                  Orden
                </label>
                <input
                  id="qr-order"
                  type="number"
                  min={0}
                  value={draft.sortOrder}
                  disabled={busy}
                  onChange={(e) =>
                    setDraft({ ...draft, sortOrder: Number(e.target.value) || 0 })
                  }
                  className="w-16 rounded-lg border border-gray-200 px-2 py-1 text-[11px] text-gray-700"
                />
                <span className="text-[10px] text-gray-600">menor = antes</span>
              </div>
            </div>
          </div>
          <div className="mt-2">
            <label className="text-[11px] font-medium text-gray-600" htmlFor="qr-body">
              Texto
            </label>
            <textarea
              id="qr-body"
              rows={3}
              value={draft.body}
              disabled={busy}
              onChange={(e) => setDraft({ ...draft, body: e.target.value })}
              className={FIELD}
            />
            <p className={`mt-0.5 text-[10px] ${counterClass(draft.body.length, QUICK_REPLY_BODY_MAX)}`}>
              {draft.body.length}/{QUICK_REPLY_BODY_MAX}
            </p>
          </div>
          <label className="mt-1 flex min-h-[32px] items-center gap-2 text-[11px] text-gray-700">
            <input
              type="checkbox"
              checked={draft.isActive}
              disabled={busy}
              onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })}
              className="h-3.5 w-3.5 accent-brand-600"
            />
            Disponible en el compositor
          </label>

          {formError && <p className="mt-1 text-[11px] text-red-700">{formError}</p>}

          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              disabled={busy || draftError !== null}
              onClick={() => void submit()}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-brand-600 px-3 text-[11px] font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {busy && <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />}
              {draft.id === null ? "Crear" : "Guardar"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setDraft(null)
                setFormError(null)
              }}
              className="min-h-[36px] rounded-lg border border-gray-200 px-3 text-[11px] font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            >
              Cancelar
            </button>
            {draftError && draft.title.trim() !== "" && (
              <span className="text-[10px] text-gray-600">{draftError}</span>
            )}
          </div>
        </div>
      )}

      {loading && replies.length === 0 ? (
        <p className="flex items-center gap-2 py-10 text-sm text-gray-600">
          <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> Cargando respuestas
          rápidas...
        </p>
      ) : error ? (
        <div className={`${CARD} p-6 text-center`}>
          <p className="text-sm font-medium text-red-700">{error}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-3 min-h-[44px] rounded-lg bg-gray-900 px-4 text-sm font-semibold text-white"
          >
            Reintentar
          </button>
        </div>
      ) : replies.length === 0 ? (
        <div className={`${CARD} px-4 py-12 text-center`}>
          <Zap className="mx-auto h-6 w-6 text-gray-300" />
          <p className="mt-2 text-sm font-medium text-gray-700">Todavía no hay respuestas rápidas</p>
          <p className="mt-1 text-xs text-gray-500">
            Crea una para no reescribir el mismo primer mensaje en cada conversación.
          </p>
        </div>
      ) : (
        <>
          <p className="text-[11px] text-gray-500">
            {activeCount} de {replies.length} en el compositor
          </p>
          <ul className="space-y-2">
            {replies.map((reply) => (
              <li key={reply.id} className={`${CARD} p-3`}>
                <div className="flex flex-wrap items-start gap-2">
                  <div className="min-w-[12rem] flex-1">
                    <p className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
                      {reply.title}
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          reply.isActive
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {reply.isActive ? "En el compositor" : "Apagada"}
                      </span>
                      {reply.category && (
                        <span className="rounded-full bg-gray-50 px-2 py-0.5 text-[10px] text-gray-500">
                          {reply.category}
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 whitespace-pre-wrap text-xs text-gray-600">{reply.body}</p>
                    <p className="mt-1 text-[10px] text-gray-600">
                      Orden {reply.sortOrder}
                      {reply.variables.length > 0
                        ? ` · variables: ${reply.variables.map((name) => `{{${name}}}`).join(", ")}`
                        : " · sin variables"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => edit(reply)}
                      className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-gray-200 px-3 text-[11px] font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                      <Pencil className="h-3 w-3" /> Editar
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void toggleActive(reply)}
                      className="min-h-[36px] rounded-lg border border-gray-200 px-3 text-[11px] font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                      {reply.isActive ? "Apagar" : "Encender"}
                    </button>
                    {confirmId === reply.id ? (
                      <span className="flex items-center gap-1">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void remove(reply)}
                          className="min-h-[36px] rounded-lg bg-red-600 px-3 text-[11px] font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                        >
                          Sí, borrar
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => setConfirmId(null)}
                          className="min-h-[36px] rounded-lg border border-gray-200 px-3 text-[11px] font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                        >
                          No
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setConfirmId(reply.id)}
                        aria-label={`Borrar «${reply.title}»`}
                        className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-gray-200 px-3 text-[11px] font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                      >
                        <Trash2 className="h-3 w-3" /> Borrar
                      </button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
