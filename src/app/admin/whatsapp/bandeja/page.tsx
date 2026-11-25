"use client"

// ============================================================
// Bandeja de entrada de WhatsApp de la tienda (Ola 6)
// ============================================================
// Conversaciones del número de la tienda desde whatsapp_messages
// (API: /api/whatsapp/inbox). Se puede leer el hilo y responder
// desde aquí: texto libre dentro de la ventana de 24 h y
// plantillas aprobadas fuera de ella (el servidor revalida la
// ventana al enviar; esto solo refleja el estado).
//
// Cada mensaje trae su marca de autor: Cliente, Asistente IA,
// Bot, Automático (plantillas/workflows) o Equipo. Cuando una
// persona atiende un chat, puede PAUSAR el bot de esa
// conversación: el bot deja de responder lo conversacional y
// lo transaccional sigue su curso.
//
// Sin tiempo real: refresco manual + polling cada 20 s, como el
// resto del panel.

import { useCallback, useEffect, useRef, useState } from "react"
import {
  Bot,
  Clock,
  MessageCircle,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  Send,
  Sparkles,
  User,
  Users,
} from "lucide-react"

type WaAuthor = "cliente" | "ia" | "bot" | "automatico" | "equipo"

interface ConversationSummary {
  key: string
  phone: string
  name: string | null
  lastText: string
  lastAt: string
  lastDirection: "inbound" | "outbound"
  lastAuthor: WaAuthor
  needsReply: boolean
  windowOpen: boolean
  botPaused: boolean
}

interface ConversationMessage {
  id: number
  direction: "inbound" | "outbound"
  created_at: string
  author: WaAuthor
  displayText: string
}

interface ConversationDetail {
  key: string
  phone: string
  name: string | null
  messages: ConversationMessage[]
  window: { open: boolean; hoursLeft: number | null }
  botPaused: boolean
  approvedTemplates: string[]
}

const AUTHOR_BADGE: Record<WaAuthor, { label: string; className: string }> = {
  cliente: { label: "Cliente", className: "bg-gray-100 text-gray-600" },
  ia: { label: "Asistente IA", className: "bg-violet-100 text-violet-700" },
  bot: { label: "Bot", className: "bg-sky-100 text-sky-700" },
  automatico: { label: "Automático", className: "bg-amber-100 text-amber-700" },
  equipo: { label: "Equipo", className: "bg-emerald-100 text-emerald-700" },
}

function AuthorIcon({ author }: { author: WaAuthor }) {
  const cls = "w-3.5 h-3.5"
  if (author === "ia") return <Sparkles className={cls} />
  if (author === "bot" || author === "automatico") return <Bot className={cls} />
  if (author === "equipo") return <Users className={cls} />
  return <User className={cls} />
}

function formatWhen(iso: string): string {
  const date = new Date(iso)
  const today = new Date()
  const sameDay = date.toDateString() === today.toDateString()
  return sameDay
    ? date.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString("es-MX", { day: "numeric", month: "short" }) +
        " " +
        date.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })
}

export default function WhatsAppInboxPage() {
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [loadingList, setLoadingList] = useState(true)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [detail, setDetail] = useState<ConversationDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [draft, setDraft] = useState("")
  const [templateName, setTemplateName] = useState("")
  const [sending, setSending] = useState(false)
  const [togglingPause, setTogglingPause] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const threadRef = useRef<HTMLDivElement>(null)

  const loadList = useCallback(async () => {
    try {
      const res = await fetch("/api/whatsapp/inbox")
      if (!res.ok) throw new Error("list")
      const data = (await res.json()) as { conversations: ConversationSummary[] }
      setConversations(data.conversations)
    } catch {
      setError("No se pudieron cargar las conversaciones.")
    } finally {
      setLoadingList(false)
    }
  }, [])

  const loadDetail = useCallback(async (key: string) => {
    try {
      const res = await fetch(`/api/whatsapp/inbox/${key}`)
      if (!res.ok) throw new Error("detail")
      const data = (await res.json()) as { conversation: ConversationDetail }
      setDetail(data.conversation)
    } catch {
      setError("No se pudo cargar la conversación.")
    } finally {
      setLoadingDetail(false)
    }
  }, [])

  useEffect(() => {
    const run = async () => {
      await loadList()
    }
    run().catch(() => {})
    const timer = setInterval(() => void loadList(), 20_000)
    return () => clearInterval(timer)
  }, [loadList])

  useEffect(() => {
    if (!selectedKey) return
    const timer = setInterval(() => void loadDetail(selectedKey), 20_000)
    return () => clearInterval(timer)
  }, [selectedKey, loadDetail])

  useEffect(() => {
    const el = threadRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [detail?.messages.length])

  const openConversation = (key: string) => {
    setSelectedKey(key)
    setDetail(null)
    setLoadingDetail(true)
    setDraft("")
    setTemplateName("")
    setNotice(null)
    setError(null)
    void loadDetail(key)
  }

  const sendMessage = async () => {
    if (!selectedKey || sending) return
    const useTemplate = detail && !detail.window.open
    const body = draft.trim()
    if (useTemplate && !templateName) {
      setError("Elige una plantilla aprobada para enviar fuera de la ventana de 24 h.")
      return
    }
    if (!useTemplate && !body) return
    setSending(true)
    setError(null)
    try {
      const res = await fetch(`/api/whatsapp/inbox/${selectedKey}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          useTemplate ? { templateName } : { body }
        ),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(data.error ?? "send")
      setDraft("")
      setTemplateName("")
      setNotice("Mensaje enviado.")
      await Promise.all([loadDetail(selectedKey), loadList()])
    } catch (err) {
      setError(
        err instanceof Error && err.message !== "send"
          ? err.message
          : "No se pudo enviar el mensaje."
      )
    } finally {
      setSending(false)
    }
  }

  const togglePause = async () => {
    if (!selectedKey || !detail || togglingPause) return
    setTogglingPause(true)
    setError(null)
    try {
      const res = await fetch(`/api/whatsapp/inbox/${selectedKey}/pause`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paused: !detail.botPaused }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(data.error ?? "pause")
      setNotice(
        !detail.botPaused
          ? "Bot pausado en esta conversación: el equipo atiende el chat."
          : "Bot reanudado en esta conversación."
      )
      await Promise.all([loadDetail(selectedKey), loadList()])
    } catch (err) {
      setError(
        err instanceof Error && err.message !== "pause"
          ? err.message
          : "No se pudo cambiar la pausa."
      )
    } finally {
      setTogglingPause(false)
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Bandeja de WhatsApp</h1>
          <p className="text-sm text-gray-500">
            Conversaciones del número de la tienda. Responde desde aquí; fuera de la
            ventana de 24 h solo salen plantillas aprobadas.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setLoadingList(true)
            void loadList()
            if (selectedKey) void loadDetail(selectedKey)
          }}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <RefreshCw className="w-4 h-4" /> Actualizar
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {notice && (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {notice}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
        {/* Lista de conversaciones */}
        <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
          {loadingList && conversations.length === 0 ? (
            <p className="p-4 text-sm text-gray-500">Cargando conversaciones…</p>
          ) : conversations.length === 0 ? (
            <p className="p-4 text-sm text-gray-500">
              Todavía no hay conversaciones de WhatsApp registradas.
            </p>
          ) : (
            <ul className="divide-y divide-gray-100 max-h-[70vh] overflow-y-auto">
              {conversations.map((c) => (
                <li key={c.key}>
                  <button
                    type="button"
                    onClick={() => openConversation(c.key)}
                    className={`w-full text-left px-4 py-3 hover:bg-gray-50 ${
                      selectedKey === c.key ? "bg-emerald-50" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-gray-900 truncate">
                        {c.name ?? c.phone}
                      </span>
                      <span className="text-xs text-gray-500 shrink-0">
                        {formatWhen(c.lastAt)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-sm text-gray-500 truncate">{c.lastText}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${AUTHOR_BADGE[c.lastAuthor].className}`}
                      >
                        <AuthorIcon author={c.lastAuthor} />
                        {AUTHOR_BADGE[c.lastAuthor].label}
                      </span>
                      {c.needsReply && (
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-700">
                          Sin responder
                        </span>
                      )}
                      {c.botPaused && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-gray-800 px-2 py-0.5 text-[11px] font-medium text-white">
                          <PauseCircle className="w-3 h-3" /> Bot en pausa
                        </span>
                      )}
                      {!c.windowOpen && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
                          <Clock className="w-3 h-3" /> Ventana cerrada
                        </span>
                      )}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Hilo + compositor */}
        <div className="rounded-2xl border border-gray-200 bg-white flex flex-col min-h-[70vh]">
          {!selectedKey ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center text-gray-500">
              <MessageCircle className="w-10 h-10" />
              <p className="text-sm">Elige una conversación para leerla y responder.</p>
            </div>
          ) : loadingDetail && !detail ? (
            <p className="p-4 text-sm text-gray-500">Cargando conversación…</p>
          ) : detail ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-4 py-3">
                <div>
                  <p className="font-semibold text-gray-900">
                    {detail.name ?? detail.phone}
                  </p>
                  <p className="text-xs text-gray-500">
                    {detail.phone} ·{" "}
                    {detail.window.open
                      ? `Ventana abierta${detail.window.hoursLeft != null ? ` (${detail.window.hoursLeft} h restantes)` : ""}`
                      : "Ventana de 24 h cerrada: solo plantillas"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void togglePause()}
                  disabled={togglingPause}
                  className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50 ${
                    detail.botPaused
                      ? "bg-emerald-700 text-white hover:bg-emerald-800"
                      : "bg-gray-800 text-white hover:bg-gray-900"
                  }`}
                >
                  {detail.botPaused ? (
                    <>
                      <PlayCircle className="w-4 h-4" /> Reanudar el bot
                    </>
                  ) : (
                    <>
                      <PauseCircle className="w-4 h-4" /> Pausar el bot aquí
                    </>
                  )}
                </button>
              </div>

              <div ref={threadRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-gray-50">
                {detail.messages.map((m) => {
                  const inbound = m.direction === "inbound"
                  return (
                    <div
                      key={m.id}
                      className={`flex ${inbound ? "justify-start" : "justify-end"}`}
                    >
                      <div
                        className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm shadow-sm ${
                          inbound
                            ? "bg-white text-gray-800 rounded-bl-md"
                            : "bg-emerald-700 text-white rounded-br-md"
                        }`}
                      >
                        <p className="whitespace-pre-wrap break-words">{m.displayText}</p>
                        <div
                          className={`mt-1 flex items-center gap-1.5 text-[11px] ${
                            inbound ? "text-gray-500" : "text-emerald-100"
                          }`}
                        >
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-1.5 py-px font-medium ${AUTHOR_BADGE[m.author].className}`}
                          >
                            <AuthorIcon author={m.author} />
                            {AUTHOR_BADGE[m.author].label}
                          </span>
                          <span>{formatWhen(m.created_at)}</span>
                        </div>
                      </div>
                    </div>
                  )
                })}
                {detail.messages.length === 0 && (
                  <p className="text-sm text-gray-500">Sin mensajes en esta conversación.</p>
                )}
              </div>

              <div className="border-t border-gray-100 px-4 py-3">
                {detail.window.open ? (
                  <div className="flex items-end gap-2">
                    <textarea
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      rows={2}
                      aria-label="Respuesta del equipo"
                      placeholder="Escribe la respuesta del equipo…"
                      className="flex-1 resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => void sendMessage()}
                      disabled={sending || !draft.trim()}
                      className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
                    >
                      <Send className="w-4 h-4" /> Enviar
                    </button>
                  </div>
                ) : (
                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <label className="mb-1 block text-xs font-medium text-gray-500">
                        La ventana de 24 h está cerrada: envía una plantilla aprobada
                      </label>
                      <select
                        value={templateName}
                        onChange={(e) => setTemplateName(e.target.value)}
                        aria-label="Plantilla aprobada para enviar"
                        className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                      >
                        <option value="">Elige una plantilla…</option>
                        {detail.approvedTemplates.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button
                      type="button"
                      onClick={() => void sendMessage()}
                      disabled={sending || !templateName}
                      className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
                    >
                      <Send className="w-4 h-4" /> Enviar plantilla
                    </button>
                  </div>
                )}
                <p className="mt-2 text-xs text-gray-500">
                  Al responder una persona, considera pausar el bot de esta conversación
                  para que no se pise con el equipo. Lo transaccional (pedidos,
                  comprobantes) sigue funcionando aunque el bot esté en pausa.
                </p>
              </div>
            </>
          ) : (
            <p className="p-4 text-sm text-gray-500">No se pudo cargar la conversación.</p>
          )}
        </div>
      </div>
    </div>
  )
}
