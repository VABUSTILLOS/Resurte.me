"use client"

// ============================================================
// App de tu marca — lo que el comensal ve al instalar tu restaurante.
//
// El manifest ya existía (`/r/[slug]/manifest.webmanifest`) pero dos campos
// salían mal y el dueño no podía arreglarlos: el nombre bajo el icono se
// recortaba a 12 caracteres ("Restaurante La Parrilla" → "Restaurante ") y el
// fondo de arranque era el beige de Resurte.me. 00159 añadió las dos columnas,
// 00160 las dejó fuera del UPDATE del dueño y `saveAppBrand` es el único camino
// de escritura. Esta pantalla es la cara de esa capacidad.
//
// Cinco bloques:
//   1. Vista previa: cómo queda el icono y la pantalla de arranque.
//   2. Editable: nombre bajo el icono y color de arranque, con guardado.
//   3. Enlace de instalación + QR para el mostrador.
//   4. Qué le falta (checklist derivado de datos que ya existen).
//   5. Lo que esta app NO hace (tienda de apps, push, capacidades nativas).
//
// Regla que la UI hace visible: **lo que se ve es lo que se guarda**. La
// previsualización usa el valor ya normalizado —el mismo que aplicará el
// servidor—, así que no puede prometer un nombre que el manifest no va a
// escribir.
// ============================================================

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  AlertCircle,
  Check,
  Copy,
  Download,
  ExternalLink,
  Info,
  Loader2,
  RefreshCw,
  Save,
  Smartphone,
} from "lucide-react"
import {
  getAppBrandData,
  getFoodosPanelData,
  saveAppBrand,
  type AppBrandData,
} from "../actions"
import StatCard from "@/components/panel/StatCard"
import ToolPreviewNotice from "@/components/panel/foodos/tool-preview-notice"
import { useTierGuard } from "@/hooks/use-tier-guard"
import ToolGuideHost from "@/components/panel/guide/tool-guide-host"
import { t } from "@/lib/i18n/es"
import {
  MANIFEST_SHORT_NAME_MAX,
  normalizeAppBackgroundColor,
  normalizeAppShortName,
} from "@/lib/foodos-app-brand"
import { manifestBackgroundColor, manifestShortName } from "@/lib/foodos-seo"
import { publicRestaurantUrl } from "@/lib/foodos"
import type { FoodosRestaurant } from "@/types/foodos"

export default function AppMarcaPage() {
  const { run, upsellDialog } = useTierGuard("app_marca")

  const [restaurant, setRestaurant] = useState<FoodosRestaurant | null>(null)
  const [data, setData] = useState<AppBrandData | null>(null)

  const [shortName, setShortName] = useState("")
  const [backgroundColor, setBackgroundColor] = useState("")

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const [qrUrl, setQrUrl] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)

  const load = useCallback(async () => {
    try {
      const panel = await getFoodosPanelData()
      setRestaurant(panel.restaurant)
      if (!panel.restaurant) return

      const brand = await getAppBrandData(panel.restaurant.id)
      setData(brand)
      if (brand) {
        setShortName(brand.app_short_name ?? "")
        setBackgroundColor(brand.app_background_color ?? "")
      }
    } catch (err) {
      setNotice({
        ok: false,
        text: err instanceof Error ? err.message : t("foodos.appBrand.actionError"),
      })
    }
  }, [])

  useEffect(() => {
    const boot = async () => {
      setLoading(true)
      await load()
      setLoading(false)
    }
    boot()
  }, [load])

  // El QR apunta al mismo enlace del micrositio: instalar la app es abrirlo en
  // el teléfono. `qrcode` se carga bajo demanda para no engordar el bundle.
  useEffect(() => {
    if (!restaurant) return
    const url = publicRestaurantUrl(restaurant.slug)
    let cancelled = false
    import("qrcode")
      .then(({ toDataURL }) =>
        toDataURL(url, { width: 320, margin: 2 })
          .then((dataUrl) => {
            if (!cancelled) setQrUrl(dataUrl)
          })
          .catch(() => {
            if (!cancelled) setQrUrl(null)
          })
      )
      .catch(() => {
        if (!cancelled) setQrUrl(null)
      })
    return () => {
      cancelled = true
    }
  }, [restaurant])

  async function refresh() {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }

  async function copy(value: string, key: string) {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(key)
      window.setTimeout(
        () => setCopied((current) => (current === key ? null : current)),
        2000
      )
    } catch {
      setNotice({ ok: false, text: t("foodos.appBrand.actionError") })
    }
  }

  // La previsualización usa la MISMA normalización que aplicará el servidor:
  // si el dueño escribe 13 caracteres, aquí ya se ve el error y no un recorte.
  const shortNameField = useMemo(() => normalizeAppShortName(shortName), [shortName])
  const backgroundColorField = useMemo(
    () => normalizeAppBackgroundColor(backgroundColor),
    [backgroundColor]
  )

  // La previsualización no reimplementa el manifest: le pasa el mismo perfil a
  // `manifestShortName` / `manifestBackgroundColor`, que son las funciones que
  // el manifest real usa. Así "lo que ves" no puede separarse de "lo que se
  // escribe". Un valor inválido normaliza a `null`, y `null` significa
  // "derívalo": la previsualización muestra el valor derivado y el error vive
  // en el mensaje, no en un número inventado.
  const previewProfile = useMemo(
    () => ({
      slug: data?.slug ?? "",
      name: data?.name ?? "",
      app_short_name: shortNameField.value,
      app_background_color: backgroundColorField.value,
    }),
    [data?.slug, data?.name, shortNameField.value, backgroundColorField.value]
  )
  const effectiveShortName = manifestShortName(previewProfile)
  const effectiveBackground = manifestBackgroundColor(previewProfile)

  async function save() {
    if (!restaurant) return
    if (shortNameField.error) {
      setNotice({ ok: false, text: shortNameField.error })
      return
    }
    if (backgroundColorField.error) {
      setNotice({ ok: false, text: backgroundColorField.error })
      return
    }
    setSaving(true)
    setNotice(null)
    try {
      const attempt = await run(() =>
        saveAppBrand({
          restaurant_id: restaurant.id,
          short_name: shortName,
          background_color: backgroundColor,
        })
      )
      if (!attempt.ran) return
      const result = attempt.value
      if (!result.ok) throw new Error(result.error ?? t("foodos.appBrand.saveError"))
      setNotice({ ok: true, text: t("foodos.appBrand.saved") })
      await load()
    } catch (err) {
      setNotice({
        ok: false,
        text: err instanceof Error ? err.message : t("foodos.appBrand.saveError"),
      })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-[#0E7A0E]" aria-hidden />
      </div>
    )
  }

  if (!restaurant || !data) {
    return (
      <div className="space-y-6">
        <Header />
        <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
          <Smartphone className="w-12 h-12 text-gray-300 mx-auto mb-3" aria-hidden />
          <p className="text-sm text-gray-500">{t("foodos.appBrand.setupTitle")}</p>
          <Link
            href="/panel/foodos/restaurante"
            className="inline-block mt-3 text-[#0E7A0E] font-semibold hover:underline"
          >
            {t("foodos.restaurante.title")}
          </Link>
        </div>
      </div>
    )
  }

  const dirty =
    shortNameField.value !== (data.app_short_name ?? null) ||
    backgroundColorField.value !== (data.app_background_color ?? null)
  const invalid = Boolean(shortNameField.error || backgroundColorField.error)

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
          <RefreshCw
            className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`}
            aria-hidden
          />
          {t("foodos.common.retry")}
        </button>
      </div>

      <ToolPreviewNotice feature="app_marca" pathname="/panel/foodos/app-marca" />

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
          <StatCard
            label={t("foodos.appBrand.kpiReady")}
            value={`${data.progress.done}/${data.progress.total}`}
            icon={Check}
            tone={data.progress.ratio === 1 ? "positive" : "default"}
          />
          <StatCard
            label={t("foodos.appBrand.kpiPending")}
            value={data.progress.pending.length}
            icon={AlertCircle}
            tone={data.progress.pending.length > 0 ? "warning" : "positive"}
          />
          <StatCard
            label={t("foodos.appBrand.kpiName")}
            value={effectiveShortName || "—"}
            icon={Smartphone}
          />
          <StatCard
            label={t("foodos.appBrand.kpiMenu")}
            value={data.menu_item_count}
            icon={Download}
            tone={data.menu_item_count > 0 ? "positive" : "warning"}
          />
        </div>
      </section>

      {/* ── Vista previa + editable ────────────────────────── */}
      <section className="bg-white rounded-2xl border border-gray-100 p-5">
        <h2 className="font-bold text-gray-900">{t("foodos.appBrand.previewTitle")}</h2>
        <p className="text-xs text-gray-500 mt-1">{t("foodos.appBrand.previewHint")}</p>

        <div className="mt-4 grid gap-5 lg:grid-cols-[280px_1fr]">
          <PhonePreview
            name={effectiveShortName}
            background={effectiveBackground}
            logoUrl={data.logo_url}
          />

          <div className="space-y-4">
            <Field label={t("foodos.appBrand.nameLabel")}>
              <input
                type="text"
                value={shortName}
                maxLength={MANIFEST_SHORT_NAME_MAX + 1}
                onChange={(e) => setShortName(e.target.value)}
                placeholder={t("foodos.appBrand.namePlaceholder")}
                aria-invalid={shortNameField.error ? true : undefined}
                className={`w-full rounded-xl border px-3 py-2 text-sm focus:outline-none ${
                  shortNameField.error
                    ? "border-red-300 focus:border-red-400"
                    : "border-gray-200 focus:border-[#0E7A0E]"
                }`}
              />
            </Field>
            <p className="text-xs text-gray-500">
              {t("foodos.appBrand.nameHint", { n: String(MANIFEST_SHORT_NAME_MAX) })}
            </p>
            {shortNameField.error ? (
              <p className="flex items-start gap-1.5 text-xs font-medium text-red-600">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden />
                {shortNameField.error}
              </p>
            ) : shortNameField.value === null ? (
              <p className="text-xs text-gray-500">
                {t("foodos.appBrand.nameEmptyFallback", { name: effectiveShortName || "—" })}
              </p>
            ) : null}

            <div className="space-y-1">
              <span className="text-xs font-semibold text-gray-600">
                {t("foodos.appBrand.colorLabel")}
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="color"
                  value={effectiveBackground}
                  onChange={(e) => setBackgroundColor(e.target.value)}
                  aria-label={t("foodos.appBrand.colorLabel")}
                  className="h-10 w-14 cursor-pointer rounded-lg border border-gray-200 bg-white p-1"
                />
                <input
                  type="text"
                  value={backgroundColor}
                  onChange={(e) => setBackgroundColor(e.target.value)}
                  placeholder={t("foodos.appBrand.colorPlaceholder")}
                  aria-label={t("foodos.appBrand.colorPlaceholder")}
                  aria-invalid={backgroundColorField.error ? true : undefined}
                  className={`min-w-[140px] flex-1 rounded-xl border px-3 py-2 text-sm font-mono focus:outline-none ${
                    backgroundColorField.error
                      ? "border-red-300 focus:border-red-400"
                      : "border-gray-200 focus:border-[#0E7A0E]"
                  }`}
                />
              </div>
            </div>
            <p className="text-xs text-gray-500">{t("foodos.appBrand.colorHint")}</p>
            {backgroundColorField.error ? (
              <p className="flex items-start gap-1.5 text-xs font-medium text-red-600">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden />
                {backgroundColorField.error}
              </p>
            ) : null}

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={save}
                disabled={saving || invalid || !dirty}
                className="touch-target inline-flex items-center gap-2 rounded-xl bg-[#0E7A0E] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0b610b] disabled:opacity-60"
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
                ) : (
                  <Save className="w-4 h-4" aria-hidden />
                )}
                {t("foodos.appBrand.save")}
              </button>
              {dirty && !invalid ? (
                <span className="text-xs text-amber-600 font-medium">
                  {t("foodos.appBrand.unsaved")}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      {/* ── Enlace + QR ────────────────────────────────────── */}
      <section className="bg-white rounded-2xl border border-gray-100 p-5">
        <h2 className="font-bold text-gray-900">{t("foodos.appBrand.linksTitle")}</h2>
        <p className="text-xs text-gray-500 mt-1">{t("foodos.appBrand.linksHint")}</p>

        <ul className="mt-4 space-y-3">
          {[
            { key: "install", label: t("foodos.appBrand.linkInstall"), url: data.urls.install },
            { key: "manifest", label: t("foodos.appBrand.linkManifest"), url: data.urls.manifest },
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
                  {copied === entry.key
                    ? t("foodos.appBrand.copied")
                    : t("foodos.appBrand.copy")}
                </button>
                <a
                  href={entry.url}
                  target="_blank"
                  rel="noreferrer"
                  className="touch-target inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                >
                  <ExternalLink className="w-3.5 h-3.5" aria-hidden />
                  {t("foodos.appBrand.openLink")}
                </a>
              </div>
            </li>
          ))}
        </ul>

        <div className="mt-4 grid gap-4 sm:grid-cols-[auto_1fr] sm:items-start">
          <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
            {qrUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element -- QR generado en cliente como data URL (qrcode.toDataURL); next/image no optimiza data URLs */
              <img src={qrUrl} alt={t("foodos.appBrand.qrAlt")} width={160} height={160} />
            ) : (
              <div className="flex h-[160px] w-[160px] items-center justify-center text-center text-[11px] text-gray-400">
                {t("foodos.appBrand.qrError")}
              </div>
            )}
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">{t("foodos.appBrand.qrTitle")}</p>
            <p className="mt-1 text-xs text-gray-500">{t("foodos.appBrand.qrHint")}</p>
            <div className="mt-3 rounded-xl bg-emerald-50 border border-emerald-100 px-3 py-3">
              <p className="text-xs font-semibold text-emerald-800">
                {t("foodos.appBrand.installTitle")}
              </p>
              <p className="mt-1 text-xs text-emerald-700">{t("foodos.appBrand.installIos")}</p>
              <p className="mt-0.5 text-xs text-emerald-700">
                {t("foodos.appBrand.installAndroid")}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Checklist ──────────────────────────────────────── */}
      <section className="bg-white rounded-2xl border border-gray-100 p-5">
        <h2 className="font-bold text-gray-900">{t("foodos.appBrand.checklistTitle")}</h2>
        <p className="text-xs text-gray-500 mt-1">{t("foodos.appBrand.checklistHint")}</p>

        <ul className="mt-4 space-y-2">
          {data.steps.map((step) => (
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
                {step.done ? (
                  <Check className="w-3 h-3" />
                ) : (
                  <span className="text-[10px]">•</span>
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900">
                  {t(`foodos.appBrand.step_${step.key}`)}
                </p>
                <p className="text-xs text-gray-500">
                  {step.done
                    ? t("foodos.appBrand.checklistDone")
                    : t("foodos.appBrand.checklistPending")}
                </p>
              </div>
              {step.href ? (
                <Link
                  href={step.href}
                  className="touch-target inline-flex shrink-0 items-center gap-1 rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                >
                  <ExternalLink className="w-3.5 h-3.5" aria-hidden />
                  {t("foodos.appBrand.openLink")}
                </Link>
              ) : null}
            </li>
          ))}
        </ul>

        {data.progress.pending.length > 0 ? (
          <p className="mt-4 text-xs text-gray-500">
            {t("foodos.appBrand.pendingHint", {
              n: String(data.progress.pending.length),
            })}
          </p>
        ) : null}
      </section>

      {/* ── Alcance ────────────────────────────────────────── */}
      <section className="bg-white rounded-2xl border border-gray-100 p-5">
        <h2 className="flex items-center gap-2 font-bold text-gray-900">
          <Info className="w-4 h-4 text-gray-400" aria-hidden />
          {t("foodos.appBrand.scopeTitle")}
        </h2>
        <p className="text-xs text-gray-500 mt-1">{t("foodos.appBrand.scopeHint")}</p>

        <ul className="mt-4 space-y-2">
          {[
            t("foodos.appBrand.scopeNoStore"),
            t("foodos.appBrand.scopeNoPush"),
            t("foodos.appBrand.scopeNoNative"),
          ].map((line) => (
            <li key={line} className="flex items-start gap-2 text-sm text-gray-600">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-gray-300" aria-hidden />
              {line}
            </li>
          ))}
        </ul>
      </section>

      <ToolGuideHost
        toolKey="app-marca"
        pathname="/panel/foodos/app-marca"
        slug={restaurant.slug}
        icon="📱"
        title={t("foodos.appBrand.title")}
        subtitle={t("foodos.appBrand.guideSubtitle")}
      />

      {upsellDialog}
    </div>
  )
}

/**
 * Maqueta del teléfono. No es una captura: usa el logo, el color y el nombre
 * reales —ya normalizados— así que lo que se ve aquí es lo que el manifest va a
 * escribir. El icono cae al de Resurte.me cuando no hay logo, igual que
 * `manifestIcons`.
 */
function PhonePreview({
  name,
  background,
  logoUrl,
}: {
  name: string
  background: string
  logoUrl: string | null
}) {
  return (
    <div className="space-y-3">
      <div className="rounded-[1.75rem] border-4 border-gray-800 bg-white p-3 shadow-sm">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
          {t("foodos.appBrand.previewHomeHint")}
        </p>
        <div className="mt-3 grid grid-cols-4 gap-3">
          <div className="flex flex-col items-center gap-1">
            {logoUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element -- logo remoto del restaurante; el tamaño lo fija el contenedor */
              <img
                src={logoUrl}
                alt=""
                className="size-11 rounded-[0.85rem] object-cover"
              />
            ) : (
              <span
                aria-hidden
                className="flex size-11 items-center justify-center rounded-[0.85rem] bg-[#0E7A0E] text-lg"
              >
                🍽️
              </span>
            )}
            <span className="w-full truncate text-center text-[9px] leading-tight text-gray-700">
              {name || "—"}
            </span>
          </div>
        </div>
      </div>

      <div className="rounded-[1.75rem] border-4 border-gray-800 p-3 shadow-sm">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
          {t("foodos.appBrand.previewSplashHint")}
        </p>
        <div
          className="mt-3 flex h-32 items-center justify-center rounded-2xl"
          style={{ backgroundColor: background }}
        >
          {logoUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element -- logo remoto del restaurante; el tamaño lo fija el contenedor */
            <img src={logoUrl} alt="" className="size-14 rounded-2xl object-cover" />
          ) : (
            <span className="text-2xl" aria-hidden>
              🍽️
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

function Header() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">{t("foodos.appBrand.title")}</h1>
      <p className="text-sm text-gray-500 mt-1">{t("foodos.appBrand.subtitle")}</p>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-semibold text-gray-600">{label}</span>
      {children}
    </label>
  )
}
