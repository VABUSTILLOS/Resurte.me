"use client"

// ============================================================
// Clientes y recurrencia — CRM (segmentos, gasto, pedidos) +
// automatizaciones de WhatsApp (agradecimiento, winback,
// promos de temporada) + historial de campañas.
// ============================================================

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  getFoodosPanelData,
  getLoyaltyProgram,
  upsertLoyaltyProgram,
  adjustCustomerCredit,
  listReviews,
  setReviewVisibility,
  listAutomations,
  listCampaigns,
  upsertAutomation,
  toggleAutomation,
  insertCampaign,
  runCampaignNow,
  deleteCampaign,
  getCampaignAbStats,
  generateCampaignCopy,
  updateCustomerProfile,
  type CampaignAbStats,
} from "../actions"
import { formatMoney, SEGMENT_META, segmentCustomer } from "@/lib/foodos"
import {
  AUDIENCE_PLAYBOOK,
  FOODOS_AUDIENCE_KEYS,
  buildAudiences,
  isAudienceKey,
} from "@/lib/foodos-rfm"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import StatCard from "@/components/panel/StatCard"
import type { FoodosMarketingChannel } from "@/types/foodos"
import type {
  FoodosLoyaltyProgram,
  FoodosReview,
  FoodosRestaurant,
  FoodosCustomer,
  FoodosAutomation,
  FoodosAutomationType,
  FoodosCampaign,
  FoodosCustomerSegment,
} from "@/types/foodos"
import {
  Users,
  Loader2,
  Plus,
  Trash2,
  Send,
  MessageSquare,
  Percent,
  CalendarClock,
  Star,
  Sparkles,
  Cake,
  FlaskConical,
  Target,
} from "lucide-react"
import ToolGuideHost from "@/components/panel/guide/tool-guide-host"
import ToolPreviewNotice from "@/components/panel/foodos/tool-preview-notice"
import { useTierGuard } from "@/hooks/use-tier-guard"
import { t } from "@/lib/i18n/es"

const AUTOMATION_TYPES: { id: FoodosAutomationType; label: string; hint: string }[] = [
  { id: "order_confirmation", label: t("foodos.clientes.autoOrderConfirmation"), hint: t("foodos.clientes.autoOrderConfirmationHint") },
  { id: "thank_you", label: t("foodos.clientes.autoThankYou"), hint: t("foodos.clientes.autoThankYouHint") },
  { id: "winback", label: t("foodos.clientes.autoWinback"), hint: t("foodos.clientes.autoWinbackHint") },
  { id: "season_promo", label: t("foodos.clientes.autoSeasonPromo"), hint: t("foodos.clientes.autoSeasonPromoHint") },
  { id: "off_hours", label: t("foodos.clientes.autoOffHours"), hint: t("foodos.clientes.autoOffHoursHint") },
  { id: "new_product", label: t("foodos.clientes.autoNewProduct"), hint: t("foodos.clientes.autoNewProductHint") },
  { id: "birthday", label: t("foodos.marketing.autoBirthday"), hint: t("foodos.marketing.autoBirthdayHint") },
  { id: "abandoned_cart", label: t("foodos.marketing.autoAbandonedCart"), hint: t("foodos.marketing.autoAbandonedCartHint") },
  { id: "review_request", label: t("foodos.marketing.autoReviewRequest"), hint: t("foodos.marketing.autoReviewRequestHint") },
]

/** Espejo local del tono que acepta la server action (evita importar el módulo de IA al bundle). */
type CampaignTone = "cercano" | "formal" | "urgente" | "festivo"

const CHANNEL_OPTIONS: { id: FoodosMarketingChannel; label: string }[] = [
  { id: "whatsapp", label: t("foodos.marketing.channelWhatsapp") },
  { id: "sms", label: t("foodos.marketing.channelSms") },
  { id: "both", label: t("foodos.marketing.channelBoth") },
]

function channelLabel(channel: FoodosMarketingChannel): string {
  return CHANNEL_OPTIONS.find((c) => c.id === channel)?.label ?? channel
}

function audienceLabelOf(value: string | null): string | null {
  return isAudienceKey(value) ? t(AUDIENCE_PLAYBOOK[value].labelKey) : null
}

const AI_TONES: { id: CampaignTone; label: string }[] = [
  { id: "cercano", label: t("foodos.marketing.toneCercano") },
  { id: "formal", label: t("foodos.marketing.toneFormal") },
  { id: "urgente", label: t("foodos.marketing.toneUrgente") },
  { id: "festivo", label: t("foodos.marketing.toneFestivo") },
]

interface AutomationForm {
  id?: string
  type: FoodosAutomationType
  name: string
  message: string
  message_b: string
  ab_test: boolean
  audience: string
  channel: FoodosMarketingChannel
  days_without_order: string
  discount_pct: string
}

const EMPTY_AUTO: AutomationForm = {
  type: "thank_you",
  name: "",
  message: "",
  message_b: "",
  ab_test: false,
  audience: "",
  channel: "whatsapp",
  days_without_order: "30",
  discount_pct: "10",
}

/** Editor de los datos que solo usa el marketing (cumpleaños y opt-in de SMS). */
interface ProfileDraft {
  id: string
  birthday: string
  sms_opt_in: boolean
}

const SEGMENT_FILTERS: { id: FoodosCustomerSegment | "all"; label: string }[] = [
  { id: "all", label: t("foodos.clientes.segmentAll") },
  { id: "vip", label: t("foodos.clientes.segmentVip") },
  { id: "recurrente", label: t("foodos.clientes.segmentRecurrente") },
  { id: "nuevo", label: t("foodos.clientes.segmentNuevo") },
  { id: "inactivo", label: t("foodos.clientes.segmentInactivo") },
]

export default function ClientesPage() {
  // El CRM es base; las automatizaciones y campañas son la capacidad premium
  // "marketing_ia" (Plata). El servidor las bloquea y aquí se explica por qué.
  const { run, upsellDialog } = useTierGuard("marketing_ia")

  const [restaurant, setRestaurant] = useState<FoodosRestaurant | null>(null)
  const [customers, setCustomers] = useState<FoodosCustomer[]>([])
  const [automations, setAutomations] = useState<FoodosAutomation[]>([])
  const [campaigns, setCampaigns] = useState<FoodosCampaign[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [segmentFilter, setSegmentFilter] = useState<FoodosCustomerSegment | "all">("all")
  const [search, setSearch] = useState("")

  const [showAutoForm, setShowAutoForm] = useState(false)
  const [autoForm, setAutoForm] = useState<AutomationForm>(EMPTY_AUTO)
  const [saving, setSaving] = useState(false)
  const [sendingCampaign, setSendingCampaign] = useState<string | null>(null)
  const [abStats, setAbStats] = useState<CampaignAbStats[]>([])
  const [profileDraft, setProfileDraft] = useState<ProfileDraft | null>(null)
  const [aiBrief, setAiBrief] = useState("")
  const [aiTone, setAiTone] = useState<CampaignTone>("cercano")
  const [aiBusy, setAiBusy] = useState(false)
  const [aiSource, setAiSource] = useState<"llm" | "template" | null>(null)

  // Lealtad y reseñas
  const [loyalty, setLoyalty] = useState<FoodosLoyaltyProgram | null>(null)
  const [loyaltyForm, setLoyaltyForm] = useState({ points_per_100: "10", point_value: "1", is_active: false })
  const [reviews, setReviews] = useState<FoodosReview[]>([])
  const [creditDraft, setCreditDraft] = useState<string | null>(null) // customer_id en edición
  const [creditAmount, setCreditAmount] = useState("")

  const load = useCallback(async () => {
    try {
      const { restaurant: r, customers: cs, automations: as, campaigns: cps } = await getFoodosPanelData()
      setRestaurant(r)
      setCustomers(cs)
      setAutomations(as)
      setCampaigns(cps)
      if (r) {
        const [prog, revs, ab] = await Promise.all([
          getLoyaltyProgram(r.id),
          listReviews(r.id),
          getCampaignAbStats(r.id),
        ])
        setAbStats(ab)
        setLoyalty(prog)
        if (prog) {
          setLoyaltyForm({
            points_per_100: String(prog.points_per_100),
            point_value: String(prog.point_value),
            is_active: prog.is_active,
          })
        }
        setReviews(revs)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("foodos.clientes.loadError"))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const run = async () => { await load() }
    run()
  }, [load])

  // Recalcular segmento en cliente (espejo del trigger) por si pasó el tiempo
  const computedSegments = useMemo(() => {
    const map = new Map<string, FoodosCustomerSegment>()
    for (const c of customers) map.set(c.id, segmentCustomer(c))
    return map
  }, [customers])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return customers.filter((c) => {
      const seg = computedSegments.get(c.id) ?? c.segment
      if (segmentFilter !== "all" && seg !== segmentFilter) return false
      if (!q) return true
      return (
        (c.name ?? "").toLowerCase().includes(q) ||
        c.phone.includes(q.replace(/\D/g, ""))
      )
    })
  }, [customers, computedSegments, segmentFilter, search])

  // Audiencias RFM en vivo: mismas reglas que el motor del servidor.
  const audiences = useMemo(() => buildAudiences(customers), [customers])

  const stats = useMemo(() => {
    const seg = computedSegments
    const active = customers.filter((c) => seg.get(c.id) !== "inactivo")
    const totalSpend = active.reduce((s, c) => s + c.total_spend, 0)
    const avgTicket = active.length ? totalSpend / active.length : 0
    return {
      total: customers.length,
      active: active.length,
      inactive: customers.length - active.length,
      totalSpend,
      avgTicket,
    }
  }, [customers, computedSegments])

  async function handleSaveLoyalty() {
    if (!restaurant) return
    setSaving(true)
    try {
      const attempt = await run(() =>
        upsertLoyaltyProgram({
          restaurant_id: restaurant.id,
          points_per_100: Number(loyaltyForm.points_per_100) || 0,
          point_value: Number(loyaltyForm.point_value) || 0,
          is_active: loyaltyForm.is_active,
        })
      )
      if (!attempt.ran) return
      setLoyalty(await getLoyaltyProgram(restaurant.id))
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar lealtad")
    } finally {
      setSaving(false)
    }
  }

  async function handleAdjustCredit(customerId: string) {
    const amount = Number(creditAmount)
    if (!amount) return
    const attempt = await run(() => adjustCustomerCredit(customerId, amount))
    if (!attempt.ran) return
    setCreditDraft(null)
    setCreditAmount("")
    await load()
  }

  async function handleToggleReview(id: string, isVisible: boolean) {
    const attempt = await run(() => setReviewVisibility(id, isVisible))
    if (!attempt.ran) return
    setReviews((prev) => prev.map((r) => (r.id === id ? { ...r, is_visible: isVisible } : r)))
  }

  async function handleSaveAuto(e: React.FormEvent) {
    e.preventDefault()
    if (!restaurant || !autoForm.name.trim()) return
    setSaving(true)
    try {
      const triggerConfig =
        autoForm.type === "winback"
          ? { days_without_order: Number(autoForm.days_without_order) || 30, target_segment: "inactivo" as const }
          : autoForm.type === "season_promo"
            ? { season: autoForm.name, target_segment: "recurrente" as const }
            : { target_segment: "recurrente" as const }
      const attempt = await run(() =>
        upsertAutomation({
          id: autoForm.id,
          restaurant_id: restaurant.id,
          type: autoForm.type,
          name: autoForm.name.trim(),
          trigger_config: triggerConfig,
          message: autoForm.message.trim() || null,
          message_b: autoForm.message_b.trim() || null,
          ab_test: autoForm.ab_test,
          audience: autoForm.audience || null,
          channel: autoForm.channel,
          incentive_config: autoForm.discount_pct ? { discount_pct: Number(autoForm.discount_pct) } : {},
          is_active: true,
        })
      )
      if (!attempt.ran) return
      setShowAutoForm(false)
      setAutoForm(EMPTY_AUTO)
      setAiBrief("")
      setAiSource(null)
      setAutomations(await listAutomations(restaurant.id))
    } catch (e) {
      setError(e instanceof Error ? e.message : t("foodos.clientes.saveAutoError"))
    } finally {
      setSaving(false)
    }
  }

  async function runCampaign(auto: FoodosAutomation) {
    if (!restaurant) return
    if (!confirm(t("foodos.clientes.runCampaignConfirm", { name: auto.name }))) return
    setSendingCampaign(auto.id)
    setError(null)
    try {
      const attempt = await run(() =>
        insertCampaign({
          restaurant_id: restaurant.id,
          automation_id: auto.id,
          status: "scheduled",
          // El canal por cliente lo resuelve el motor; aquí solo dejamos registrado el preferido.
          channel: auto.channel === "sms" ? "sms" : "whatsapp",
        })
      )
      if (!attempt.ran) return
      const { data: campaign } = attempt.value
      const result = await runCampaignNow(campaign.id)
      if (result.failed > 0) {
        setError(
          t("foodos.clientes.campaignResult", { sent: result.sent, failed: result.failed }) +
            (result.skipped ? t("foodos.clientes.campaignSkipped", { skipped: result.skipped }) : "")
        )
      }
      setCampaigns(await listCampaigns(restaurant.id))
    } catch (e) {
      setError(e instanceof Error ? e.message : t("foodos.clientes.campaignError"))
    } finally {
      setSendingCampaign(null)
    }
  }

  async function removeCampaign(id: string) {
    if (!confirm(t("foodos.clientes.deleteCampaignConfirm"))) return
    if (!restaurant) return
    const attempt = await run(() => deleteCampaign(id))
    if (!attempt.ran) return
    setCampaigns(await listCampaigns(restaurant.id))
  }

  function openAutomationForm(overrides: Partial<AutomationForm> = {}) {
    setAutoForm({ ...EMPTY_AUTO, ...overrides })
    setAiBrief("")
    setAiSource(null)
    setShowAutoForm(true)
  }

  async function handleGenerateCopy() {
    if (!restaurant) return
    if (!aiBrief.trim()) return
    setAiBusy(true)
    setError(null)
    try {
      const audience = isAudienceKey(autoForm.audience)
        ? t(AUDIENCE_PLAYBOOK[autoForm.audience].labelKey)
        : null
      const attempt = await run(() =>
        generateCampaignCopy({
          restaurant_id: restaurant.id,
          brief: aiBrief.trim(),
          offer: autoForm.discount_pct ? `${autoForm.discount_pct}% de descuento` : null,
          audienceLabel: audience,
          tone: aiTone,
        })
      )
      if (!attempt.ran) return
      const result = attempt.value
      setAutoForm((f) => ({ ...f, message: result.text }))
      setAiSource(result.source)
    } catch (e) {
      setError(e instanceof Error ? e.message : t("foodos.marketing.aiError"))
    } finally {
      setAiBusy(false)
    }
  }

  async function handleSaveProfile() {
    if (!profileDraft) return
    setSaving(true)
    setError(null)
    try {
      const attempt = await run(() =>
        updateCustomerProfile({
          id: profileDraft.id,
          birthday: profileDraft.birthday || null,
          sms_opt_in: profileDraft.sms_opt_in,
        })
      )
      if (!attempt.ran) return
      setCustomers((prev) =>
        prev.map((c) =>
          c.id === profileDraft.id
            ? { ...c, birthday: profileDraft.birthday || null, sms_opt_in: profileDraft.sms_opt_in }
            : c
        )
      )
      setProfileDraft(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : t("foodos.clientes.loadError"))
    } finally {
      setSaving(false)
    }
  }

  async function toggleAuto(a: FoodosAutomation) {
    const next = !a.is_active
    setError(null)
    try {
      const attempt = await run(() => toggleAutomation(a.id, next))
      if (!attempt.ran) return
      setAutomations(
        automations.map((x) => (x.id === a.id ? { ...x, is_active: next } : x))
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : t("foodos.clientes.toggleError"))
    }
  }

  if (!restaurant) {
    if (loading) {
      return (
        <div className="flex items-center justify-center py-24 text-stone-500">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> {t("foodos.common.loading")}
        </div>
      )
    }
    return (
      <div className="max-w-2xl mx-auto mt-16 bg-amber-50 border border-amber-200 rounded-2xl p-8 text-center">
        <h1 className="text-xl font-black text-stone-900">{t("foodos.common.setupTitle")}</h1>
        <p className="text-stone-600 mt-2">{t("foodos.clientes.setupBody")}</p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-black text-stone-900">{t("foodos.clientes.title")}</h1>
          <p className="text-sm text-stone-500">{t("foodos.clientes.subtitle")}</p>
        </div>
        <button
          onClick={() => openAutomationForm()}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-700 text-white text-sm font-bold hover:bg-emerald-800 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-emerald-700"
        >
          <Plus className="w-4 h-4" /> {t("foodos.clientes.newAutomation")}
        </button>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{error}</div>
      )}

      <ToolPreviewNotice feature="marketing_ia" />

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label={t("foodos.clientes.statClients")} value={String(stats.total)} />
        <StatCard label={t("foodos.clientes.statActive")} value={String(stats.active)} />
        <StatCard label={t("foodos.clientes.statTotalSpend")} value={formatMoney(stats.totalSpend)} />
        <StatCard label={t("foodos.clientes.statAvgSpend")} value={formatMoney(stats.avgTicket)} />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* CRM */}
        <div className="lg:col-span-2">
          <div className="bg-white border border-stone-200 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Users className="w-5 h-5 text-stone-500" />
              <h2 className="font-bold text-stone-900">{t("foodos.clientes.crmTitle")}</h2>
              <span className="ml-auto text-xs text-stone-400">{t("foodos.clientes.shownCount", { count: filtered.length })}</span>
            </div>

            <div className="flex flex-wrap gap-2 mb-4">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("foodos.clientes.searchPlaceholder")}
                className="flex-1 min-w-[200px] px-3 py-2 rounded-xl border border-stone-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              {SEGMENT_FILTERS.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSegmentFilter(s.id)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                    segmentFilter === s.id ? "bg-stone-900 text-white" : "bg-stone-100 text-stone-600"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>

            {filtered.length === 0 ? (
              <p className="text-sm text-stone-400 py-8 text-center">
                {t("foodos.clientes.emptyCustomers")}
              </p>
            ) : (
              <div className="divide-y divide-stone-100">
                {filtered.map((c) => {
                  const seg = computedSegments.get(c.id) ?? c.segment
                  const meta = SEGMENT_META[seg]
                  return (
                    <div key={c.id} className="py-3">
                      <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-stone-900 truncate">
                          {c.name ?? t("foodos.clientes.noName")}
                        </p>
                        <p className="text-xs text-stone-500">{c.phone}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${meta.badge}`}>
                          {meta.label}
                        </span>
                        <p className="text-xs text-stone-500 mt-1">{t("foodos.clientes.ordersCount", { count: c.total_orders })}</p>
                        <p className="text-sm font-bold text-stone-900">{formatMoney(c.total_spend)}</p>
                        {(c.loyalty_points > 0 || Number(c.store_credit) > 0) && (
                          <p className="text-[11px] text-stone-400 mt-0.5">
                            ⭐ {c.loyalty_points} pts{Number(c.store_credit) > 0 && ` · 💳 ${formatMoney(Number(c.store_credit))}`}
                          </p>
                        )}
                        {creditDraft === c.id ? (
                          <div className="flex items-center gap-1 mt-1 justify-end">
                            <input
                              type="number"
                              value={creditAmount}
                              onChange={(e) => setCreditAmount(e.target.value)}
                              placeholder="±$"
                              className="w-20 px-2 py-1 rounded-lg border border-stone-200 text-xs"
                            />
                            <button onClick={() => handleAdjustCredit(c.id)} className="text-xs font-bold text-emerald-700">OK</button>
                            <button onClick={() => setCreditDraft(null)} className="text-xs text-stone-400">✕</button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setCreditDraft(c.id)}
                            className="text-[11px] font-semibold text-stone-400 hover:text-emerald-700 mt-0.5"
                          >
                            Ajustar crédito
                          </button>
                        )}
                        {profileDraft?.id !== c.id && (
                          <button
                            onClick={() =>
                              setProfileDraft({
                                id: c.id,
                                birthday: c.birthday ?? "",
                                sms_opt_in: c.sms_opt_in,
                              })
                            }
                            className="flex items-center gap-1 text-[11px] font-semibold text-stone-400 hover:text-emerald-700 mt-0.5 ml-auto"
                          >
                            <Cake className="w-3 h-3" aria-hidden="true" /> {t("foodos.marketing.customerMarketing")}
                          </button>
                        )}
                      </div>
                      </div>

                      {profileDraft?.id === c.id && (
                        <div className="mt-2 bg-stone-50 rounded-xl p-3 space-y-3">
                          <label className="block text-xs">
                            <span className="font-semibold text-stone-600 block mb-1">
                              {t("foodos.marketing.customerBirthday")}
                            </span>
                            <input
                              type="date"
                              value={profileDraft.birthday}
                              onChange={(e) =>
                                setProfileDraft((d) => (d ? { ...d, birthday: e.target.value } : d))
                              }
                              className="w-full px-3 py-2 rounded-xl border border-stone-200 text-sm bg-white"
                            />
                            <span className="text-[11px] text-stone-400 mt-1 block">
                              {t("foodos.marketing.customerBirthdayHint")}
                            </span>
                          </label>
                          <label className="flex items-start gap-2 text-xs text-stone-600 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={profileDraft.sms_opt_in}
                              onChange={(e) =>
                                setProfileDraft((d) => (d ? { ...d, sms_opt_in: e.target.checked } : d))
                              }
                              className="accent-emerald-600 mt-0.5"
                            />
                            <span>
                              <span className="font-semibold block">
                                {t("foodos.marketing.customerSmsOptIn")}
                              </span>
                              <span className="text-[11px] text-stone-400">
                                {t("foodos.marketing.customerSmsOptInHint")}
                              </span>
                            </span>
                          </label>
                          <div className="flex gap-2">
                            <button
                              onClick={handleSaveProfile}
                              disabled={saving}
                              className="px-4 py-2 rounded-xl bg-emerald-700 text-white text-xs font-bold hover:bg-emerald-800 disabled:opacity-50"
                            >
                              {t("foodos.marketing.customerSave")}
                            </button>
                            <button
                              onClick={() => setProfileDraft(null)}
                              className="px-4 py-2 rounded-xl bg-stone-200 text-stone-700 text-xs font-bold hover:bg-stone-300"
                            >
                              {t("common.cancel")}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Automatizaciones + campañas */}
        <div className="space-y-6">
          {/* Audiencias RFM */}
          <div className="bg-white border border-stone-200 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-1">
              <Target className="w-5 h-5 text-stone-500" />
              <h2 className="font-bold text-stone-900">{t("foodos.marketing.audiencesTitle")}</h2>
            </div>
            <p className="text-xs text-stone-500 mb-4">{t("foodos.marketing.audiencesSubtitle")}</p>

            {audiences.length === 0 ? (
              <p className="text-sm text-stone-400 py-2">{t("foodos.marketing.audiencesEmpty")}</p>
            ) : (
              <div className="space-y-2">
                {audiences.map((a) => (
                  <button
                    key={a.key}
                    type="button"
                    onClick={() => openAutomationForm({ audience: a.key, type: "season_promo" })}
                    className="w-full text-left bg-stone-50 hover:bg-emerald-50 disabled:hover:bg-stone-50 rounded-xl p-3 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-bold text-stone-900">
                        {t(a.playbook.labelKey)}
                      </span>
                      <span className="text-xs font-semibold text-stone-500">
                        {t("foodos.marketing.audienceMembers", { count: a.count })}
                      </span>
                    </div>
                    <p className="text-[11px] text-stone-500 mt-0.5">{t(a.playbook.actionKey)}</p>
                    <p className="text-[11px] text-stone-400 mt-1">
                      {t("foodos.marketing.audienceReachable", { count: a.reachable })} ·{" "}
                      {t("foodos.marketing.audienceRevenue", { amount: formatMoney(a.revenue) })}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white border border-stone-200 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <MessageSquare className="w-5 h-5 text-stone-500" />
              <h2 className="font-bold text-stone-900">{t("foodos.clientes.automationsTitle")}</h2>
            </div>

            {automations.length === 0 ? (
              <p className="text-sm text-stone-400 py-4">
                {t("foodos.clientes.emptyAutomations")}
              </p>
            ) : (
              <div className="space-y-2">
                {automations.map((a) => {
                  const typeMeta = AUTOMATION_TYPES.find((x) => x.id === a.type)
                  return (
                    <div key={a.id} className="bg-stone-50 rounded-xl p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-bold text-stone-900">{a.name}</p>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${a.is_active ? "bg-emerald-100 text-emerald-700" : "bg-stone-200 text-stone-600"}`}>
                          {a.is_active ? t("foodos.clientes.active") : t("foodos.clientes.inactive")}
                        </span>
                      </div>
                      <p className="text-xs text-stone-500 mt-0.5">{typeMeta?.label ?? a.type}</p>
                      <p className="text-[11px] text-stone-400 mt-0.5">
                        {channelLabel(a.channel)}
                        {a.ab_test && ` · ${t("foodos.marketing.abTitle")}`}
                        {audienceLabelOf(a.audience) && ` · ${audienceLabelOf(a.audience)}`}
                      </p>
                      {a.incentive_config?.discount_pct && (
                        <p className="flex items-center gap-1 text-xs text-emerald-600 font-semibold mt-1">
                          <Percent className="w-3 h-3" /> {t("foodos.clientes.incentive", { pct: a.incentive_config.discount_pct })}
                        </p>
                      )}
                      <div className="flex gap-2 mt-2">
                        <button
                          onClick={() => runCampaign(a)}
                          disabled={sendingCampaign === a.id || !a.is_active}
                          title={a.is_active ? t("foodos.clientes.runNowTitle") : t("foodos.clientes.runDisabledTitle")}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-700 text-white text-xs font-bold hover:bg-emerald-800 disabled:opacity-40"
                        >
                          {sendingCampaign === a.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                          {t("foodos.clientes.run")}
                        </button>
                        <button
                          onClick={() => toggleAuto(a)}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-stone-200 text-stone-700 text-xs font-bold hover:bg-stone-300"
                        >
                          {a.is_active ? t("foodos.clientes.pause") : t("foodos.clientes.activate")}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Historial de campañas */}
          <div className="bg-white border border-stone-200 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <CalendarClock className="w-5 h-5 text-stone-500" />
              <h2 className="font-bold text-stone-900">{t("foodos.clientes.campaignsTitle")}</h2>
            </div>
            {campaigns.length === 0 ? (
              <p className="text-sm text-stone-400 py-4">{t("foodos.clientes.emptyCampaigns")}</p>
            ) : (
              <div className="space-y-2">
                {campaigns.map((c) => (
                  <div key={c.id} className="flex items-center justify-between gap-2 bg-stone-50 rounded-xl p-3">
                    <div>
                      <p className="text-xs font-semibold text-stone-700">
                        {new Date(c.created_at).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })}
                      </p>
                      <p className="text-xs text-stone-500 capitalize">
                        {c.status === "sent" ? t("foodos.clientes.statusSent") : c.status === "failed" ? t("foodos.clientes.statusFailed") : c.status === "scheduled" ? t("foodos.clientes.statusScheduled") : c.status} · {c.channel}
                      </p>
                      {c.error && (
                        <p className="text-[11px] text-red-600 mt-0.5">{c.error}</p>
                      )}
                    </div>
                    <button
                      onClick={() => removeCampaign(c.id)}
                      className="text-stone-400 hover:text-red-600"
                      aria-label={t("foodos.clientes.deleteCampaignLabel")}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Resultados del experimento A/B */}
          <div className="bg-white border border-stone-200 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <FlaskConical className="w-5 h-5 text-stone-500" />
              <h2 className="font-bold text-stone-900">{t("foodos.marketing.abResultsTitle")}</h2>
            </div>
            {abStats.every((v) => v.total === 0) ? (
              <p className="text-sm text-stone-400 py-4">{t("foodos.marketing.abResultsEmpty")}</p>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {abStats.map((v) => (
                  <div key={v.variant} className="bg-stone-50 rounded-xl p-3">
                    <p className="text-xs font-bold text-stone-900">
                      {v.variant === "a"
                        ? t("foodos.marketing.abVariantA")
                        : t("foodos.marketing.abVariantB")}
                    </p>
                    <p className="text-lg font-black text-emerald-700 mt-1">{v.sent}</p>
                    <p className="text-[11px] text-stone-500">
                      {t("foodos.marketing.abSent", { count: v.sent })}
                    </p>
                    {v.failed > 0 && (
                      <p className="text-[11px] text-red-600">
                        {t("foodos.marketing.abFailed", { count: v.failed })}
                      </p>
                    )}
                    <p className="text-[11px] text-stone-400">
                      {t("foodos.marketing.abTotal", { count: v.total })}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Programa de lealtad */}
          <div className="bg-white border border-stone-200 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Star className="w-5 h-5 text-stone-500" />
              <h2 className="font-bold text-stone-900">Programa de lealtad</h2>
              {loyalty?.is_active && (
                <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Activo</span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 mb-3">
              <label className="text-xs">
                <span className="font-semibold text-stone-600 block mb-1">Puntos por $100</span>
                <input
                  type="number" min="0" step="1"
                  value={loyaltyForm.points_per_100}
                  onChange={(e) => setLoyaltyForm({ ...loyaltyForm, points_per_100: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-stone-200 text-sm"
                />
              </label>
              <label className="text-xs">
                <span className="font-semibold text-stone-600 block mb-1">Valor del punto ($)</span>
                <input
                  type="number" min="0" step="0.1"
                  value={loyaltyForm.point_value}
                  onChange={(e) => setLoyaltyForm({ ...loyaltyForm, point_value: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-stone-200 text-sm"
                />
              </label>
            </div>
            <label className="flex items-center gap-2 text-sm text-stone-600 cursor-pointer mb-3">
              <input
                type="checkbox"
                checked={loyaltyForm.is_active}
                onChange={(e) => setLoyaltyForm({ ...loyaltyForm, is_active: e.target.checked })}
                className="accent-emerald-600"
              />
              Programa activo (los clientes acumulan y canjean puntos)
            </label>
            <button
              onClick={handleSaveLoyalty}
              disabled={saving}
              className="w-full py-2.5 rounded-xl bg-emerald-700 text-white text-sm font-bold hover:bg-emerald-800 disabled:opacity-50"
            >
              Guardar programa
            </button>
          </div>

          {/* Reseñas */}
          <div className="bg-white border border-stone-200 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Star className="w-5 h-5 text-stone-500" />
              <h2 className="font-bold text-stone-900">Reseñas recientes</h2>
              <span className="ml-auto text-xs text-stone-400">{reviews.length}</span>
            </div>
            {reviews.length === 0 ? (
              <p className="text-sm text-stone-400 py-4">Aún no hay reseñas. Los clientes las dejan desde la página de estado de su pedido.</p>
            ) : (
              <div className="space-y-2">
                {reviews.slice(0, 10).map((r) => (
                  <div key={r.id} className={`bg-stone-50 rounded-xl p-3 ${!r.is_visible ? "opacity-50" : ""}`}>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-bold text-stone-900">
                        {"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)} · {r.customer_name ?? "Cliente"}
                      </p>
                      <button
                        onClick={() => handleToggleReview(r.id, !r.is_visible)}
                        className="text-[11px] font-semibold text-stone-400 hover:text-stone-700"
                      >
                        {r.is_visible ? "Ocultar" : "Mostrar"}
                      </button>
                    </div>
                    {r.comment && <p className="text-xs text-stone-500 mt-1">{r.comment}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal nueva automatización */}
      <BottomSheet
        open={showAutoForm}
        onClose={() => setShowAutoForm(false)}
        ariaLabelledby="auto-form-title"
        maxWidthClass="max-w-lg"
      >
        <form onSubmit={handleSaveAuto} className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 id="auto-form-title" className="font-black text-stone-900">{t("foodos.clientes.newAutomation")}</h2>
              <button type="button" onClick={() => setShowAutoForm(false)} className="text-stone-400 hover:text-stone-600">
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-stone-600 block mb-1">{t("foodos.clientes.typeLabel")}</label>
                <div className="grid grid-cols-2 gap-2">
                  {AUTOMATION_TYPES.map((at) => (
                    <button
                      key={at.id}
                      type="button"
                      onClick={() => setAutoForm((f) => ({ ...f, type: at.id }))}
                      className={`rounded-xl p-2 text-left border-2 text-xs ${
                        autoForm.type === at.id ? "border-emerald-500 bg-emerald-50" : "border-stone-200"
                      }`}
                    >
                      <span className="font-bold text-stone-900 block">{at.label}</span>
                      <span className="text-stone-500">{at.hint}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-stone-600 block mb-1">{t("foodos.clientes.nameLabel")}</label>
                <input
                  value={autoForm.name}
                  onChange={(e) => setAutoForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder={t("foodos.clientes.namePlaceholder")}
                  className="w-full px-3 py-2 rounded-xl border border-stone-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {autoForm.type === "winback" && (
                <div>
                  <label className="text-xs font-semibold text-stone-600 block mb-1">{t("foodos.clientes.daysWithoutOrder")}</label>
                  <input
                    value={autoForm.days_without_order}
                    onChange={(e) => setAutoForm((f) => ({ ...f, days_without_order: e.target.value }))}
                    type="number"
                    min="1"
                    className="w-full px-3 py-2 rounded-xl border border-stone-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              )}

              <div>
                <label className="text-xs font-semibold text-stone-600 block mb-1">{t("foodos.marketing.audienceLabel")}</label>
                <select
                  value={autoForm.audience}
                  onChange={(e) => setAutoForm((f) => ({ ...f, audience: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-stone-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="">{t("foodos.marketing.audienceNone")}</option>
                  {FOODOS_AUDIENCE_KEYS.map((key) => (
                    <option key={key} value={key}>
                      {t(AUDIENCE_PLAYBOOK[key].labelKey)}
                    </option>
                  ))}
                </select>
                <span className="text-[11px] text-stone-400 mt-1 block">{t("foodos.marketing.audienceHint")}</span>
              </div>

              <div>
                <label className="text-xs font-semibold text-stone-600 block mb-1">{t("foodos.marketing.channelLabel")}</label>
                <div className="grid grid-cols-3 gap-2">
                  {CHANNEL_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setAutoForm((f) => ({ ...f, channel: opt.id }))}
                      aria-pressed={autoForm.channel === opt.id}
                      className={`px-2 py-2 rounded-xl text-[11px] font-bold transition-colors ${
                        autoForm.channel === opt.id
                          ? "bg-emerald-700 text-white"
                          : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <span className="text-[11px] text-stone-400 mt-1 block">{t("foodos.marketing.channelHint")}</span>
              </div>

              {/* Generador de copy con IA */}
              <div className="bg-emerald-50/60 border border-emerald-100 rounded-xl p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-emerald-600" aria-hidden="true" />
                  <span className="text-xs font-bold text-emerald-900">{t("foodos.marketing.aiTitle")}</span>
                </div>
                <label className="block text-[11px] font-semibold text-stone-600">
                  {t("foodos.marketing.aiBriefLabel")}
                  <input
                    value={aiBrief}
                    onChange={(e) => setAiBrief(e.target.value)}
                    placeholder={t("foodos.marketing.aiBriefPlaceholder")}
                    className="mt-1 w-full px-3 py-2 rounded-xl border border-stone-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </label>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] font-semibold text-stone-600">{t("foodos.marketing.aiToneLabel")}</span>
                  {AI_TONES.map((tone) => (
                    <button
                      key={tone.id}
                      type="button"
                      onClick={() => setAiTone(tone.id)}
                      aria-pressed={aiTone === tone.id}
                      className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${
                        aiTone === tone.id
                          ? "bg-emerald-700 text-white"
                          : "bg-white text-stone-600 border border-stone-200"
                      }`}
                    >
                      {tone.label}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={handleGenerateCopy}
                  disabled={aiBusy || !aiBrief.trim()}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-emerald-700 text-white text-xs font-bold hover:bg-emerald-800 disabled:opacity-50"
                >
                  {aiBusy ? (
                    <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Sparkles className="w-4 h-4" aria-hidden="true" />
                  )}
                  {aiBusy ? t("foodos.marketing.aiGenerating") : t("foodos.marketing.aiGenerate")}
                </button>
                {aiSource && (
                  <p className="text-[11px] text-emerald-800" aria-live="polite">
                    {aiSource === "llm"
                      ? t("foodos.marketing.aiSourceLlm")
                      : t("foodos.marketing.aiSourceTemplate")}
                  </p>
                )}
                <p className="text-[11px] text-stone-500">{t("foodos.marketing.aiHint")}</p>
              </div>

              <div>
                <label className="text-xs font-semibold text-stone-600 block mb-1">{t("foodos.clientes.messageLabel")}</label>
                <textarea
                  value={autoForm.message}
                  onChange={(e) => setAutoForm((f) => ({ ...f, message: e.target.value }))}
                  rows={3}
                  placeholder={t("foodos.clientes.messagePlaceholder")}
                  className="w-full px-3 py-2 rounded-xl border border-stone-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* Experimento A/B */}
              <div className="bg-stone-50 rounded-xl p-3 space-y-2">
                <label className="flex items-center gap-2 text-xs font-semibold text-stone-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoForm.ab_test}
                    onChange={(e) =>
                      setAutoForm((f) => ({
                        ...f,
                        ab_test: e.target.checked,
                        message_b: e.target.checked ? f.message_b : "",
                      }))
                    }
                    className="accent-emerald-600"
                  />
                  {t("foodos.marketing.abLabel")}
                </label>
                <p className="text-[11px] text-stone-400">{t("foodos.marketing.abHint")}</p>
                {autoForm.ab_test && (
                  <div>
                    <label className="text-xs font-semibold text-stone-600 block mb-1">
                      {t("foodos.marketing.messageBLabel")}
                    </label>
                    <textarea
                      value={autoForm.message_b}
                      onChange={(e) => setAutoForm((f) => ({ ...f, message_b: e.target.value }))}
                      rows={3}
                      placeholder={t("foodos.marketing.messageBPlaceholder")}
                      className="w-full px-3 py-2 rounded-xl border border-stone-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="text-xs font-semibold text-stone-600 block mb-1">{t("foodos.clientes.incentiveLabel")}</label>
                <input
                  value={autoForm.discount_pct}
                  onChange={(e) => setAutoForm((f) => ({ ...f, discount_pct: e.target.value }))}
                  type="number"
                  min="0"
                  max="100"
                  className="w-full px-3 py-2 rounded-xl border border-stone-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                type="button"
                onClick={() => setShowAutoForm(false)}
                className="px-6 py-3 bg-gray-100 text-gray-700 font-semibold rounded-xl hover:bg-gray-200"
              >
                {t("common.cancel")}
              </button>
              <button
                type="submit"
                disabled={saving || !autoForm.name.trim()}
                className="flex-1 py-3 bg-emerald-700 text-white font-bold rounded-xl hover:bg-emerald-800 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {t("common.save")}
              </button>
            </div>
          </form>
      </BottomSheet>
      <ToolGuideHost toolKey="clientes" pathname="/panel/foodos/clientes" slug={null} icon="👥" title={t("foodos.clientes.guideTitle")} />

      {upsellDialog}
    </div>
  )
}

