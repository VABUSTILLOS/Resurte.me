"use client"

/**
 * Ronda 7 (F5) — bandeja de conversación, compartida por las dos superficies.
 *
 * Vivía en `src/app/admin/components/LeadConversations.tsx`. Se movió aquí al
 * fusionarse con Comercialización, por la misma razón que la ficha de prospecto
 * se movió a `src/components/crm/`: una pieza con dos consumidores no pertenece
 * a la carpeta de uno de ellos.
 *
 * Todo lo que la bandeja hace contra el servidor entra por `actions`, y **no hay
 * juego por defecto**. Es deliberado: si el panel importara las acciones de
 * administración para tener un valor por omisión, el vendedor cargaría el
 * módulo de acciones del admin en su bundle y su bandeja tendría a mano un
 * compositor que responde "Acceso restringido a administradores". Al ser
 * obligatorio, la superficie declara qué puede hacer, y lo que no declara no se
 * pinta.
 *
 * De `@/app/admin/actions` solo se importan **tipos** (`import type`): se borran
 * al compilar, así que no crean dependencia en tiempo de ejecución.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Loader2,
  MessageCircle,
  Send,
  Sparkles,
  UserRound,
} from "lucide-react"
import type {
  AdminQuickReply,
  LeadMessageRefusal,
  LeadMessageResult,
  LeadReplySuggestion,
  SendLeadMessageInput,
  WaTemplateRow,
} from "@/app/admin/actions"
import { activeQuickReplies } from "@/lib/crm-inbox"
import { formatMinutes } from "@/lib/crm-assignment"
import { formatRelativeTime } from "@/lib/relative-time"
import { useToast } from "@/components/toast"
import type { LeadConversation, LeadTimelineEntry } from "@/lib/crm-conversation"

export const CARD = "rounded-xl border border-gray-200 bg-white"
export const FILTER_FIELD =
  "rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-700 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"

/** Motivo por el que el servidor se negó a enviar, en palabras del usuario. */
const REFUSAL_LABEL: Record<LeadMessageRefusal, string> = {
  not_found: "El prospecto ya no existe",
  no_phone: "Ese prospecto no tiene teléfono",
  empty_message: "Escribe algo antes de enviar",
  requires_template: "La ventana de 24 h está cerrada: usa una plantilla aprobada",
  quick_reply_not_found: "La respuesta rápida ya no existe",
}

/**
 * Lo que cada superficie puede hacer con la conversación.
 *
 * `load` es obligatorio y es donde vive la seguridad: el admin lee cualquier
 * prospecto, el vendedor solo los suyos. `send` y `suggest` ausentes dejan el
 * pie en modo lectura, en vez de ofrecer un compositor que respondería
 * "Acceso restringido a administradores" al primer clic.
 */
export interface ConversationPanelActions {
  load: (prospectId: number) => Promise<LeadConversation>
  quickReplies?: () => Promise<AdminQuickReply[]>
  templates?: () => Promise<WaTemplateRow[]>
  send?: (prospectId: number, input: SendLeadMessageInput) => Promise<LeadMessageResult>
  suggest?: (prospectId: number) => Promise<LeadReplySuggestion>
}

interface ConversationPanelProps {
  prospectId: number
  onBack?: () => void
  onSent: () => void
  className?: string
  /** Qué puede hacer esta superficie con la conversación. Obligatorio. */
  actions: ConversationPanelActions
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
  actions,
}: ConversationPanelProps) {
  const { toast } = useToast()
  const [conversation, setConversation] = useState<LeadConversation | null>(null)
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
              {activeQuickReplies(quickReplies)
                .slice(0, 8)
                .map((qr) => (
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

