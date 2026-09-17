"use client"

// ============================================================
// Inbox de WhatsApp del restaurante: conversaciones por cliente
// con respuesta de texto (ventana 24h) y envío del catálogo.
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import {
  getFoodosPanelData,
  listWaMessages,
  markWaConversationRead,
  sendWaReply,
  sendCatalogToCustomer,
  listMeseroSessions,
  takeOverMeseroSession,
  resumeMeseroSession,
  type MeseroSessionRow,
} from "../actions"
import { createClient } from "@/lib/supabase/client"
import type { FoodosRestaurant, FoodosWhatsAppMessage } from "@/types/foodos"
import { Bot, Inbox, Loader2, Send, Store, UserRound } from "lucide-react"
import ToolGuideHost from "@/components/panel/guide/tool-guide-host"
import { t } from "@/lib/i18n/es"
import { useTierGuard } from "@/hooks/use-tier-guard"

/** Normaliza un teléfono para casar sesiones del Mesero IA con el hilo. */
function digits(phone: string): string {
  return phone.replace(/\D/g, "")
}

interface Conversation {
  phone: string
  lastMessage: FoodosWhatsAppMessage
  unread: number
  messages: FoodosWhatsAppMessage[]
}

export default function WaInboxPage() {
  const [restaurant, setRestaurant] = useState<FoodosRestaurant | null>(null)
  const [messages, setMessages] = useState<FoodosWhatsAppMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<string | null>(null)
  const [reply, setReply] = useState("")
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aiSessions, setAiSessions] = useState<MeseroSessionRow[]>([])
  const [aiBusy, setAiBusy] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const { run: guard, upsellDialog } = useTierGuard("mesero_ia")

  const load = useCallback(async () => {
    try {
      const { restaurant: r } = await getFoodosPanelData()
      setRestaurant(r)
      if (r) {
        setMessages(await listWaMessages(r.id))
        setAiSessions(await listMeseroSessions(r.id))
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const run = async () => { await load() }
    run()
  }, [load])

  // Realtime: mensajes nuevos aparecen al instante
  useEffect(() => {
    if (!restaurant) return
    const supabase = createClient()
    if (!supabase) return
    const channel = supabase
      .channel(`foodos-wa-${restaurant.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "foodos_whatsapp_messages", filter: `restaurant_id=eq.${restaurant.id}` },
        (payload) => {
          const row = payload.new as FoodosWhatsAppMessage
          setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [row, ...prev]))
        }
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [restaurant])

  const conversations = useMemo<Conversation[]>(() => {
    const byPhone = new Map<string, FoodosWhatsAppMessage[]>()
    for (const m of messages) {
      const list = byPhone.get(m.customer_phone) ?? []
      list.push(m)
      byPhone.set(m.customer_phone, list)
    }
    return [...byPhone.entries()]
      .map(([phone, msgs]) => ({
        phone,
        lastMessage: msgs[0] as FoodosWhatsAppMessage,
        unread: msgs.filter((m) => m.direction === "inbound" && !m.read_at).length,
        messages: [...msgs].reverse(),
      }))
      .sort((a, b) => new Date(b.lastMessage.created_at).getTime() - new Date(a.lastMessage.created_at).getTime())
  }, [messages])

  const active = conversations.find((c) => c.phone === selected) ?? null

  // Sesión del Mesero IA que corresponde al hilo abierto (los teléfonos
  // pueden llegar con o sin prefijo, así que se comparan solo los dígitos).
  const activeAi = useMemo(() => {
    if (!active) return null
    const phone = digits(active.phone)
    return aiSessions.find((s) => digits(s.customer_phone) === phone) ?? null
  }, [active, aiSessions])

  async function toggleAi(takeOver: boolean) {
    if (!activeAi) return
    setAiBusy(true)
    setError(null)
    try {
      const attempt = await guard(() =>
        takeOver ? takeOverMeseroSession(activeAi.id) : resumeMeseroSession(activeAi.id)
      )
      if (!attempt.ran) return
      if (restaurant) setAiSessions(await listMeseroSessions(restaurant.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cambiar el control de la conversación")
    } finally {
      setAiBusy(false)
    }
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [active?.messages.length])

  async function handleSelect(phone: string) {
    setSelected(phone)
    if (!restaurant) return
    await markWaConversationRead(restaurant.id, phone)
    setMessages((prev) =>
      prev.map((m) =>
        m.customer_phone === phone && m.direction === "inbound"
          ? { ...m, read_at: m.read_at ?? new Date().toISOString() }
          : m
      )
    )
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    if (!restaurant || !selected || !reply.trim()) return
    setSending(true)
    setError(null)
    try {
      await sendWaReply(restaurant.id, selected, reply)
      setReply("")
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo enviar (¿pasaron más de 24h del último mensaje del cliente?)")
    } finally {
      setSending(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-[#0E7A0E]" />
      </div>
    )
  }

  if (!restaurant) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
        <Inbox className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <h2 className="font-semibold text-gray-900">Primero crea tu restaurante</h2>
        <p className="text-sm text-gray-500 mt-1">
          Y conecta tu WhatsApp en <Link href="/panel/foodos/whatsapp" className="text-[#0E7A0E] font-semibold hover:underline">WhatsApp</Link>.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Inbox de WhatsApp</h1>
        <p className="text-sm text-gray-500 mt-1">
          Mensajes que llegan a tu número de WhatsApp Business.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 h-[70vh]">
        {/* Lista de conversaciones */}
        <div className="bg-white rounded-2xl border border-gray-100 overflow-y-auto">
          {conversations.length === 0 ? (
            <div className="p-8 text-center text-gray-400 text-sm">
              <Inbox className="w-8 h-8 mx-auto mb-2 text-gray-300" />
              Sin conversaciones todavía.
            </div>
          ) : (
            conversations.map((c) => (
              <button
                key={c.phone}
                onClick={() => handleSelect(c.phone)}
                className={`w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-gray-50 ${selected === c.phone ? "bg-[#F0FDF4]" : ""}`}
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-gray-800 font-mono">{c.phone}</p>
                  {c.unread > 0 && (
                    <span className="text-[10px] font-bold bg-[#25D366] text-white px-2 py-0.5 rounded-full">{c.unread}</span>
                  )}
                </div>
                <p className="text-xs text-gray-500 truncate mt-0.5">
                  {c.lastMessage.direction === "outbound" ? "Tú: " : ""}
                  {c.lastMessage.type === "text" ? c.lastMessage.content : `[${c.lastMessage.type}]`}
                </p>
              </button>
            ))
          )}
        </div>

        {/* Hilo */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 flex flex-col">
          {!active ? (
            <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
              Selecciona una conversación
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-gray-100 flex-wrap">
                <div className="flex items-center gap-2 min-w-0">
                  <p className="font-semibold text-gray-900 font-mono text-sm">{active.phone}</p>
                  {activeAi && (
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${
                        activeAi.handoff_at
                          ? "bg-amber-50 text-amber-700"
                          : "bg-emerald-50 text-emerald-700"
                      }`}
                    >
                      {activeAi.handoff_at
                        ? t("foodos.mesero.humanBadge")
                        : t("foodos.mesero.aiBadge")}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {activeAi && (
                    <button
                      onClick={() => void toggleAi(!activeAi.handoff_at)}
                      disabled={aiBusy}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-gray-200 text-xs font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                      {aiBusy ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : activeAi.handoff_at ? (
                        <Bot className="w-3.5 h-3.5" />
                      ) : (
                        <UserRound className="w-3.5 h-3.5" />
                      )}
                      {activeAi.handoff_at
                        ? t("foodos.mesero.resume")
                        : t("foodos.mesero.takeOver")}
                    </button>
                  )}
                  <button
                    onClick={async () => {
                      if (!restaurant) return
                      try {
                        await sendCatalogToCustomer(restaurant.id, active.phone)
                      } catch (err) {
                        setError(err instanceof Error ? err.message : "Error al enviar catálogo")
                      }
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#25D366] text-white text-xs font-bold hover:bg-[#1fb857]"
                  >
                    <Store className="w-3.5 h-3.5" /> Enviar catálogo
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {active.messages.map((m) => (
                  <div key={m.id} className={`flex ${m.direction === "outbound" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-sm ${
                      m.direction === "outbound"
                        ? "bg-[#DCF8C6] text-gray-900 rounded-br-sm"
                        : "bg-gray-100 text-gray-800 rounded-bl-sm"
                    }`}>
                      {m.type === "text" ? m.content : <em className="text-xs text-gray-500">[{m.type}] {m.content}</em>}
                      <p className="text-[10px] text-gray-400 mt-1 text-right">
                        {new Date(m.created_at).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>

              {error && <p className="px-4 pb-1 text-xs text-red-600">{error}</p>}
              <form onSubmit={handleSend} className="flex gap-2 p-3 border-t border-gray-100">
                <input
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  placeholder="Escribe un mensaje…"
                  className="flex-1 rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0E7A0E]/30 focus:border-[#0E7A0E]"
                />
                <button
                  type="submit"
                  disabled={sending || !reply.trim()}
                  className="p-2.5 rounded-xl bg-[#25D366] text-white hover:bg-[#1fb857] disabled:opacity-40"
                  aria-label="Enviar"
                >
                  {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
      <ToolGuideHost toolKey="inbox" pathname="/panel/foodos/inbox" slug={null} icon="📥" title="Inbox de WhatsApp" />

      {upsellDialog}
    </div>
  )
}
