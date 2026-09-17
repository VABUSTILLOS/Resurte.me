"use client"

// ============================================================
// Mesero IA — agente que toma pedidos completos por WhatsApp.
//
// Tres bloques:
//   1. Ajustes: activar, tono, saludo, handoff, topes, horario.
//   2. Resultados: conversaciones → pedidos, ticket promedio, derivaciones.
//   3. Simulador: usa la MISMA máquina de estados que producción
//      (`src/lib/foodos-ai-wa/state-machine.ts`) y no envía nada por WhatsApp.
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import {
  getFoodosPanelData,
  getMeseroSettings,
  upsertMeseroSettings,
  listMeseroSessions,
  getMeseroStats,
  takeOverMeseroSession,
  resumeMeseroSession,
  type MeseroSessionRow,
  type MeseroStats,
} from "../actions"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import StatCard from "@/components/panel/StatCard"
import ToolPreviewNotice from "@/components/panel/foodos/tool-preview-notice"
import { useTierGuard } from "@/hooks/use-tier-guard"
import ToolGuideHost from "@/components/panel/guide/tool-guide-host"
import { t } from "@/lib/i18n/es"
import { formatMoney } from "@/lib/foodos"
import {
  advance,
  NEW_SESSION,
  type MeseroMenu,
  type MeseroSession,
} from "@/lib/foodos-ai-wa/state-machine"
import type { FoodosMenuItem, FoodosRestaurant } from "@/types/foodos"
import {
  Bot,
  Loader2,
  MessageSquare,
  RefreshCw,
  Send,
  Sparkles,
  UserRound,
  Utensils,
  Percent,
  Receipt,
  RotateCcw,
} from "lucide-react"

const TONES: { id: "amable" | "formal" | "rapido" | "divertido"; label: string }[] = [
  { id: "amable", label: t("foodos.mesero.toneAmable") },
  { id: "formal", label: t("foodos.mesero.toneFormal") },
  { id: "rapido", label: t("foodos.mesero.toneRapido") },
  { id: "divertido", label: t("foodos.mesero.toneDivertido") },
]

const STATE_LABEL: Record<string, string> = {
  greeting: t("foodos.mesero.stateGreeting"),
  browsing: t("foodos.mesero.stateBrowsing"),
  choosing_fulfillment: t("foodos.mesero.stateChoosingFulfillment"),
  collecting_address: t("foodos.mesero.stateCollectingAddress"),
  collecting_name: t("foodos.mesero.stateCollectingName"),
  confirming: t("foodos.mesero.stateConfirming"),
  handoff: t("foodos.mesero.stateHandoff"),
  done: t("foodos.mesero.stateDone"),
}

interface FormState {
  is_enabled: boolean
  tone: "amable" | "formal" | "rapido" | "divertido"
  greeting: string
  handoff_enabled: boolean
  max_items: string
  daily_reply_cap: string
  business_hours_only: boolean
}

const EMPTY_FORM: FormState = {
  is_enabled: false,
  tone: "amable",
  greeting: "",
  handoff_enabled: true,
  max_items: "20",
  daily_reply_cap: "200",
  business_hours_only: false,
}

function meseroConfig(form: FormState) {
  return {
    maxItems: Math.min(Math.max(Number(form.max_items) || 20, 1), 50),
    handoffEnabled: form.handoff_enabled,
  }
}

export default function MeseroIaPage() {
  const { run, upsellDialog } = useTierGuard("mesero_ia")

  const [restaurant, setRestaurant] = useState<FoodosRestaurant | null>(null)
  const [items, setItems] = useState<FoodosMenuItem[]>([])
  const [sessions, setSessions] = useState<MeseroSessionRow[]>([])
  const [stats, setStats] = useState<MeseroStats | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)
  const [busySession, setBusySession] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getFoodosPanelData()
      setRestaurant(data.restaurant)
      setItems(data.items ?? [])
      if (!data.restaurant) return

      const [s, rows, metrics] = await Promise.all([
        getMeseroSettings(data.restaurant.id),
        listMeseroSessions(data.restaurant.id),
        getMeseroStats(data.restaurant.id),
      ])
      setSessions(rows)
      setStats(metrics)
      setForm(
        s
          ? {
              is_enabled: s.is_enabled,
              tone: s.tone,
              greeting: s.greeting ?? "",
              handoff_enabled: s.handoff_enabled,
              max_items: String(s.max_items),
              daily_reply_cap: String(s.daily_reply_cap),
              business_hours_only: s.business_hours_only,
            }
          : EMPTY_FORM
      )
    } catch (err) {
      setNotice({ ok: false, text: err instanceof Error ? err.message : "Error al cargar" })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const run = async () => {
      await load()
    }
    run()
  }, [load])

  const menu: MeseroMenu = useMemo(() => {
    const base = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "")
    return {
      restaurantName: restaurant?.name ?? "",
      orderLink: `${base}/r/${restaurant?.slug ?? ""}`,
      currency: "$",
      items: items.map((i) => ({
        id: i.id,
        name: i.name,
        price: Number(i.price) || 0,
        isAvailable: i.is_available,
        categoryName: null,
      })),
    }
  }, [items, restaurant])

  async function save() {
    if (!restaurant) return
    setSaving(true)
    setNotice(null)
    try {
      const attempt = await run(() =>
        upsertMeseroSettings({
          restaurant_id: restaurant.id,
          is_enabled: form.is_enabled,
          tone: form.tone,
          greeting: form.greeting,
          handoff_enabled: form.handoff_enabled,
          max_items: Number(form.max_items) || 20,
          daily_reply_cap: Number(form.daily_reply_cap) || 0,
          business_hours_only: form.business_hours_only,
        })
      )
      if (!attempt.ran) return
      setNotice({ ok: true, text: t("foodos.mesero.saved") })
      await load()
    } catch (err) {
      setNotice({ ok: false, text: err instanceof Error ? err.message : "Error al guardar" })
    } finally {
      setSaving(false)
    }
  }

  async function toggleHandoff(row: MeseroSessionRow, takeOver: boolean) {
    setBusySession(row.id)
    try {
      const attempt = await run(() =>
        takeOver ? takeOverMeseroSession(row.id) : resumeMeseroSession(row.id)
      )
      if (!attempt.ran) return
      await load()
    } catch (err) {
      setNotice({ ok: false, text: err instanceof Error ? err.message : "Error" })
    } finally {
      setBusySession(null)
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
      <div className="space-y-6">
        <Header />
        <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
          <Utensils className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500">{t("foodos.mesero.setupFirst")}</p>
          <Link
            href="/panel/foodos/restaurante"
            className="inline-block mt-3 text-[#0E7A0E] font-semibold hover:underline"
          >
            {t("foodos.common.setupTitle")}
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Header />

      <ToolPreviewNotice feature="mesero_ia" />

      {notice && (
        <div
          className={`rounded-xl px-4 py-3 text-sm border ${
            notice.ok
              ? "bg-emerald-50 border-emerald-200 text-emerald-700"
              : "bg-red-50 border-red-200 text-red-700"
          }`}
          role="status"
          aria-live="polite"
        >
          {notice.text}
        </div>
      )}

      {/* ── Resultados ─────────────────────────────────────── */}
      {stats && (
        <section>
          <h2 className="font-bold text-gray-900 mb-3">
            {t("foodos.mesero.statsTitle").replace("{days}", "30")}
          </h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard
              label={t("foodos.mesero.statConversations")}
              value={stats.conversations}
              icon={MessageSquare}
            />
            <StatCard
              label={t("foodos.mesero.statOrders")}
              value={stats.orders}
              icon={Receipt}
              tone="positive"
            />
            <StatCard
              label={t("foodos.mesero.statConversion")}
              value={`${Math.round(stats.conversion * 100)}%`}
              icon={Percent}
            />
            <StatCard
              label={t("foodos.mesero.statAvgTicket")}
              value={formatMoney(stats.avgTicket)}
              icon={Sparkles}
              hint={`${stats.handoffs} ${t("foodos.mesero.statHandoffs").toLowerCase()}`}
            />
          </div>
        </section>
      )}

      {/* ── Ajustes ────────────────────────────────────────── */}
      <section className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={form.is_enabled}
            onChange={(e) => setForm({ ...form, is_enabled: e.target.checked })}
            className="mt-0.5 w-5 h-5 accent-[#0E7A0E] touch-target"
          />
          <span>
            <span className="block font-semibold text-gray-900">{t("foodos.mesero.enabled")}</span>
            <span className="block text-sm text-gray-500">{t("foodos.mesero.enabledHint")}</span>
          </span>
        </label>

        <div>
          <span className="block text-sm font-semibold text-gray-700 mb-2">
            {t("foodos.mesero.tone")}
          </span>
          <div className="flex flex-wrap gap-2">
            {TONES.map((tone) => (
              <button
                key={tone.id}
                type="button"
                onClick={() => setForm({ ...form, tone: tone.id })}
                aria-pressed={form.tone === tone.id}
                className={`px-4 py-2 rounded-xl text-sm font-semibold border transition-colors touch-target ${
                  form.tone === tone.id
                    ? "bg-[#0E7A0E] text-white border-[#0E7A0E]"
                    : "bg-white text-gray-700 border-gray-200 hover:border-gray-300"
                }`}
              >
                {tone.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label
            htmlFor="mesero-greeting"
            className="block text-sm font-semibold text-gray-700 mb-1"
          >
            {t("foodos.mesero.greeting")}
          </label>
          <textarea
            id="mesero-greeting"
            value={form.greeting}
            onChange={(e) => setForm({ ...form, greeting: e.target.value })}
            placeholder={t("foodos.mesero.greetingPlaceholder")}
            rows={2}
            maxLength={500}
            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-[#0E7A0E] focus:outline-none"
          />
          <p className="text-xs text-gray-400 mt-1">{t("foodos.mesero.greetingHint")}</p>
        </div>

        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={form.handoff_enabled}
            onChange={(e) => setForm({ ...form, handoff_enabled: e.target.checked })}
            className="mt-0.5 w-5 h-5 accent-[#0E7A0E] touch-target"
          />
          <span>
            <span className="block font-semibold text-gray-900">{t("foodos.mesero.handoff")}</span>
            <span className="block text-sm text-gray-500">{t("foodos.mesero.handoffHint")}</span>
          </span>
        </label>

        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={form.business_hours_only}
            onChange={(e) => setForm({ ...form, business_hours_only: e.target.checked })}
            className="mt-0.5 w-5 h-5 accent-[#0E7A0E] touch-target"
          />
          <span className="font-semibold text-gray-900">
            {t("foodos.mesero.businessHoursOnly")}
          </span>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="mesero-max" className="block text-sm font-semibold text-gray-700 mb-1">
              {t("foodos.mesero.maxItems")}
            </label>
            <input
              id="mesero-max"
              type="number"
              min={1}
              max={50}
              value={form.max_items}
              onChange={(e) => setForm({ ...form, max_items: e.target.value })}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-[#0E7A0E] focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="mesero-cap" className="block text-sm font-semibold text-gray-700 mb-1">
              {t("foodos.mesero.dailyCap")}
            </label>
            <input
              id="mesero-cap"
              type="number"
              min={0}
              max={2000}
              value={form.daily_reply_cap}
              onChange={(e) => setForm({ ...form, daily_reply_cap: e.target.value })}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-[#0E7A0E] focus:outline-none"
            />
            <p className="text-xs text-gray-400 mt-1">{t("foodos.mesero.dailyCapHint")}</p>
          </div>
        </div>

        <p className="text-xs text-gray-500 bg-stone-50 rounded-xl p-3">
          {t("foodos.mesero.guarantee")}
        </p>

        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          {t("foodos.mesero.save")}
        </button>
      </section>

      {/* ── Simulador ──────────────────────────────────────── */}
      <Simulator menu={menu} config={meseroConfig(form)} />

      {/* ── Conversaciones ─────────────────────────────────── */}
      <section>
        <h2 className="font-bold text-gray-900 mb-3">{t("foodos.mesero.sessionsTitle")}</h2>
        {sessions.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-6 text-center">
            <Bot className="w-10 h-10 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-500">{t("foodos.mesero.emptySessions")}</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {sessions.map((row) => (
              <li
                key={row.id}
                className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center justify-between gap-3 flex-wrap"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900 truncate">{row.customer_phone}</p>
                  <p className="text-xs text-gray-500">
                    {STATE_LABEL[row.state] ?? row.state} · {row.message_count}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                      row.handoff_at ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"
                    }`}
                  >
                    {row.handoff_at ? t("foodos.mesero.humanBadge") : t("foodos.mesero.aiBadge")}
                  </span>
                  <button
                    type="button"
                    onClick={() => void toggleHandoff(row, !row.handoff_at)}
                    disabled={busySession === row.id}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 text-xs font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-50 touch-target"
                  >
                    {busySession === row.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : row.handoff_at ? (
                      <Bot className="w-3.5 h-3.5" />
                    ) : (
                      <UserRound className="w-3.5 h-3.5" />
                    )}
                    {row.handoff_at ? t("foodos.mesero.resume") : t("foodos.mesero.takeOver")}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ToolGuideHost
        toolKey="mesero-ia"
        pathname="/panel/foodos/mesero-ia"
        slug={restaurant.slug}
        icon="🤖"
        title={t("foodos.mesero.title")}
        subtitle={t("foodos.mesero.subtitle")}
      />

      {upsellDialog}
    </div>
  )
}

function Header() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">{t("foodos.mesero.title")}</h1>
      <p className="text-sm text-gray-500 mt-1">{t("foodos.mesero.subtitle")}</p>
    </div>
  )
}

// ------------------------------------------------------------
// Simulador: corre la máquina de estados real, sin red.
// ------------------------------------------------------------

interface SimBubble {
  id: number
  from: "guest" | "ai"
  text: string
  source?: "llm" | "template"
}

function Simulator({
  menu,
  config,
}: {
  menu: MeseroMenu
  config: { maxItems: number; handoffEnabled: boolean }
}) {
  const [open, setOpen] = useState(false)
  const [session, setSession] = useState<MeseroSession>(NEW_SESSION)
  const [bubbles, setBubbles] = useState<SimBubble[]>([])
  const [input, setInput] = useState("")
  const nextId = useRef(1)

  function send() {
    const text = input.trim()
    if (!text) return
    setInput("")

    const turn = advance({ session, text, menu, config })
    setSession({ state: turn.state, draft: turn.draft, pendingQuestion: turn.pendingQuestion })
    setBubbles((prev) => [
      ...prev,
      { id: nextId.current++, from: "guest", text },
      {
        id: nextId.current++,
        from: "ai",
        text: turn.reply || "…",
        source: turn.rephraseable ? "llm" : "template",
      },
    ])
  }

  function reset() {
    setSession(NEW_SESSION)
    setBubbles([])
    setInput("")
  }

  return (
    <>
      <section className="bg-white rounded-2xl border border-gray-100 p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="font-bold text-gray-900 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#0E7A0E]" /> {t("foodos.mesero.simulatorTitle")}
            </h2>
            <p className="text-sm text-gray-500 mt-1">{t("foodos.mesero.simulatorHint")}</p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="px-4 py-2 rounded-xl bg-[#0E7A0E] text-white text-sm font-bold hover:bg-[#0a5c0a] touch-target"
          >
            {t("foodos.mesero.simulatorTitle")}
          </button>
        </div>
      </section>

      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        ariaLabel={t("foodos.mesero.simulatorTitle")}
        maxWidthClass="max-w-lg"
      >
        <div className="flex flex-col h-[70vh]">
          <div className="flex-1 overflow-y-auto overscroll-contain space-y-3 py-3">
            {bubbles.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-8">
                {t("foodos.mesero.simulatorHint")}
              </p>
            )}
            {bubbles.map((b) => (
              <div key={b.id} className={`flex ${b.from === "guest" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-line ${
                    b.from === "guest" ? "bg-[#0E7A0E] text-white" : "bg-stone-100 text-gray-800"
                  }`}
                >
                  {b.text}
                  {b.from === "ai" && b.source && (
                    <span className="block mt-1 text-[10px] uppercase tracking-wide opacity-60">
                      {b.source === "llm"
                        ? t("foodos.mesero.simulatorSourceLlm")
                        : t("foodos.mesero.simulatorSourceTemplate")}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault()
              send()
            }}
            className="flex items-center gap-2 border-t border-gray-100 pt-3"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t("foodos.mesero.simulatorPlaceholder")}
              className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-[#0E7A0E] focus:outline-none"
              aria-label={t("foodos.mesero.simulatorPlaceholder")}
            />
            <button
              type="submit"
              className="p-2.5 rounded-xl bg-[#0E7A0E] text-white hover:bg-[#0a5c0a] touch-target"
              aria-label={t("foodos.mesero.simulatorSend")}
            >
              <Send className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={reset}
              className="p-2.5 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 touch-target"
              aria-label={t("foodos.mesero.simulatorReset")}
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </form>
        </div>
      </BottomSheet>
    </>
  )
}
