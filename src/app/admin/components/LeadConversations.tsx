"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Loader2,
  MessageCircle,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  UserRound,
} from "lucide-react"
import {
  getAdminCrmInbox,
  getAdminLeadConversation,
  getAdminQuickReplies,
  listWaTemplates,
  sendLeadMessage,
  suggestLeadReply,
  type AdminCrmInbox,
  type AdminInboxThread,
  type AdminLeadConversation,
  type AdminQuickReply,
  type LeadMessageRefusal,
  type LeadTimelineEntry,
} from "../actions"
import { INBOX_BUCKET_LABEL } from "@/lib/crm-inbox"
import { formatMinutes } from "@/lib/crm-assignment"
import { formatRelativeTime } from "@/lib/relative-time"
import { useToast } from "@/components/toast"

/** Motivo por el que el servidor se negó a enviar, en palabras del admin. */
const REFUSAL_LABEL: Record<LeadMessageRefusal, string> = {
  not_found: "El prospecto ya no existe",
  no_phone: "Ese prospecto no tiene teléfono",
  empty_message: "Escribe algo antes de enviar",
  requires_template: "La ventana de 24 h está cerrada: usa una plantilla aprobada",
  quick_reply_not_found: "La respuesta rápida ya no existe",
}

const CARD = "rounded-xl border border-gray-200 bg-white"
const FILTER_FIELD =
  "rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-700 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"

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

interface ConversationPanelProps {
  prospectId: number
  onBack?: () => void
  onSent: () => void
  className?: string
  /** Lector y acciones de la bandeja. Por defecto, los de administración. */
  actions?: ConversationPanelActions
}

/**
 * Todo lo que la bandeja hace contra el servidor, inyectable.
 *
 * Existe por el vendedor (Ronda 7): su bandeja lee la conversación con alcance
 * de cartera (`getSellerLeadConversation`) en vez de con el lector de
 * administración. Lo que no se inyecta **no se pinta**: `send` y `suggest`
 * ausentes dejan el pie en modo lectura, en vez de mostrar un compositor que
 * respondería "Acceso restringido a administradores" al primer clic.
 */
export interface ConversationPanelActions {
  load: (prospectId: number) => Promise<AdminLeadConversation>
  quickReplies?: typeof getAdminQuickReplies
  templates?: typeof listWaTemplates
  send?: typeof sendLeadMessage
  suggest?: typeof suggestLeadReply
}

/** El juego completo, el que usa el admin. */
const ADMIN_CONVERSATION_ACTIONS: ConversationPanelActions = {
  load: getAdminLeadConversation,
  quickReplies: getAdminQuickReplies,
  templates: listWaTemplates,
  send: sendLeadMessage,
  suggest: suggestLeadReply,
}

/**
 * Hilo completo de un prospecto: timeline, ventana de 24 h, respuestas rápidas y
 * compositor. Se usa tanto en la pestaña Bandeja como dentro del drawer del lead.
 */
export function LeadConversationPanel({
  prospectId,
  onBack,
  onSent,
  className = "h-[70vh] lg:h-[calc(100vh-15rem)]",
  actions = ADMIN_CONVERSATION_ACTIONS,
}: ConversationPanelProps) {
  const { toast } = useToast()
  const [conversation, setConversation] = useState<AdminLeadConversation | null>(null)
  const [quickReplies, setQuickReplies] = useState<AdminQuickReply[]>([])
  const [templates, setTemplates] = useState<{ template_name: string; language: string }[]>([])
  const [body, setBody] = useState("")
  const [templateName, setTemplateName] = useState("")
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [suggesting, setSuggesting] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setConversation(await actions.load(prospectId))
    } catch (e) {
      toast(e instanceof Error ? e.message : "No se pudo abrir la conversación", "error")
      setConversation(null)
    } finally {
      setLoading(false)
    }
  }, [actions, prospectId, toast])

  useEffect(() => {
    void Promise.resolve().then(load)
  }, [load])

  useEffect(() => {
    if (!actions.quickReplies) return
    void actions
      .quickReplies()
      .then(setQuickReplies)
      .catch(() => setQuickReplies([]))
  }, [actions])

  useEffect(() => {
    if (!actions.templates) return
    void actions
      .templates()
      .then((rows) =>
        setTemplates(
          rows
            .filter((r) => r.status === "approved")
            .map((r) => ({ template_name: r.template_name, language: r.language })),
        ),
      )
      .catch(() => setTemplates([]))
  }, [actions])

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" })
  }, [conversation])

  const windowOpen = conversation?.window.open ?? false

  async function send(input: { body?: string; quickReplyId?: number; templateName?: string }) {
    if (!actions.send) return
    setSending(true)
    try {
      const result = await actions.send(prospectId, {
        ...input,
        languageCode: "es_MX",
      })
      if (!result.ok) {
        toast(REFUSAL_LABEL[result.error], "warning")
        return
      }
      toast("Mensaje enviado", "success")
      setBody("")
      await load()
      onSent()
    } catch (e) {
      toast(e instanceof Error ? e.message : "No se pudo enviar el mensaje", "error")
    } finally {
      setSending(false)
    }
  }

  async function suggest() {
    if (!actions.suggest) return
    setSuggesting(true)
    try {
      const suggestion = await actions.suggest(prospectId)
      setBody(suggestion.draft)
      if (suggestion.source === "template") {
        toast("Sugerencia de respaldo: revisa y edita antes de enviar", "warning")
      } else {
        toast("Sugerencia lista: revísala antes de enviar", "success")
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : "No se pudo sugerir una respuesta", "error")
    } finally {
      setSuggesting(false)
    }
  }

  return (
    <section
      className={`${CARD} flex flex-col overflow-hidden ${className}`}
      aria-label={`Conversación con ${conversation?.prospect.name ?? "el prospecto"}`}
    >
      <header className="flex items-start justify-between gap-3 border-b border-gray-100 px-4 py-3">
        <div className="flex min-w-0 items-start gap-2">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              aria-label="Volver a la lista"
              className="-ml-1 rounded-lg p-2 text-gray-400 hover:bg-gray-100 lg:hidden"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}
          <div className="min-w-0">
            <h3 className="truncate text-sm font-bold text-gray-900">
              {conversation?.prospect.name ?? "Conversación"}
            </h3>
            <p className="truncate text-[11px] text-gray-500">
              {conversation?.prospect.whatsapp ??
                conversation?.prospect.phone ??
                "Sin teléfono"}
              {conversation?.seller && ` · ${conversation.seller.name}`}
            </p>
            {conversation && (
              <FirstResponseHint minutes={conversation.firstResponseMinutes} />
            )}
          </div>
        </div>
        {conversation && (
          <div className="flex-none text-right">
            <span
              className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                windowOpen ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
              }`}
            >
              {windowOpen ? "Ventana abierta" : "Ventana cerrada"}
            </span>
            <p className="mt-0.5 text-[11px] text-gray-400">
              {conversation.window.hoursLeft !== null
                ? `${conversation.window.hoursLeft} h restantes`
                : "Sin mensajes entrantes"}
            </p>
          </div>
        )}
      </header>

      <div className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
        {loading && (
          <p className="flex items-center gap-2 py-8 text-xs text-gray-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" /> Cargando hilo...
          </p>
        )}

        {!loading && conversation?.timeline.length === 0 && (
          <p className="py-8 text-center text-xs text-gray-400">
            Sin mensajes ni actividades registradas
          </p>
        )}

        {conversation?.timeline.map((entry) => (
          <TimelineBubble key={entry.key} entry={entry} />
        ))}
        <div ref={endRef} />
      </div>

      <footer className="border-t border-gray-100 px-4 py-3">
        {conversation && !windowOpen && (
          <p className="mb-2 flex items-start gap-1.5 rounded-lg bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800">
            <AlertTriangle className="mt-0.5 h-3 w-3 flex-none" />
            Pasaron más de 24 h desde el último mensaje del cliente: WhatsApp solo acepta plantillas
            aprobadas.
          </p>
        )}

        {!actions.send ? (
          <p className="text-[11px] text-gray-500">
            Vista de solo lectura. Para escribir, usa los botones de WhatsApp de la ficha: abren la
            conversación con el mensaje ya redactado.
          </p>
        ) : conversation && !windowOpen ? (
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              aria-label="Plantilla aprobada"
              className={`${FILTER_FIELD} min-w-[200px] flex-1`}
            >
              <option value="">Elige una plantilla</option>
              {templates.map((t) => (
                <option key={t.template_name} value={t.template_name}>
                  {t.template_name}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={sending || !templateName}
              onClick={() => void send({ templateName })}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              <Send className="h-3.5 w-3.5" /> Enviar plantilla
            </button>
            {templates.length === 0 && (
              <p className="text-[11px] text-gray-400">No hay plantillas aprobadas disponibles</p>
            )}
          </div>
        ) : (
          <>
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              {actions.suggest && (
                <button
                  type="button"
                  disabled={sending || suggesting}
                  onClick={() => void suggest()}
                  title="Redacta un borrador con IA a partir de la conversación. Nunca se envía solo."
                  className="inline-flex items-center gap-1 rounded-full border border-brand-200 bg-brand-50 px-2 py-1 text-[11px] font-semibold text-brand-700 hover:bg-brand-100 disabled:opacity-50"
                >
                  {suggesting ? (
                    <Loader2 className="h-3 w-3 animate-spin motion-reduce:animate-none" />
                  ) : (
                    <Sparkles className="h-3 w-3" />
                  )}
                  Sugerir respuesta
                </button>
              )}
              {quickReplies.slice(0, 8).map((qr) => (
                <button
                  key={qr.id}
                  type="button"
                  disabled={sending}
                  title={qr.body}
                  onClick={() => void send({ quickReplyId: qr.id })}
                  className="rounded-full border border-gray-200 px-2 py-1 text-[11px] font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                >
                  {qr.title}
                </button>
              ))}
            </div>
            <div className="flex items-end gap-2">
              <label className="flex-1">
                <span className="sr-only">Mensaje</span>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={2}
                  placeholder="Escribe un mensaje..."
                  className={`${FILTER_FIELD} w-full resize-none`}
                />
              </label>
              <button
                type="button"
                disabled={sending || body.trim().length === 0}
                onClick={() => void send({ body })}
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {sending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
                ) : (
                  <Send className="h-3.5 w-3.5" />
                )}
                Enviar
              </button>
            </div>
          </>
        )}
      </footer>
    </section>
  )
}

function TimelineBubble({ entry }: { entry: LeadTimelineEntry }) {
  const outbound = entry.direction === "outbound"
  const isWhatsApp = entry.source === "whatsapp"

  if (!isWhatsApp) {
    return (
      <p className="flex items-center justify-center gap-1.5 py-0.5 text-[11px] text-gray-400">
        {entry.source === "automation" ? (
          <Check className="h-3 w-3" />
        ) : (
          <UserRound className="h-3 w-3" />
        )}
        <span className="truncate">
          {entry.source === "automation" ? "Automatización" : "Actividad"} ·{" "}
          {entry.content ?? "sin detalle"}
        </span>
        <span className="flex-none">{formatRelativeTime(entry.created_at)}</span>
      </p>
    )
  }

  return (
    <div className={`flex ${outbound ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
          outbound ? "bg-brand-600 text-white" : "bg-gray-100 text-gray-900"
        }`}
      >
        <p className="whitespace-pre-wrap break-words">{entry.content ?? "(sin contenido)"}</p>
        <p className={`mt-0.5 text-[10px] ${outbound ? "text-white/70" : "text-gray-400"}`}>
          <MessageCircle className="mr-0.5 inline h-2.5 w-2.5" />
          {formatRelativeTime(entry.created_at)}
          {entry.message_type && ` · ${entry.message_type}`}
        </p>
      </div>
    </div>
  )
}

/** Tiempo de primera respuesta, con "—" cuando todavía no hay denominador. */
export function FirstResponseHint({ minutes }: { minutes: number | null }) {
  return <span className="text-[11px] text-gray-400">Primera respuesta: {formatMinutes(minutes)}</span>
}
