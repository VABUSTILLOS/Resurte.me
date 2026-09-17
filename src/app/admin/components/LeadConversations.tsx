"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Loader2, RefreshCw, Search } from "lucide-react"
import { getAdminCrmInbox, type AdminCrmInbox, type AdminInboxThread } from "../actions"
import { INBOX_BUCKET_LABEL } from "@/lib/crm-inbox"
import { formatRelativeTime } from "@/lib/relative-time"
import { CARD, FILTER_FIELD, LeadConversationPanel } from "@/components/crm/ConversationPanel"
import { ADMIN_CONVERSATION_ACTIONS } from "./admin-conversation-actions"


interface LeadConversationsProps {
  /** Se llama cuando algo cambió y el resto del panel debe refrescarse. */
  onChanged: () => void
  /** Filtro de bandeja vigente, leído de la URL. */
  view: string
  onViewChange: (view: string) => void
  /** Etiqueta por la que filtrar, o cadena vacía. */
  tag: string
  onTagChange: (tag: string) => void
}

/**
 * Pestaña "Bandeja": lista de conversaciones a la izquierda y el hilo a la
 * derecha. En móvil se muestra una sola columna con retroceso, porque el rail
 * inferior ya ocupa la parte baja de la pantalla.
 */
export function LeadConversations({
  onChanged,
  view,
  onViewChange,
  tag,
  onTagChange,
}: LeadConversationsProps) {
  const [inbox, setInbox] = useState<AdminCrmInbox | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState("")
  const [selectedId, setSelectedId] = useState<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setInbox(await getAdminCrmInbox())
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar la bandeja")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void Promise.resolve().then(load)
  }, [load])

  const threads = useMemo(() => inbox?.threads ?? [], [inbox])

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return threads.filter((t) => {
      if (view && t.bucket !== view) return false
      if (tag && !t.prospect.tags.includes(tag)) return false
      if (!needle) return true
      return (
        t.prospect.name.toLowerCase().includes(needle) ||
        (t.prospect.restaurant_name ?? "").toLowerCase().includes(needle) ||
        (t.prospect.phone ?? "").includes(needle) ||
        (t.preview ?? "").toLowerCase().includes(needle)
      )
    })
  }, [threads, view, tag, q])

  const tags = useMemo(
    () => [...new Set(threads.flatMap((t) => t.prospect.tags))].sort((a, b) => a.localeCompare(b, "es")),
    [threads],
  )

  const selected = visible.find((t) => t.prospect.id === selectedId) ?? null

  function refreshAll() {
    void load()
    onChanged()
  }

  if (loading && !inbox) {
    return (
      <p className="flex items-center gap-2 py-16 text-sm text-gray-400">
        <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> Cargando bandeja...
      </p>
    )
  }

  if (error && !inbox) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm font-medium text-red-600">{error}</p>
        <button
          type="button"
          onClick={() => void load()}
          className="mt-3 min-h-[44px] rounded-lg bg-gray-900 px-4 text-sm font-semibold text-white"
        >
          Reintentar
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className={`${CARD} p-3`}>
        <div className="flex flex-wrap items-center gap-2">
          {(["", "sin_responder", "esperando", "ventana_cerrada"] as const).map((key) => {
            const count = key === "" ? threads.length : (inbox?.counts[key] ?? 0)
            const label = key === "" ? "Todas" : INBOX_BUCKET_LABEL[key]
            return (
              <button
                key={key || "todas"}
                type="button"
                aria-pressed={view === key}
                onClick={() => onViewChange(key)}
                className={`min-h-[36px] rounded-full px-3 text-xs font-semibold transition-colors ${
                  view === key
                    ? "bg-gray-900 text-white"
                    : "border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                {label}
                <span className={view === key ? "ml-1 text-white/70" : "ml-1 text-gray-400"}>
                  ({count})
                </span>
              </button>
            )
          })}

          {tags.length > 0 && (
            <select
              value={tag}
              onChange={(e) => onTagChange(e.target.value)}
              aria-label="Filtrar por etiqueta"
              className={FILTER_FIELD}
            >
              <option value="">Todas las etiquetas</option>
              {tags.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          )}

          <label className="relative min-w-[180px] flex-1">
            <span className="sr-only">Buscar conversación</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Nombre, restaurante o teléfono"
              className={`${FILTER_FIELD} w-full pl-9`}
            />
          </label>

          <button
            type="button"
            onClick={() => void load()}
            aria-label="Refrescar bandeja"
            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border border-gray-200 px-3 text-xs font-semibold text-gray-600 hover:bg-gray-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin motion-reduce:animate-none" : ""}`} />
            Refrescar
          </button>
        </div>

        {inbox && (inbox.sinConversacion > 0 || inbox.sinMensajes > 0) && (
          <p className="mt-2 text-[11px] text-gray-400">
            {inbox.sinConversacion > 0 && `${inbox.sinConversacion} sin teléfono`}
            {inbox.sinConversacion > 0 && inbox.sinMensajes > 0 && " · "}
            {inbox.sinMensajes > 0 && `${inbox.sinMensajes} con teléfono pero sin mensajes`}
          </p>
        )}
      </div>

      <div className="lg:grid lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)] lg:gap-3">
        <div className={`${CARD} overflow-hidden ${selected ? "hidden lg:block" : ""}`}>
          {visible.length === 0 ? (
            <p className="px-4 py-10 text-center text-xs text-gray-400">
              {threads.length === 0
                ? "Todavía no hay conversaciones de WhatsApp"
                : "Ningún hilo coincide con el filtro"}
            </p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {visible.map((thread) => (
                <li key={thread.prospect.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(thread.prospect.id)}
                    className={`block w-full px-4 py-3 text-left transition-colors hover:bg-gray-50 ${
                      thread.prospect.id === selectedId ? "bg-gray-50" : ""
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="truncate text-sm font-semibold text-gray-900">
                        {thread.prospect.name}
                      </span>
                      {thread.lastMessageAt && (
                        <span className="flex-none text-[11px] text-gray-400">
                          {formatRelativeTime(thread.lastMessageAt)}
                        </span>
                      )}
                    </div>
                    {thread.prospect.restaurant_name && (
                      <span className="block truncate text-[11px] text-gray-500">
                        {thread.prospect.restaurant_name}
                      </span>
                    )}
                    <p className="mt-0.5 line-clamp-1 text-[11px] text-gray-400">
                      {thread.preview ?? "Sin mensajes"}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      <BucketChip thread={thread} />
                      {thread.prospect.seller_id === null && (
                        <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-800">
                          Sin asignar
                        </span>
                      )}
                      {thread.prospect.tags.slice(0, 2).map((t) => (
                        <span
                          key={t}
                          className="rounded-full bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold text-brand-700"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {selected ? (
          <LeadConversationPanel
            key={selected.prospect.id}
            prospectId={selected.prospect.id}
            onBack={() => setSelectedId(null)}
            onSent={refreshAll}
            actions={ADMIN_CONVERSATION_ACTIONS}
          />
        ) : (
          <div className={`${CARD} hidden items-center justify-center px-6 py-16 lg:flex`}>
            <p className="text-xs text-gray-400">Elige una conversación para ver el hilo</p>
          </div>
        )}
      </div>
    </div>
  )

  function BucketChip({ thread }: { thread: AdminInboxThread }) {
    if (!thread.bucket) {
      return (
        <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-500">
          Sin conversación
        </span>
      )
    }
    const tone =
      thread.bucket === "sin_responder"
        ? "bg-red-100 text-red-700"
        : thread.bucket === "ventana_cerrada"
          ? "bg-gray-200 text-gray-700"
          : "bg-emerald-100 text-emerald-700"
    return (
      <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase ${tone}`}>
        {INBOX_BUCKET_LABEL[thread.bucket]}
      </span>
    )
  }
}
