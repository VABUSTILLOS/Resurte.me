"use client"

// ============================================================
// Sitio web y SEO local — la app de marca y las páginas que Google indexa.
//
// Cinco bloques:
//   1. KPIs: páginas publicadas, borradores y avance del perfil.
//   2. Tus enlaces: micrositio, carta indexable y manifest PWA, para copiar.
//   3. Perfil público: la frase corta, la descripción y las palabras clave.
//   4. Google Business: checklist de lo que falta para salir en Maps.
//   5. Páginas: generar con IA (queda en borrador) y publicar.
//
// Regla que la UI hace visible: **nada se publica solo**. Todo lo generado
// nace en borrador y el botón de publicar es el acto de aprobación.
// ============================================================

import { useCallback, useEffect, useState, type ReactNode } from "react"
import Link from "next/link"
import {
  deleteSeoPageRow,
  generateSeoPage,
  getFoodosPanelData,
  getSeoKpis,
  getSitioData,
  publishSeoPage,
  saveSeoProfileAction,
  unpublishSeoPage,
  type SeoKpis,
  type SeoSiteData,
} from "../actions"
import StatCard from "@/components/panel/StatCard"
import ToolPreviewNotice from "@/components/panel/foodos/tool-preview-notice"
import { useTierGuard } from "@/hooks/use-tier-guard"
import ToolGuideHost from "@/components/panel/guide/tool-guide-host"
import { t } from "@/lib/i18n/es"
import type { FoodosRestaurant } from "@/types/foodos"
import type { SeoPageRow } from "@/lib/foodos-seo-pages"
import { seoPagePath } from "@/lib/foodos-seo"
import {
  Check,
  Copy,
  ExternalLink,
  FileText,
  Globe,
  Loader2,
  MapPin,
  RefreshCw,
  Sparkles,
  Trash2,
} from "lucide-react"

const EMPTY_KPIS: SeoKpis = {
  total: 0,
  published: 0,
  drafts: 0,
  progressRatio: 0,
  pendingSteps: 0,
}

/** Las páginas que se pueden generar con un clic. */
const GENERATORS = [
  { kind: "about" as const, labelKey: "foodos.sitio.generateAbout" },
  { kind: "faq" as const, labelKey: "foodos.sitio.generateFaq" },
]

function kindLabel(kind: SeoPageRow["kind"]): string {
  switch (kind) {
    case "about":
      return t("foodos.sitio.kindAbout")
    case "faq":
      return t("foodos.sitio.kindFaq")
    case "dish":
      return t("foodos.sitio.kindDish")
    case "menu":
      return t("foodos.sitio.kindMenu")
    default:
      return t("foodos.sitio.kindCity")
  }
}

export default function SitioIaPage() {
  const { run, upsellDialog } = useTierGuard("sitio_ia")

  const [restaurant, setRestaurant] = useState<FoodosRestaurant | null>(null)
  const [site, setSite] = useState<SeoSiteData | null>(null)
  const [kpis, setKpis] = useState<SeoKpis>(EMPTY_KPIS)

  const [tagline, setTagline] = useState("")
  const [about, setAbout] = useState("")
  const [keywords, setKeywords] = useState("")
  const [googleBusiness, setGoogleBusiness] = useState("")

  const [notes, setNotes] = useState("")
  const [dishId, setDishId] = useState("")

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)

  const load = useCallback(async () => {
    try {
      const data = await getFoodosPanelData()
      setRestaurant(data.restaurant)
      if (!data.restaurant) return

      const [detail, metrics] = await Promise.all([
        getSitioData(data.restaurant.id),
        getSeoKpis(data.restaurant.id),
      ])
      setSite(detail)
      setKpis(metrics)
      if (detail) {
        setTagline(detail.profile.tagline ?? "")
        setAbout(detail.profile.about ?? "")
        setKeywords(detail.profile.seo_keywords.join(", "))
        setGoogleBusiness(detail.profile.google_business_url ?? "")
        setDishId((current) => current || detail.dishes[0]?.id || "")
      }
    } catch (err) {
      setNotice({
        ok: false,
        text: err instanceof Error ? err.message : t("foodos.sitio.actionError"),
      })
    }
  }, [])

  useEffect(() => {
    const run = async () => {
      setLoading(true)
      await load()
      setLoading(false)
    }
    run()
  }, [load])

  async function refresh() {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }

  async function copy(value: string, key: string) {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(key)
      window.setTimeout(() => setCopied((current) => (current === key ? null : current)), 2000)
    } catch {
      setNotice({ ok: false, text: t("foodos.sitio.actionError") })
    }
  }

  async function saveProfile() {
    if (!restaurant) return
    setSaving(true)
    setNotice(null)
    try {
      const attempt = await run(() =>
        saveSeoProfileAction({
          restaurant_id: restaurant.id,
          tagline,
          about,
          seo_keywords: keywords
            .split(",")
            .map((entry) => entry.trim())
            .filter(Boolean),
          google_business_url: googleBusiness.trim() || null,
        })
      )
      if (!attempt.ran) return
      const result = attempt.value
      if (!result.ok) throw new Error(result.error ?? t("foodos.sitio.actionError"))
      setNotice({ ok: true, text: t("foodos.sitio.saved") })
      await load()
    } catch (err) {
      setNotice({
        ok: false,
        text: err instanceof Error ? err.message : t("foodos.sitio.actionError"),
      })
    } finally {
      setSaving(false)
    }
  }

  async function generate(kind: "about" | "faq" | "dish") {
    if (!restaurant) return
    if (kind === "dish" && !dishId) {
      setNotice({ ok: false, text: t("foodos.sitio.needsDish") })
      return
    }
    setBusy(kind)
    setNotice(null)
    try {
      const attempt = await run(() =>
        generateSeoPage({
          restaurant_id: restaurant.id,
          kind,
          notes: notes.trim() || null,
          menu_item_id: kind === "dish" ? dishId : null,
        })
      )
      if (!attempt.ran) return
      const result = attempt.value
      if (!result.ok) throw new Error(result.error ?? t("foodos.sitio.generateError"))
      setNotice({
        ok: true,
        text:
          result.source === "llm"
            ? t("foodos.sitio.generatedLlm")
            : t("foodos.sitio.generatedTemplate"),
      })
      await load()
    } catch (err) {
      setNotice({
        ok: false,
        text: err instanceof Error ? err.message : t("foodos.sitio.generateError"),
      })
    } finally {
      setBusy(null)
    }
  }

  async function setStatus(page: SeoPageRow, publish: boolean) {
    if (!restaurant) return
    setBusy(page.id)
    setNotice(null)
    try {
      const attempt = await run(() =>
        publish
          ? publishSeoPage({ restaurant_id: restaurant.id, page_id: page.id })
          : unpublishSeoPage({ restaurant_id: restaurant.id, page_id: page.id })
      )
      if (!attempt.ran) return
      const result = attempt.value
      if (!result.ok) throw new Error(result.error ?? t("foodos.sitio.actionError"))
      await load()
    } catch (err) {
      setNotice({
        ok: false,
        text: err instanceof Error ? err.message : t("foodos.sitio.actionError"),
      })
    } finally {
      setBusy(null)
    }
  }

  async function remove(page: SeoPageRow) {
    if (!restaurant) return
    if (!window.confirm(t("foodos.sitio.removeConfirm"))) return
    setBusy(page.id)
    setNotice(null)
    try {
      const attempt = await run(() =>
        deleteSeoPageRow({
          restaurant_id: restaurant.id,
          page_id: page.id,
        })
      )
      if (!attempt.ran) return
      const result = attempt.value
      if (!result.ok) throw new Error(result.error ?? t("foodos.sitio.actionError"))
      await load()
    } catch (err) {
      setNotice({
        ok: false,
        text: err instanceof Error ? err.message : t("foodos.sitio.actionError"),
      })
    } finally {
      setBusy(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-[#0E7A0E]" />
      </div>
    )
  }

  if (!restaurant || !site) {
    return (
      <div className="space-y-6">
        <Header />
        <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
          <Globe className="w-12 h-12 text-gray-300 mx-auto mb-3" aria-hidden />
          <p className="text-sm text-gray-500">{t("foodos.common.setupTitle")}</p>
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

  const pending = site.checklist.filter((step) => !step.done)

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <Header />
        <button
          type="button"
          onClick={refresh}
          disabled={refreshing}
          className="touch-target inline-flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} aria-hidden />
          {t("foodos.common.retry")}
        </button>
      </div>

      <ToolPreviewNotice feature="sitio_ia" />

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

      {/* ── KPIs ───────────────────────────────────────────── */}
      <section>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label={t("foodos.sitio.kpiPublished")} value={kpis.published} icon={Globe} tone="positive" />
          <StatCard label={t("foodos.sitio.kpiDrafts")} value={kpis.drafts} icon={FileText} />
          <StatCard
            label={t("foodos.sitio.kpiProgress")}
            value={`${Math.round(kpis.progressRatio * 100)}%`}
            icon={Sparkles}
          />
          <StatCard
            label={t("foodos.sitio.kpiPending")}
            value={kpis.pendingSteps}
            icon={MapPin}
            tone={kpis.pendingSteps > 0 ? "warning" : "positive"}
          />
        </div>
      </section>

      {/* ── Tus enlaces ────────────────────────────────────── */}
      <section className="bg-white rounded-2xl border border-gray-100 p-5">
        <h2 className="font-bold text-gray-900">{t("foodos.sitio.linksTitle")}</h2>
        <p className="text-xs text-gray-500 mt-1">{t("foodos.sitio.linksHint")}</p>

        <ul className="mt-4 space-y-3">
          {[
            { key: "site", label: t("foodos.sitio.linkSite"), url: site.urls.site },
            { key: "menu", label: t("foodos.sitio.linkMenu"), url: site.urls.menu },
            { key: "manifest", label: t("foodos.sitio.linkManifest"), url: site.urls.manifest },
          ].map((entry) => (
            <li key={entry.key} className="rounded-xl border border-gray-100 bg-gray-50 p-3">
              <p className="text-xs font-semibold text-gray-600">{entry.label}</p>
              <p className="mt-1 break-all text-xs text-gray-500">{entry.url}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => copy(entry.url, entry.key)}
                  className="touch-target inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                >
                  {copied === entry.key ? (
                    <Check className="w-3.5 h-3.5 text-emerald-600" aria-hidden />
                  ) : (
                    <Copy className="w-3.5 h-3.5" aria-hidden />
                  )}
                  {copied === entry.key ? t("foodos.sitio.copied") : t("foodos.sitio.copy")}
                </button>
                <a
                  href={entry.url}
                  target="_blank"
                  rel="noreferrer"
                  className="touch-target inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                >
                  <ExternalLink className="w-3.5 h-3.5" aria-hidden />
                  {t("foodos.sitio.openLink")}
                </a>
              </div>
            </li>
          ))}
        </ul>

        <div className="mt-4 rounded-xl bg-emerald-50 border border-emerald-100 px-3 py-3">
          <p className="text-xs font-semibold text-emerald-800">{t("foodos.sitio.installTitle")}</p>
          <p className="mt-1 text-xs text-emerald-700">{t("foodos.sitio.installIos")}</p>
          <p className="mt-0.5 text-xs text-emerald-700">{t("foodos.sitio.installAndroid")}</p>
        </div>
      </section>

      {/* ── Perfil público ─────────────────────────────────── */}
      <section className="bg-white rounded-2xl border border-gray-100 p-5">
        <h2 className="font-bold text-gray-900">{t("foodos.sitio.profileTitle")}</h2>
        <p className="text-xs text-gray-500 mt-1">{t("foodos.sitio.profileHint")}</p>

        <div className="mt-4 space-y-4">
          <Field label={t("foodos.sitio.tagline")}>
            <input
              type="text"
              value={tagline}
              maxLength={160}
              onChange={(e) => setTagline(e.target.value)}
              placeholder={t("foodos.sitio.taglinePlaceholder")}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-[#0E7A0E] focus:outline-none"
            />
          </Field>

          <Field label={t("foodos.sitio.about")}>
            <textarea
              value={about}
              rows={6}
              maxLength={4000}
              onChange={(e) => setAbout(e.target.value)}
              placeholder={t("foodos.sitio.aboutPlaceholder")}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-[#0E7A0E] focus:outline-none"
            />
          </Field>

          <Field label={t("foodos.sitio.keywords")}>
            <input
              type="text"
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              placeholder={t("foodos.sitio.keywordsPlaceholder")}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-[#0E7A0E] focus:outline-none"
            />
          </Field>
          <p className="text-xs text-gray-500">{t("foodos.sitio.keywordsHint")}</p>

          <Field label={t("foodos.sitio.googleBusiness")}>
            <input
              type="url"
              value={googleBusiness}
              onChange={(e) => setGoogleBusiness(e.target.value)}
              placeholder={t("foodos.sitio.googleBusinessPlaceholder")}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-[#0E7A0E] focus:outline-none"
            />
          </Field>

          <button
            type="button"
            onClick={saveProfile}
            disabled={saving}
            className="touch-target inline-flex items-center gap-2 rounded-xl bg-[#0E7A0E] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0b610b] disabled:opacity-60"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : null}
            {t("foodos.sitio.save")}
          </button>
        </div>
      </section>

      {/* ── Google Business ────────────────────────────────── */}
      <section className="bg-white rounded-2xl border border-gray-100 p-5">
        <h2 className="font-bold text-gray-900">{t("foodos.sitio.checklistTitle")}</h2>
        <p className="text-xs text-gray-500 mt-1">{t("foodos.sitio.checklistHint")}</p>

        <ul className="mt-4 space-y-2">
          {site.checklist.map((step) => (
            <li
              key={step.key}
              className="flex items-start gap-3 rounded-xl border border-gray-100 px-3 py-2.5"
            >
              <span
                className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full ${
                  step.done ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                }`}
                aria-hidden
              >
                {step.done ? <Check className="w-3 h-3" /> : <span className="text-[10px]">•</span>}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900">
                  {t(`foodos.sitio.step_${step.key}`)}
                </p>
                <p className="text-xs text-gray-500">
                  {step.done ? t("foodos.sitio.checklistDone") : t("foodos.sitio.checklistPending")}
                </p>
              </div>
              {step.href ? (
                <a
                  href={step.href}
                  target="_blank"
                  rel="noreferrer"
                  className="touch-target inline-flex shrink-0 items-center gap-1 rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                >
                  <ExternalLink className="w-3.5 h-3.5" aria-hidden />
                  {t("foodos.sitio.openLink")}
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      {/* ── Páginas ────────────────────────────────────────── */}
      <section className="bg-white rounded-2xl border border-gray-100 p-5">
        <h2 className="font-bold text-gray-900">{t("foodos.sitio.pagesTitle")}</h2>
        <p className="text-xs text-gray-500 mt-1">{t("foodos.sitio.pagesHint")}</p>

        <Field label={t("foodos.sitio.notes")}>
          <textarea
            value={notes}
            rows={3}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t("foodos.sitio.notesPlaceholder")}
            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-[#0E7A0E] focus:outline-none"
          />
        </Field>
        <p className="mt-1 text-xs text-gray-500">{t("foodos.sitio.notesHint")}</p>

        <div className="mt-4 flex flex-wrap gap-2">
          {GENERATORS.map((generator) => (
            <button
              key={generator.kind}
              type="button"
              onClick={() => generate(generator.kind)}
              disabled={busy !== null}
              className="touch-target inline-flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
            >
              {busy === generator.kind ? (
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
              ) : (
                <Sparkles className="w-4 h-4" aria-hidden />
              )}
              {t(generator.labelKey)}
            </button>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-2">
          <div className="min-w-[200px] flex-1">
            <Field label={t("foodos.sitio.dish")}>
              <select
                value={dishId}
                onChange={(e) => setDishId(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-[#0E7A0E] focus:outline-none"
              >
                {site.dishes.length === 0 ? (
                  <option value="">{t("foodos.sitio.noDishes")}</option>
                ) : null}
                {site.dishes.map((dish) => (
                  <option key={dish.id} value={dish.id}>
                    {dish.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <button
            type="button"
            onClick={() => generate("dish")}
            disabled={busy !== null || site.dishes.length === 0}
            className="touch-target inline-flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
          >
            {busy === "dish" ? (
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
            ) : (
              <Sparkles className="w-4 h-4" aria-hidden />
            )}
            {t("foodos.sitio.generateDish")}
          </button>
        </div>

        {site.pages.length === 0 ? (
          <p className="mt-5 text-sm text-gray-500">{t("foodos.sitio.pagesEmpty")}</p>
        ) : (
          <ul className="mt-5 space-y-3">
            {site.pages.map((page) => {
              const rowBusy = busy === page.id
              return (
                <li key={page.id} className="rounded-xl border border-gray-100 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900">{page.title}</p>
                      <p className="text-xs text-gray-500">
                        {kindLabel(page.kind)}
                        {" · "}
                        {page.status === "published"
                          ? t("foodos.sitio.publishedBadge")
                          : t("foodos.sitio.draftBadge")}
                        {page.source === "llm"
                          ? ` · ${t("foodos.sitio.sourceLlm")}`
                          : ` · ${t("foodos.sitio.sourceTemplate")}`}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${
                        page.status === "published"
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {page.status === "published"
                        ? t("foodos.sitio.publishedBadge")
                        : t("foodos.sitio.draftBadge")}
                    </span>
                  </div>

                  {page.body ? (
                    <p className="mt-2 line-clamp-3 text-xs text-gray-500">{page.body}</p>
                  ) : null}

                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setStatus(page, page.status !== "published")}
                      disabled={rowBusy}
                      className="touch-target inline-flex items-center gap-1.5 rounded-xl bg-[#0E7A0E] px-3 py-2 text-xs font-semibold text-white hover:bg-[#0b610b] disabled:opacity-60"
                    >
                      {rowBusy ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
                      ) : null}
                      {page.status === "published"
                        ? t("foodos.sitio.unpublish")
                        : t("foodos.sitio.publish")}
                    </button>

                    {page.status === "published" ? (
                      <a
                        href={`${site.urls.site}${seoPagePath(restaurant.slug, page.slug)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="touch-target inline-flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                      >
                        <ExternalLink className="w-3.5 h-3.5" aria-hidden />
                        {t("foodos.sitio.openLink")}
                      </a>
                    ) : null}

                    <button
                      type="button"
                      onClick={() => remove(page)}
                      disabled={rowBusy}
                      className="touch-target inline-flex items-center gap-1.5 rounded-xl border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
                    >
                      <Trash2 className="w-3.5 h-3.5" aria-hidden />
                      {t("foodos.sitio.remove")}
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}

        {pending.length > 0 ? (
          <p className="mt-4 text-xs text-gray-500">
            {t("foodos.sitio.pendingHint", { n: String(pending.length) })}
          </p>
        ) : null}
      </section>

      <ToolGuideHost
        toolKey="sitio-ia"
        pathname="/panel/foodos/sitio-ia"
        slug={restaurant.slug}
        icon="🌐"
        title={t("foodos.sitio.title")}
        subtitle={t("foodos.sitio.guideSubtitle")}
      />

      {upsellDialog}
    </div>
  )
}

function Header() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">{t("foodos.sitio.title")}</h1>
      <p className="text-sm text-gray-500 mt-1">{t("foodos.sitio.subtitle")}</p>
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-semibold text-gray-600">{label}</span>
      {children}
    </label>
  )
}
