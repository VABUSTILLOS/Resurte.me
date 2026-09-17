"use client"

// ============================================================
// Punto de venta — conectar la caja sin capturar el menú dos veces.
//
// Cinco bloques:
//   1. KPIs: proveedores contemplados, listos, sin adaptador y fallos.
//   2. El camino que ya funciona: importar el menú por CSV.
//   3. Proveedores: credenciales, qué puede hacer cada uno y qué le falta.
//   4. Webhook entrante, solo cuando el endpoint puede aceptar algo.
//   5. Bitácora: qué pasó, aunque no esté implementado.
//
// Regla que la UI hace visible: **nada finge sincronizar**. Los seis
// proveedores aparecen siempre, cada uno con la nota de qué le falta, y el
// botón de sincronizar existe aunque hoy responda "el adaptador no existe".
// Esconderlo dejaría al dueño creyendo que guardó mal las credenciales.
// ============================================================

import { useCallback, useEffect, useState, type ReactNode } from "react"
import Link from "next/link"
import {
  disconnectPosConnectionAction,
  getFoodosPanelData,
  getPosData,
  rotatePosWebhookSecretAction,
  runPosMenuSyncAction,
  savePosConnectionAction,
  testPosConnectionAction,
  type PosData,
} from "../actions"
import StatCard from "@/components/panel/StatCard"
import ToolPreviewNotice from "@/components/panel/foodos/tool-preview-notice"
import { useTierGuard } from "@/hooks/use-tier-guard"
import ToolGuideHost from "@/components/panel/guide/tool-guide-host"
import { t } from "@/lib/i18n/es"
import type { FoodosRestaurant } from "@/types/foodos"
import {
  EMPTY_POS_KPIS,
  type PosConnectionHealth,
  type PosConnectionStatus,
  type PosConnectionView,
  type PosKpis,
  type PosSyncEntry,
} from "@/lib/pos/registry"
import {
  Check,
  CircleAlert,
  CircleCheck,
  Copy,
  ExternalLink,
  FileText,
  KeyRound,
  Loader2,
  Plug,
  RefreshCw,
  RotateCw,
  Server,
  ShoppingCart,
  Unplug,
  Webhook,
} from "lucide-react"

const EMPTY_DATA: PosData = { connections: [], log: [], kpis: EMPTY_POS_KPIS }

function statusLabel(status: PosConnectionStatus): string {
  switch (status) {
    case "connected":
      return t("foodos.pos.statusConnected")
    case "error":
      return t("foodos.pos.statusError")
    default:
      return t("foodos.pos.statusDisconnected")
  }
}

function statusTone(status: PosConnectionStatus): string {
  switch (status) {
    case "connected":
      return "bg-emerald-50 text-emerald-700 border-emerald-200"
    case "error":
      return "bg-red-50 text-red-700 border-red-200"
    default:
      return "bg-gray-50 text-gray-600 border-gray-200"
  }
}

function healthLabel(health: PosConnectionHealth): string {
  switch (health) {
    case "ready":
      return t("foodos.pos.healthReady")
    case "needs_credentials":
      return t("foodos.pos.healthNeedsCredentials")
    case "error":
      return t("foodos.pos.healthError")
    default:
      return t("foodos.pos.healthPending")
  }
}

/** El estado visible manda: un adaptador sin implementar nunca está "listo". */
function healthTone(health: PosConnectionHealth): string {
  switch (health) {
    case "ready":
      return "bg-emerald-50 text-emerald-700 border-emerald-200"
    case "needs_credentials":
      return "bg-amber-50 text-amber-700 border-amber-200"
    case "error":
      return "bg-red-50 text-red-700 border-red-200"
    default:
      return "bg-slate-50 text-slate-600 border-slate-200"
  }
}

function kindLabel(kind: PosSyncEntry["kind"]): string {
  switch (kind) {
    case "order":
      return t("foodos.pos.logKindOrder")
    case "health":
      return t("foodos.pos.logKindHealth")
    default:
      return t("foodos.pos.logKindMenu")
  }
}

function logStatusLabel(status: PosSyncEntry["status"]): string {
  switch (status) {
    case "ok":
      return t("foodos.pos.logStatusOk")
    case "failed":
      return t("foodos.pos.logStatusFailed")
    default:
      return t("foodos.pos.logStatusSkipped")
  }
}

function when(value: string | null): string {
  if (!value) return t("foodos.pos.never")
  const ms = Date.parse(value)
  if (!Number.isFinite(ms)) return t("foodos.pos.never")
  return new Date(ms).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" })
}

export default function PosPage() {
  // `guard` y no `run`: esta página ya tiene un `run(key, task)` de estado de carga.
  const { run: guard, upsellDialog } = useTierGuard("pos_integraciones")

  const [restaurant, setRestaurant] = useState<FoodosRestaurant | null>(null)
  const [data, setData] = useState<PosData>(EMPTY_DATA)
  const [drafts, setDrafts] = useState<Record<string, Record<string, string>>>({})

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [secret, setSecret] = useState<{ provider: string; value: string } | null>(null)
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)

  const load = useCallback(async () => {
    try {
      const panel = await getFoodosPanelData()
      setRestaurant(panel.restaurant)
      if (!panel.restaurant) return
      setData((await getPosData(panel.restaurant.id)) ?? EMPTY_DATA)
    } catch (err) {
      setNotice({
        ok: false,
        text: err instanceof Error ? err.message : t("foodos.pos.actionError"),
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

  function draftFor(view: PosConnectionView): Record<string, string> {
    return drafts[view.descriptor.provider] ?? {}
  }

  function setField(provider: string, key: string, value: string) {
    setDrafts((current) => ({ ...current, [provider]: { ...current[provider], [key]: value } }))
  }

  async function copy(value: string, key: string) {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(key)
      window.setTimeout(() => setCopied((current) => (current === key ? null : current)), 2000)
    } catch {
      setNotice({ ok: false, text: t("foodos.pos.actionError") })
    }
  }

  async function run(key: string, task: () => Promise<void>) {
    setBusy(key)
    setNotice(null)
    try {
      await task()
    } catch (err) {
      setNotice({
        ok: false,
        text: err instanceof Error ? err.message : t("foodos.pos.actionError"),
      })
    } finally {
      setBusy(null)
    }
  }

  function save(view: PosConnectionView) {
    if (!restaurant) return
    const values = draftFor(view)
    const credentials: Record<string, string> = {}
    for (const field of view.descriptor.credentials) {
      const value = (values[field.key] ?? "").trim()
      if (value) credentials[field.key] = value
    }
    return run(`save:${view.descriptor.provider}`, async () => {
      const attempt = await guard(() =>
        savePosConnectionAction({
          restaurant_id: restaurant.id,
          provider: view.descriptor.provider,
          credentials,
        })
      )
      if (!attempt.ran) return
      const result = attempt.value
      if (!result.ok) throw new Error(result.error ?? t("foodos.pos.actionError"))
      setNotice({ ok: true, text: t("foodos.pos.saved") })
      setDrafts((current) => ({ ...current, [view.descriptor.provider]: {} }))
      await load()
    })
  }

  function test(view: PosConnectionView) {
    if (!restaurant) return
    return run(`test:${view.descriptor.provider}`, async () => {
      const attempt = await guard(() =>
        testPosConnectionAction({
          restaurant_id: restaurant.id,
          provider: view.descriptor.provider,
        })
      )
      if (!attempt.ran) return
      const result = attempt.value
      setNotice({ ok: result.ok, text: result.message })
      await load()
    })
  }

  function sync(view: PosConnectionView) {
    if (!restaurant) return
    return run(`sync:${view.descriptor.provider}`, async () => {
      const attempt = await guard(() =>
        runPosMenuSyncAction({
          restaurant_id: restaurant.id,
          provider: view.descriptor.provider,
        })
      )
      if (!attempt.ran) return
      const result = attempt.value
      if (result.skipped) {
        setNotice({ ok: false, text: t("foodos.pos.syncSkipped") })
      } else if (!result.ok) {
        throw new Error(result.error ?? t("foodos.pos.actionError"))
      } else {
        setNotice({
          ok: true,
          text: t("foodos.pos.syncResult", {
            created: result.created,
            updated: result.updated,
            unchanged: result.unchanged,
            onlyLocally: result.onlyLocally,
          }),
        })
      }
      await load()
    })
  }

  function disconnect(view: PosConnectionView) {
    if (!restaurant) return
    if (!window.confirm(t("foodos.pos.disconnectConfirm"))) return
    return run(`disconnect:${view.descriptor.provider}`, async () => {
      const attempt = await guard(() =>
        disconnectPosConnectionAction({
          restaurant_id: restaurant.id,
          provider: view.descriptor.provider,
        })
      )
      if (!attempt.ran) return
      const result = attempt.value
      if (!result.ok) throw new Error(result.error ?? t("foodos.pos.actionError"))
      await load()
    })
  }

  function rotate(view: PosConnectionView) {
    if (!restaurant) return
    if (!window.confirm(t("foodos.pos.rotateConfirm"))) return
    return run(`rotate:${view.descriptor.provider}`, async () => {
      const attempt = await guard(() =>
        rotatePosWebhookSecretAction({
          restaurant_id: restaurant.id,
          provider: view.descriptor.provider,
        })
      )
      if (!attempt.ran) return
      const result = attempt.value
      if (!result.ok) throw new Error(result.error ?? t("foodos.pos.actionError"))
      if (result.secret) {
        setSecret({ provider: view.descriptor.provider, value: result.secret })
      }
      await load()
    })
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
          <Server className="w-12 h-12 text-gray-300 mx-auto mb-3" aria-hidden />
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

  const kpis: PosKpis = data.kpis

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

      <ToolPreviewNotice feature="pos_integraciones" />

      {notice && (
        <div
          className={`rounded-xl px-4 py-3 text-sm border ${
            notice.ok
              ? "bg-emerald-50 border-emerald-200 text-emerald-700"
              : "bg-amber-50 border-amber-200 text-amber-800"
          }`}
          role="status"
          aria-live="polite"
        >
          {notice.text}
        </div>
      )}

      {secret && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4" role="status">
          <p className="text-sm font-semibold text-amber-900">{t("foodos.pos.secretRotated")}</p>
          <p className="mt-1 text-xs text-amber-800">{t("foodos.pos.secretHint")}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-lg bg-white px-3 py-2 text-xs text-gray-800 border border-amber-200">
              {secret.value}
            </code>
            <button
              type="button"
              onClick={() => copy(secret.value, `secret:${secret.provider}`)}
              className="touch-target inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-amber-900 hover:bg-amber-100"
            >
              {copied === `secret:${secret.provider}` ? (
                <Check className="w-3.5 h-3.5" aria-hidden />
              ) : (
                <Copy className="w-3.5 h-3.5" aria-hidden />
              )}
              {copied === `secret:${secret.provider}`
                ? t("foodos.pos.copied")
                : t("foodos.pos.copy")}
            </button>
          </div>
        </div>
      )}

      {/* ── KPIs ───────────────────────────────────────────── */}
      <section>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label={t("foodos.pos.kpiTotal")} value={kpis.total} icon={Server} />
          <StatCard
            label={t("foodos.pos.kpiReady")}
            value={kpis.ready}
            icon={CircleCheck}
            tone="positive"
          />
          <StatCard label={t("foodos.pos.kpiPending")} value={kpis.pending} icon={Plug} />
          <StatCard
            label={t("foodos.pos.kpiFailed")}
            value={kpis.failedSyncs7d}
            icon={CircleAlert}
            tone={kpis.failedSyncs7d > 0 ? "danger" : "default"}
          />
        </div>
        <p className="mt-3 text-xs text-gray-500">
          {t("foodos.pos.lastSync")}: {when(kpis.lastSyncAt)}
        </p>
      </section>

      {/* ── El camino que ya funciona ──────────────────────── */}
      <section className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4">
        <div className="flex items-start gap-3">
          <FileText className="w-5 h-5 shrink-0 text-emerald-700" aria-hidden />
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-emerald-900">{t("foodos.pos.csvTitle")}</h2>
            <p className="mt-1 text-sm text-emerald-800">{t("foodos.pos.csvHint")}</p>
            <Link
              href="/panel/foodos/menu"
              className="touch-target mt-3 inline-flex items-center gap-1.5 rounded-xl bg-[#0E7A0E] px-3 py-2 text-xs font-semibold text-white hover:bg-[#0b610b]"
            >
              {t("foodos.pos.csvCta")}
              <ExternalLink className="w-3.5 h-3.5" aria-hidden />
            </Link>
          </div>
        </div>
      </section>

      {/* ── Proveedores ────────────────────────────────────── */}
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">{t("foodos.pos.providersTitle")}</h2>
          <p className="mt-1 text-sm text-gray-500">{t("foodos.pos.providersHint")}</p>
        </div>

        <ul className="space-y-3">
          {data.connections.map((view) => {
            const provider = view.descriptor.provider
            const values = draftFor(view)
            const saving = busy === `save:${provider}`
            const testing = busy === `test:${provider}`
            const syncing = busy === `sync:${provider}`
            const disconnecting = busy === `disconnect:${provider}`
            const rotating = busy === `rotate:${provider}`
            const anyBusy = saving || testing || syncing || disconnecting || rotating
            const capabilities = [
              { key: "menu", label: t("foodos.pos.capMenu"), on: view.descriptor.capabilities.menu },
              { key: "orders", label: t("foodos.pos.capOrders"), on: view.descriptor.capabilities.orders },
              { key: "webhook", label: t("foodos.pos.capWebhook"), on: view.descriptor.capabilities.webhook },
            ]

            return (
              <li key={provider} className="bg-white rounded-2xl border border-gray-100 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold text-gray-900">
                      {view.descriptor.label}
                    </h3>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${statusTone(view.status)}`}
                      >
                        {statusLabel(view.status)}
                      </span>
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${healthTone(view.health)}`}
                      >
                        {healthLabel(view.health)}
                      </span>
                    </div>
                  </div>
                  <a
                    href={view.descriptor.docsUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="touch-target inline-flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                  >
                    <ExternalLink className="w-3.5 h-3.5" aria-hidden />
                    {t("foodos.pos.docs")}
                  </a>
                </div>

                {/* Qué le falta: se dice antes que cualquier botón. */}
                <div className="mt-3 rounded-xl bg-slate-50 border border-slate-100 p-3">
                  <p className="text-xs font-semibold text-slate-700">
                    {t("foodos.pos.pendingNoteTitle")}
                  </p>
                  <p className="mt-1 text-sm text-slate-700">{view.descriptor.pendingNote}</p>
                </div>

                <div className="mt-3">
                  <p className="text-xs font-semibold text-gray-600">
                    {t("foodos.pos.capabilitiesTitle")}
                  </p>
                  <ul className="mt-1.5 flex flex-wrap gap-1.5">
                    {capabilities.map((cap) => (
                      <li
                        key={cap.key}
                        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${
                          cap.on
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border-gray-200 bg-gray-50 text-gray-500"
                        }`}
                      >
                        {cap.on ? (
                          <Check className="w-3 h-3" aria-hidden />
                        ) : (
                          <CircleAlert className="w-3 h-3" aria-hidden />
                        )}
                        {cap.label}: {cap.on ? t("foodos.pos.capYes") : t("foodos.pos.capNo")}
                      </li>
                    ))}
                  </ul>
                </div>

                {view.missingFields.length > 0 && (
                  <p className="mt-3 text-xs text-amber-700">
                    {t("foodos.pos.missingFields", { fields: view.missingFields.join(", ") })}
                  </p>
                )}

                {view.lastError ? (
                  <p className="mt-2 text-xs text-red-700">{view.lastError}</p>
                ) : null}

                {/* Credenciales */}
                <div className="mt-4 border-t border-gray-100 pt-4">
                  <div className="flex items-center gap-2">
                    <KeyRound className="w-4 h-4 text-gray-400" aria-hidden />
                    <h4 className="text-sm font-semibold text-gray-800">
                      {t("foodos.pos.credentialsTitle")}
                    </h4>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">{t("foodos.pos.credentialsHint")}</p>

                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {view.descriptor.credentials.map((field) => (
                      <Field key={field.key} label={field.label} hint={field.hint}>
                        <input
                          type={field.secret ? "password" : "text"}
                          value={values[field.key] ?? ""}
                          onChange={(event) => setField(provider, field.key, event.target.value)}
                          placeholder={view.credentials[field.key] ?? ""}
                          autoComplete="off"
                          className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-[#0E7A0E] focus:outline-none"
                        />
                      </Field>
                    ))}
                  </div>

                  {Object.keys(view.credentials).length === 0 ? (
                    <p className="mt-2 text-xs text-gray-400">
                      {t("foodos.pos.credentialsEmpty")}
                    </p>
                  ) : null}

                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => save(view)}
                      disabled={anyBusy}
                      className="touch-target inline-flex items-center gap-1.5 rounded-xl bg-[#0E7A0E] px-3 py-2 text-xs font-semibold text-white hover:bg-[#0b610b] disabled:opacity-60"
                    >
                      {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> : null}
                      {t("foodos.pos.save")}
                    </button>

                    <button
                      type="button"
                      onClick={() => test(view)}
                      disabled={anyBusy}
                      className="touch-target inline-flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                    >
                      {testing ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
                      ) : (
                        <Plug className="w-3.5 h-3.5" aria-hidden />
                      )}
                      {testing ? t("foodos.pos.testing") : t("foodos.pos.test")}
                    </button>

                    {view.descriptor.capabilities.menu ? (
                      <button
                        type="button"
                        onClick={() => sync(view)}
                        disabled={anyBusy}
                        className="touch-target inline-flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                      >
                        {syncing ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
                        ) : (
                          <RefreshCw className="w-3.5 h-3.5" aria-hidden />
                        )}
                        {syncing ? t("foodos.pos.syncing") : t("foodos.pos.syncMenu")}
                      </button>
                    ) : null}

                    {view.descriptor.capabilities.webhook ? (
                      <button
                        type="button"
                        onClick={() => rotate(view)}
                        disabled={anyBusy}
                        className="touch-target inline-flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                      >
                        {rotating ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
                        ) : (
                          <RotateCw className="w-3.5 h-3.5" aria-hidden />
                        )}
                        {t("foodos.pos.rotateSecret")}
                      </button>
                    ) : null}

                    {view.status !== "disconnected" ? (
                      <button
                        type="button"
                        onClick={() => disconnect(view)}
                        disabled={anyBusy}
                        className="touch-target inline-flex items-center gap-1.5 rounded-xl border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
                      >
                        {disconnecting ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
                        ) : (
                          <Unplug className="w-3.5 h-3.5" aria-hidden />
                        )}
                        {t("foodos.pos.disconnect")}
                      </button>
                    ) : null}
                  </div>

                  <p className="mt-3 text-xs text-gray-500">
                    {t("foodos.pos.lastSync")}: {when(view.lastSyncAt)}
                  </p>
                </div>

                {/* Webhook */}
                {view.descriptor.capabilities.webhook ? (
                  <div className="mt-4 border-t border-gray-100 pt-4">
                    <div className="flex items-center gap-2">
                      <Webhook className="w-4 h-4 text-gray-400" aria-hidden />
                      <h4 className="text-sm font-semibold text-gray-800">
                        {t("foodos.pos.webhookTitle")}
                      </h4>
                    </div>
                    {view.webhookUrl ? (
                      <>
                        <p className="mt-1 text-xs text-gray-500">
                          {t("foodos.pos.webhookHint")}
                        </p>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <code className="min-w-0 flex-1 truncate rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-800 border border-gray-200">
                            {view.webhookUrl}
                          </code>
                          <button
                            type="button"
                            onClick={() => copy(view.webhookUrl ?? "", `hook:${provider}`)}
                            className="touch-target inline-flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                          >
                            {copied === `hook:${provider}` ? (
                              <Check className="w-3.5 h-3.5" aria-hidden />
                            ) : (
                              <Copy className="w-3.5 h-3.5" aria-hidden />
                            )}
                            {copied === `hook:${provider}`
                              ? t("foodos.pos.copied")
                              : t("foodos.pos.copy")}
                          </button>
                        </div>
                      </>
                    ) : (
                      <p className="mt-1 text-sm text-gray-500">
                        {t("foodos.pos.webhookUnavailable")}
                      </p>
                    )}
                  </div>
                ) : null}
              </li>
            )
          })}
        </ul>
      </section>

      {/* ── Bitácora ───────────────────────────────────────── */}
      <section className="bg-white rounded-2xl border border-gray-100 p-4">
        <h2 className="text-lg font-semibold text-gray-900">{t("foodos.pos.logTitle")}</h2>
        {data.log.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">{t("foodos.pos.logEmpty")}</p>
        ) : (
          <ul className="mt-3 divide-y divide-gray-100">
            {data.log.map((entry) => (
              <li key={entry.id} className="flex items-start gap-3 py-3">
                {entry.status === "ok" ? (
                  <CircleCheck className="w-4 h-4 mt-0.5 shrink-0 text-emerald-600" aria-hidden />
                ) : entry.status === "failed" ? (
                  <CircleAlert className="w-4 h-4 mt-0.5 shrink-0 text-red-600" aria-hidden />
                ) : (
                  <ShoppingCart className="w-4 h-4 mt-0.5 shrink-0 text-slate-400" aria-hidden />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-gray-900">
                    <span className="font-medium">{kindLabel(entry.kind)}</span>
                    {" · "}
                    <span className="text-gray-500">{logStatusLabel(entry.status)}</span>
                    {entry.itemsCount > 0 ? (
                      <span className="text-gray-500"> · {entry.itemsCount}</span>
                    ) : null}
                  </p>
                  {entry.detail ? (
                    <p className="mt-0.5 text-xs text-gray-500">{entry.detail}</p>
                  ) : null}
                  <p className="mt-0.5 text-xs text-gray-400">{when(entry.createdAt)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ToolGuideHost
        toolKey="pos"
        pathname="/panel/foodos/pos"
        slug={restaurant.slug}
        icon="🖥️"
        title={t("foodos.pos.title")}
        subtitle={t("foodos.pos.guideSubtitle")}
      />

      {upsellDialog}
    </div>
  )
}

function Header() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">{t("foodos.pos.title")}</h1>
      <p className="text-sm text-gray-500 mt-1">{t("foodos.pos.subtitle")}</p>
    </div>
  )
}

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-semibold text-gray-600">{label}</span>
      {children}
      {hint ? <span className="block text-xs text-gray-400">{hint}</span> : null}
    </label>
  )
}
