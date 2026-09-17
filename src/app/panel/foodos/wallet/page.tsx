"use client"

// ============================================================
// Tarjeta de lealtad — el pase que el comensal guarda en el teléfono.
//
// Tres bloques:
//   1. KPIs: tarjetas emitidas, activas, instaladas y saldo en circulación.
//   2. Recompensa: qué anuncia la tarjeta y a cuántos puntos.
//   3. Tarjetas emitidas: enlace personal, refresco de saldo y revocación.
//
// El saldo de cada tarjeta es una FOTOGRAFÍA del CRM: la escribe el servidor
// (trigger `foodos_sync_wallet_passes`) y aquí solo se puede pedir que se
// recalcule. Nunca se edita a mano.
// ============================================================

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react"
import Link from "next/link"
import {
  getFoodosPanelData,
  getWalletKpis,
  getWalletSettings,
  issueWalletPass,
  listWalletPassRows,
  refreshWalletPassRow,
  setWalletPassEnabled,
  upsertWalletSettings,
} from "../actions"
import StatCard from "@/components/panel/StatCard"
import ToolPreviewNotice from "@/components/panel/foodos/tool-preview-notice"
import { useTierGuard } from "@/hooks/use-tier-guard"
import ToolGuideHost from "@/components/panel/guide/tool-guide-host"
import { t } from "@/lib/i18n/es"
import { formatMoney } from "@/lib/foodos"
import type { FoodosCustomer, FoodosRestaurant } from "@/types/foodos"
import type { WalletPassRow, WalletStats } from "@/lib/foodos-wallet/passes"
import {
  Check,
  Copy,
  CreditCard,
  ExternalLink,
  Loader2,
  RefreshCw,
  Search,
  Smartphone,
  Sparkles,
  Target,
  Wallet,
} from "lucide-react"

const EMPTY_STATS: WalletStats = {
  total: 0,
  active: 0,
  apple: 0,
  google: 0,
  web: 0,
  installed: 0,
  pointsOutstanding: 0,
  valueOutstanding: 0,
}

function platformLabel(platform: WalletPassRow["platform"]): string {
  switch (platform) {
    case "apple":
      return t("foodos.wallet.platformApple")
    case "google":
      return t("foodos.wallet.platformGoogle")
    default:
      return t("foodos.wallet.platformWeb")
  }
}

/** Fecha corta: el panel se lee en móvil, sin segundos ni zona horaria. */
function shortDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return t("foodos.wallet.noData")
  return date.toLocaleDateString("es-MX", { day: "2-digit", month: "short" })
}

export default function WalletPage() {
  const { run, upsellDialog } = useTierGuard("wallet_passes")

  const [restaurant, setRestaurant] = useState<FoodosRestaurant | null>(null)
  const [customers, setCustomers] = useState<FoodosCustomer[]>([])
  const [passes, setPasses] = useState<WalletPassRow[]>([])
  const [stats, setStats] = useState<WalletStats>(EMPTY_STATS)

  const [rewardLabel, setRewardLabel] = useState("")
  const [rewardPoints, setRewardPoints] = useState("")
  const [enabled, setEnabled] = useState(true)

  const [query, setQuery] = useState("")
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)

  const load = useCallback(async () => {
    try {
      const data = await getFoodosPanelData()
      setRestaurant(data.restaurant)
      setCustomers(data.customers ?? [])
      if (!data.restaurant) return

      const [rows, metrics, program] = await Promise.all([
        listWalletPassRows(data.restaurant.id),
        getWalletKpis(data.restaurant.id),
        getWalletSettings(data.restaurant.id),
      ])
      setPasses(rows)
      setStats(metrics)
      if (program) {
        setEnabled(program.wallet_enabled)
        setRewardLabel(program.reward_label ?? "")
        setRewardPoints(
          program.reward_points === null ? "" : String(program.reward_points)
        )
      }
    } catch (err) {
      setNotice({
        ok: false,
        text: err instanceof Error ? err.message : t("foodos.wallet.actionError"),
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

  /** Clientes sin tarjeta activa que coinciden con la búsqueda. */
  const candidates = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (term.length < 2) return []
    const issued = new Set(
      passes.filter((p) => p.is_active).map((p) => p.customer_phone)
    )
    return customers
      .filter((c) => !issued.has(c.phone))
      .filter(
        (c) =>
          (c.name ?? "").toLowerCase().includes(term) || c.phone.includes(term)
      )
      .slice(0, 6)
  }, [customers, passes, query])

  async function saveSettings() {
    if (!restaurant) return
    const points = rewardPoints.trim() === "" ? null : Number(rewardPoints)
    if (points !== null && !rewardLabel.trim()) {
      setNotice({ ok: false, text: t("foodos.wallet.rewardNeedsLabel") })
      return
    }
    setSaving(true)
    setNotice(null)
    try {
      const attempt = await run(() =>
        upsertWalletSettings({
          restaurant_id: restaurant.id,
          wallet_enabled: enabled,
          reward_points: points,
          reward_label: rewardLabel,
        })
      )
      if (!attempt.ran) return
      setNotice({ ok: true, text: t("foodos.wallet.saved") })
      await load()
    } catch (err) {
      setNotice({
        ok: false,
        text: err instanceof Error ? err.message : t("foodos.wallet.actionError"),
      })
    } finally {
      setSaving(false)
    }
  }

  async function issue(customerId: string) {
    if (!restaurant) return
    setBusyId(customerId)
    setNotice(null)
    try {
      const attempt = await run(() =>
        issueWalletPass({
          restaurant_id: restaurant.id,
          customer_id: customerId,
        })
      )
      if (!attempt.ran) return
      const result = attempt.value
      setNotice({
        ok: result.ok,
        text: result.ok
          ? t("foodos.wallet.issueIssued")
          : result.error ?? t("foodos.wallet.issueError"),
      })
      if (result.ok) setQuery("")
      await load()
    } catch (err) {
      setNotice({
        ok: false,
        text: err instanceof Error ? err.message : t("foodos.wallet.issueError"),
      })
    } finally {
      setBusyId(null)
    }
  }

  async function togglePass(pass: WalletPassRow) {
    if (!restaurant) return
    setBusyId(pass.id)
    setNotice(null)
    try {
      const attempt = await run(() =>
        setWalletPassEnabled({
          restaurant_id: restaurant.id,
          pass_id: pass.id,
          is_active: !pass.is_active,
        })
      )
      if (!attempt.ran) return
      const result = attempt.value
      if (!result.ok) throw new Error(result.error ?? t("foodos.wallet.actionError"))
      await load()
    } catch (err) {
      setNotice({
        ok: false,
        text: err instanceof Error ? err.message : t("foodos.wallet.actionError"),
      })
    } finally {
      setBusyId(null)
    }
  }

  async function refreshPass(pass: WalletPassRow) {
    if (!restaurant) return
    setBusyId(pass.id)
    setNotice(null)
    try {
      const attempt = await run(() =>
        refreshWalletPassRow({
          restaurant_id: restaurant.id,
          pass_id: pass.id,
        })
      )
      if (!attempt.ran) return
      const result = attempt.value
      if (!result.ok) throw new Error(result.error ?? t("foodos.wallet.actionError"))
      await load()
    } catch (err) {
      setNotice({
        ok: false,
        text: err instanceof Error ? err.message : t("foodos.wallet.actionError"),
      })
    } finally {
      setBusyId(null)
    }
  }

  async function copyLink(pass: WalletPassRow) {
    try {
      await navigator.clipboard.writeText(pass.url)
      setCopiedId(pass.id)
      window.setTimeout(
        () => setCopiedId((current) => (current === pass.id ? null : current)),
        2000
      )
    } catch {
      setNotice({ ok: false, text: t("foodos.wallet.actionError") })
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
          <Wallet className="w-12 h-12 text-gray-300 mx-auto mb-3" aria-hidden />
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

      <ToolPreviewNotice feature="wallet_passes" />

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
          <StatCard label={t("foodos.wallet.kpiTotal")} value={stats.total} icon={CreditCard} />
          <StatCard
            label={t("foodos.wallet.kpiActive")}
            value={stats.active}
            icon={Check}
            tone="positive"
          />
          <StatCard
            label={t("foodos.wallet.kpiInstalled")}
            value={stats.installed}
            icon={Smartphone}
            hint={`${t("foodos.wallet.platformApple")} ${stats.apple} · ${t("foodos.wallet.platformGoogle")} ${stats.google}`}
          />
          <StatCard label={t("foodos.wallet.kpiWeb")} value={stats.web} icon={Wallet} />
        </div>
        <div className="grid grid-cols-2 gap-3 mt-3">
          <StatCard
            label={t("foodos.wallet.kpiPoints")}
            value={stats.pointsOutstanding.toLocaleString("es-MX")}
            icon={Sparkles}
          />
          <StatCard
            label={t("foodos.wallet.kpiValue")}
            value={formatMoney(stats.valueOutstanding)}
            icon={Target}
          />
        </div>
      </section>

      {/* ── Recompensa ─────────────────────────────────────── */}
      <section className="bg-white rounded-2xl border border-gray-100 p-5">
        <h2 className="font-bold text-gray-900">{t("foodos.wallet.settingsTitle")}</h2>
        <p className="text-xs text-gray-500 mt-1">{t("foodos.wallet.settingsHint")}</p>

        <div className="mt-4 space-y-4">
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-[#0E7A0E]"
            />
            <span>
              <span className="block text-sm font-semibold text-gray-900">
                {t("foodos.wallet.walletEnabled")}
              </span>
              <span className="block text-xs text-gray-500 mt-0.5">
                {t("foodos.wallet.walletEnabledHint")}
              </span>
            </span>
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("foodos.wallet.rewardLabel")}>
              <input
                type="text"
                value={rewardLabel}
                onChange={(e) => setRewardLabel(e.target.value)}
                placeholder={t("foodos.wallet.rewardLabelPlaceholder")}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-[#0E7A0E] focus:outline-none"
              />
            </Field>
            <Field label={t("foodos.wallet.rewardPoints")}>
              <input
                type="number"
                min={1}
                inputMode="numeric"
                value={rewardPoints}
                onChange={(e) => setRewardPoints(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-[#0E7A0E] focus:outline-none"
              />
            </Field>
          </div>

          <p className="text-xs text-gray-500">{t("foodos.wallet.rewardPointsHint")}</p>

          {rewardPoints.trim() !== "" && rewardLabel.trim() !== "" && (
            <p className="rounded-xl bg-gray-50 border border-gray-100 px-3 py-2 text-sm text-gray-700">
              {t("foodos.wallet.rewardPreview", {
                points: rewardPoints,
                label: rewardLabel,
              })}
            </p>
          )}

          <button
            type="button"
            onClick={saveSettings}
            disabled={saving}
            className="touch-target inline-flex items-center gap-2 rounded-xl bg-[#0E7A0E] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0c6b0c] disabled:opacity-60"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
            ) : (
              <Check className="w-4 h-4" aria-hidden />
            )}
            {saving ? t("foodos.wallet.saving") : t("foodos.wallet.save")}
          </button>
        </div>
      </section>

      {/* ── Emitir a mano ──────────────────────────────────── */}
      <section className="bg-white rounded-2xl border border-gray-100 p-5">
        <h2 className="font-bold text-gray-900">{t("foodos.wallet.issueTitle")}</h2>
        <p className="text-xs text-gray-500 mt-1">{t("foodos.wallet.issueHint")}</p>

        <div className="relative mt-3">
          <Search
            className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2"
            aria-hidden
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("foodos.wallet.issuePlaceholder")}
            aria-label={t("foodos.wallet.issuePlaceholder")}
            className="w-full rounded-xl border border-gray-200 pl-9 pr-3 py-2.5 text-sm focus:border-[#0E7A0E] focus:outline-none"
          />
        </div>

        {query.trim().length === 1 && (
          <p className="mt-2 text-xs text-gray-500">{t("foodos.wallet.issueSearchFirst")}</p>
        )}
        {query.trim().length >= 2 && candidates.length === 0 && (
          <p className="mt-2 text-xs text-gray-500">{t("foodos.wallet.issueNoResults")}</p>
        )}

        {candidates.length > 0 && (
          <ul className="mt-3 divide-y divide-gray-100 border border-gray-100 rounded-xl overflow-hidden">
            {candidates.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-gray-900 truncate">
                    {c.name || c.phone}
                  </span>
                  <span className="block text-xs text-gray-500">{c.phone}</span>
                </span>
                <button
                  type="button"
                  onClick={() => issue(c.id)}
                  disabled={busyId === c.id}
                  className="touch-target shrink-0 inline-flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                >
                  {busyId === c.id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
                  ) : (
                    <CreditCard className="w-3.5 h-3.5" aria-hidden />
                  )}
                  {t("foodos.wallet.issueAction")}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Tarjetas emitidas ──────────────────────────────── */}
      <section className="bg-white rounded-2xl border border-gray-100 p-5">
        <h2 className="font-bold text-gray-900">{t("foodos.wallet.passesTitle")}</h2>
        <p className="text-xs text-gray-500 mt-1">{t("foodos.wallet.passesHint")}</p>

        {passes.length === 0 ? (
          <div className="mt-4 rounded-xl bg-gray-50 border border-gray-100 p-6 text-center">
            <CreditCard className="w-10 h-10 text-gray-300 mx-auto mb-2" aria-hidden />
            <p className="text-sm font-medium text-gray-700">{t("foodos.wallet.passesEmpty")}</p>
            <p className="text-xs text-gray-500 mt-1">{t("foodos.wallet.passesEmptyHint")}</p>
          </div>
        ) : (
          <ul className="mt-4 space-y-3">
            {passes.map((pass) => {
              const busy = busyId === pass.id
              return (
                <li key={pass.id} className="rounded-xl border border-gray-100 p-3 sm:p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">
                        {pass.customer_name || pass.customer_phone}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {platformLabel(pass.platform)} · {t("foodos.wallet.colUpdated")}{" "}
                        {shortDate(pass.snapshot_at)}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-semibold ${
                        pass.is_active
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : "bg-gray-100 text-gray-600 border-gray-200"
                      }`}
                    >
                      {pass.is_active
                        ? t("foodos.wallet.statusActive")
                        : t("foodos.wallet.statusRevoked")}
                    </span>
                  </div>

                  <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <dt className="text-xs text-gray-500">{t("foodos.wallet.colPoints")}</dt>
                      <dd className="font-semibold text-gray-900">
                        {pass.points.toLocaleString("es-MX")}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-gray-500">{t("foodos.wallet.colValue")}</dt>
                      <dd className="font-semibold text-gray-900">
                        {formatMoney(pass.points_value)}
                      </dd>
                    </div>
                  </dl>

                  {pass.reward_label && pass.reward_threshold !== null && (
                    <p className="mt-2 text-xs text-gray-600">
                      {t("foodos.wallet.rewardPreview", {
                        points: pass.reward_threshold,
                        label: pass.reward_label,
                      })}
                    </p>
                  )}

                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => copyLink(pass)}
                      className="touch-target inline-flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                    >
                      {copiedId === pass.id ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600" aria-hidden />
                      ) : (
                        <Copy className="w-3.5 h-3.5" aria-hidden />
                      )}
                      {copiedId === pass.id
                        ? t("foodos.wallet.copied")
                        : t("foodos.wallet.copyLink")}
                    </button>

                    <a
                      href={pass.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="touch-target inline-flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                    >
                      <ExternalLink className="w-3.5 h-3.5" aria-hidden />
                      {t("foodos.wallet.openLink")}
                    </a>

                    <button
                      type="button"
                      onClick={() => refreshPass(pass)}
                      disabled={busy}
                      className="touch-target inline-flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                    >
                      {busy ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
                      ) : (
                        <RefreshCw className="w-3.5 h-3.5" aria-hidden />
                      )}
                      {t("foodos.wallet.refreshPass")}
                    </button>

                    <button
                      type="button"
                      onClick={() => togglePass(pass)}
                      disabled={busy}
                      className={`touch-target inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold disabled:opacity-60 ${
                        pass.is_active
                          ? "border-red-200 text-red-700 hover:bg-red-50"
                          : "border-gray-200 text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      {pass.is_active
                        ? t("foodos.wallet.revoke")
                        : t("foodos.wallet.reactivate")}
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <ToolGuideHost
        toolKey="wallet"
        pathname="/panel/foodos/wallet"
        slug={restaurant.slug}
        icon="💳"
        title={t("foodos.wallet.title")}
        subtitle={t("foodos.wallet.guideSubtitle")}
      />

      {upsellDialog}
    </div>
  )
}

function Header() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">{t("foodos.wallet.title")}</h1>
      <p className="text-sm text-gray-500 mt-1">{t("foodos.wallet.subtitle")}</p>
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
