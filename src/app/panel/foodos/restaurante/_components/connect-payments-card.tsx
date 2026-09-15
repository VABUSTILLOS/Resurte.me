"use client"

// ============================================================
// "Cobros en línea" — onboarding de Stripe Connect Express.
//
// El estado vive en el servidor (columnas stripe_* de foodos_restaurants),
// así que la tarjeta sólo lo consulta y lo refresca; nunca lo deriva por su
// cuenta. Importante: las columnas stripe_* están revocadas para
// `authenticated`, por eso todas las escrituras pasan por server actions.
// ============================================================

import { useCallback, useEffect, useState } from "react"
import {
  AlertTriangle,
  CheckCircle2,
  CreditCard,
  ExternalLink,
  Loader2,
  RefreshCw,
  ShieldCheck,
} from "lucide-react"
import { t } from "@/lib/i18n/es"
import type { ConnectStatus } from "@/lib/stripe-connect"
import {
  getConnectStatus,
  openConnectDashboard,
  refreshConnectStatus,
  startConnectOnboarding,
} from "../../connect-actions"

type Phase = "idle" | "connecting" | "refreshing" | "dashboard"

const STATE_STYLE: Record<
  ConnectStatus["state"],
  { labelKey: string; className: string }
> = {
  not_connected: {
    labelKey: "foodos.restaurante.connectStateNotConnected",
    className: "bg-gray-100 text-gray-600",
  },
  pending: {
    labelKey: "foodos.restaurante.connectStatePending",
    className: "bg-amber-100 text-amber-800",
  },
  active: {
    labelKey: "foodos.restaurante.connectStateActive",
    className: "bg-emerald-100 text-emerald-800",
  },
  restricted: {
    labelKey: "foodos.restaurante.connectStateRestricted",
    className: "bg-red-100 text-red-700",
  },
}

/** Quita `?connect=…` de la URL sin recargar ni ensuciar el historial. */
function clearConnectParam() {
  if (typeof window === "undefined") return
  const url = new URL(window.location.href)
  if (!url.searchParams.has("connect")) return
  url.searchParams.delete("connect")
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`)
}

function readConnectParam(): string | null {
  if (typeof window === "undefined") return null
  return new URL(window.location.href).searchParams.get("connect")
}

export function ConnectPaymentsCard({ restaurantId }: { restaurantId: string }) {
  const [status, setStatus] = useState<ConnectStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [phase, setPhase] = useState<Phase>("idle")
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setStatus(await getConnectStatus(restaurantId))
    } catch {
      setError(t("foodos.restaurante.connectLoadError"))
    } finally {
      setLoading(false)
    }
  }, [restaurantId])

  useEffect(() => {
    const run = async () => {
      await load()
      // Al volver de Stripe (return_url / refresh_url) el estado en la fila
      // todavía es viejo: se relee contra Stripe antes de mostrar nada.
      const flag = readConnectParam()
      if (flag) {
        clearConnectParam()
        if (flag === "done") setNotice(t("foodos.restaurante.connectDone"))
        setPhase("refreshing")
        try {
          const fresh = await refreshConnectStatus(restaurantId)
          if (fresh) setStatus(fresh)
        } catch {
          setError(t("foodos.restaurante.connectLoadError"))
        } finally {
          setPhase("idle")
        }
      }
    }
    run()
  }, [load, restaurantId])

  async function handleStart() {
    setError(null)
    setNotice(null)
    setPhase("connecting")
    try {
      const { url } = await startConnectOnboarding(restaurantId)
      window.location.href = url
    } catch (e) {
      setError(e instanceof Error ? e.message : t("foodos.restaurante.connectError"))
      setPhase("idle")
    }
  }

  async function handleRefresh() {
    setError(null)
    setPhase("refreshing")
    try {
      const fresh = await refreshConnectStatus(restaurantId)
      if (fresh) setStatus(fresh)
    } catch {
      setError(t("foodos.restaurante.connectLoadError"))
    } finally {
      setPhase("idle")
    }
  }

  async function handleDashboard() {
    setError(null)
    setPhase("dashboard")
    try {
      const { url } = await openConnectDashboard(restaurantId)
      window.open(url, "_blank", "noopener,noreferrer")
    } catch (e) {
      setError(e instanceof Error ? e.message : t("foodos.restaurante.connectError"))
    } finally {
      setPhase("idle")
    }
  }

  const state = status?.state ?? "not_connected"
  const badge = STATE_STYLE[state]
  const busy = phase !== "idle"
  const hasAccount = Boolean(status?.accountId)

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <CreditCard className="w-5 h-5 text-[#0E7A0E]" />
          <h2 className="font-semibold text-gray-900">
            {t("foodos.restaurante.connectTitle")}
          </h2>
          {!loading && status && (
            <span
              className={`px-2.5 py-1 rounded-full text-[11px] font-semibold ${badge.className}`}
            >
              {t(badge.labelKey)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {hasAccount && (
            <button
              onClick={handleRefresh}
              disabled={busy}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {phase === "refreshing" ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
              {phase === "refreshing"
                ? t("foodos.restaurante.connectRefreshing")
                : t("foodos.restaurante.connectRefresh")}
            </button>
          )}
          {hasAccount && (
            <button
              onClick={handleDashboard}
              disabled={busy}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              {t("foodos.restaurante.connectDashboard")}
            </button>
          )}
        </div>
      </div>

      <p className="text-sm text-gray-500 mb-4">
        {t("foodos.restaurante.connectSubtitle")}
      </p>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3 mb-4">
          {error}
        </div>
      )}
      {notice && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm rounded-xl px-4 py-3 mb-4">
          {notice}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <Loader2 className="w-4 h-4 animate-spin" />
          {t("foodos.restaurante.connectLoading")}
        </div>
      ) : (
        <div className="space-y-4">
          {state === "active" ? (
            <div className="flex items-start gap-2.5 rounded-xl bg-emerald-50 border border-emerald-100 px-4 py-3">
              <ShieldCheck className="w-4 h-4 text-emerald-700 mt-0.5 shrink-0" />
              <p className="text-xs text-emerald-900">
                {t("foodos.restaurante.connectActiveHint")}
              </p>
            </div>
          ) : (
            <div className="flex items-start gap-2.5 rounded-xl bg-amber-50 border border-amber-100 px-4 py-3">
              <AlertTriangle className="w-4 h-4 text-amber-700 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-900">
                {t("foodos.restaurante.connectPlatformWarning")}
              </p>
            </div>
          )}

          {status && status.requirementsDue.length > 0 && (
            <div className="rounded-xl border border-gray-100 bg-gray-50/50 p-4">
              <p className="text-xs font-semibold text-gray-600 mb-2">
                {t("foodos.restaurante.connectRequirementsTitle")}
              </p>
              <ul className="space-y-1">
                {status.requirementsDue.map((requirement) => (
                  <li
                    key={requirement}
                    className="text-[11px] font-mono text-gray-600 bg-white border border-gray-200 rounded-lg px-2 py-1 inline-block mr-1.5"
                  >
                    {requirement}
                  </li>
                ))}
              </ul>
              <p className="text-[11px] text-gray-400 mt-2">
                {t("foodos.restaurante.connectRequirementsHint")}
              </p>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            {state !== "active" && (
              <button
                onClick={handleStart}
                disabled={busy}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#0E7A0E] text-white text-sm font-semibold hover:bg-[#0e7a0e] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {phase === "connecting" ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4" />
                )}
                {phase === "connecting"
                  ? t("foodos.restaurante.connectOpening")
                  : hasAccount
                    ? t("foodos.restaurante.connectContinueCta")
                    : t("foodos.restaurante.connectCta")}
              </button>
            )}
            {status && status.platformFeePercent > 0 && (
              <span className="text-[11px] text-gray-400">
                {t("foodos.restaurante.connectFeeLabel", {
                  percent: status.platformFeePercent,
                })}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
