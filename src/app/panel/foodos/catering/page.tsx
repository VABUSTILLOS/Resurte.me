"use client"

// ============================================================
// Catering por volumen — vender eventos sin negociar por WhatsApp.
//
// Cuatro bloques:
//   1. KPIs: cuántas solicitudes hay, cuánto está comprometido y cuándo es
//      el próximo evento. Es la información que el dueño necesita hoy.
//   2. Paquetes: precio por persona, mínimos, anticipación y qué incluye.
//   3. Solicitudes: la lista con el total ya cotizado y los botones que la
//      propia máquina de estados autoriza.
//   4. Ajuste de total, solo para acuerdos autorizados.
//
// Regla que la UI respeta: **los botones no se inventan aquí**. Cada uno sale
// de `planCateringTransition`, la misma función pura que valida el servidor.
// Si la UI ofreciera "confirmar" sobre algo cancelado, el servidor lo
// rechazaría y el dueño creería que la app está rota.
// ============================================================

import { useCallback, useEffect, useState, type ReactNode } from "react"
import Link from "next/link"
import {
  deleteCateringPackageAction,
  getCateringData,
  getFoodosPanelData,
  overrideCateringTotalAction,
  saveCateringPackageAction,
  setCateringRequestStatusAction,
  type CateringData,
} from "../actions"
import StatCard from "@/components/panel/StatCard"
import ToolPreviewNotice from "@/components/panel/foodos/tool-preview-notice"
import { useTierGuard } from "@/hooks/use-tier-guard"
import ToolGuideHost from "@/components/panel/guide/tool-guide-host"
import { t } from "@/lib/i18n/es"
import { formatMoney } from "@/lib/foodos"
import type { FoodosRestaurant } from "@/types/foodos"
import {
  CATERING_STATUSES,
  DEFAULT_LEAD_TIME_HOURS,
  DEFAULT_MIN_PEOPLE,
  EMPTY_CATERING_KPIS,
  isCateringTerminal,
  planCateringTransition,
  type CateringKpis,
  type CateringPackage,
  type CateringStatus,
} from "@/lib/foodos-catering"
import type { CateringRequestRow as CateringRow } from "@/lib/foodos-catering-data"
import {
  CalendarCheck,
  CalendarDays,
  CalendarHeart,
  Check,
  CircleAlert,
  CircleCheck,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  Users,
  UtensilsCrossed,
  X,
} from "lucide-react"

const EMPTY_DATA: CateringData = {
  packages: [],
  requests: [],
  kpis: EMPTY_CATERING_KPIS,
}

/** Una fila de solicitud, tal como la devuelve la capa de datos. */
type RequestRow = CateringRow & { status: CateringStatus }

interface PackageDraft {
  id: string | null
  name: string
  description: string
  pricePerPerson: string
  minPeople: string
  maxPeople: string
  leadTimeHours: string
  includes: string
  isActive: boolean
}

function emptyDraft(): PackageDraft {
  return {
    id: null,
    name: "",
    description: "",
    pricePerPerson: "",
    minPeople: String(DEFAULT_MIN_PEOPLE),
    maxPeople: "",
    leadTimeHours: String(DEFAULT_LEAD_TIME_HOURS),
    includes: "",
    isActive: true,
  }
}

function draftFrom(pkg: CateringPackage): PackageDraft {
  return {
    id: pkg.id,
    name: pkg.name,
    description: pkg.description ?? "",
    pricePerPerson: String(pkg.pricePerPerson),
    minPeople: String(pkg.minPeople),
    maxPeople: pkg.maxPeople === null ? "" : String(pkg.maxPeople),
    leadTimeHours: String(pkg.leadTimeHours),
    includes: pkg.includes.join("\n"),
    isActive: pkg.isActive,
  }
}

function statusLabel(status: CateringStatus): string {
  switch (status) {
    case "requested":
      return t("foodos.catering.statusRequested")
    case "quoted":
      return t("foodos.catering.statusQuoted")
    case "confirmed":
      return t("foodos.catering.statusConfirmed")
    case "declined":
      return t("foodos.catering.statusDeclined")
    case "cancelled":
      return t("foodos.catering.statusCancelled")
    default:
      return t("foodos.catering.statusCompleted")
  }
}

function statusTone(status: CateringStatus): string {
  switch (status) {
    case "confirmed":
      return "bg-emerald-50 text-emerald-700 border-emerald-200"
    case "completed":
      return "bg-slate-50 text-slate-600 border-slate-200"
    case "declined":
    case "cancelled":
      return "bg-red-50 text-red-700 border-red-200"
    case "quoted":
      return "bg-blue-50 text-blue-700 border-blue-200"
    default:
      return "bg-amber-50 text-amber-700 border-amber-200"
  }
}

/** `YYYY-MM-DD` sin corrimiento de zona: partir la cadena evita el UTC-6. */
function dayLabel(value: string | null): string {
  if (!value) return t("foodos.catering.noTotal")
  const parts = value.slice(0, 10).split("-")
  if (parts.length !== 3) return value
  const [year, month, day] = parts
  const date = new Date(Number(year), Number(month) - 1, Number(day))
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString("es-MX", { dateStyle: "long" })
}

function when(value: string | null): string {
  if (!value) return "—"
  const ms = Date.parse(value)
  if (!Number.isFinite(ms)) return "—"
  return new Date(ms).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" })
}

function optionalNumber(value: string): number | null {
  const trimmed = value.trim()
  if (trimmed === "") return null
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}

export default function CateringPage() {
  // `guard` y no `run`: esta página ya tiene un `run(key, task)` de estado de carga.
  const { run: guard, upsellDialog } = useTierGuard("catering")

  const [restaurant, setRestaurant] = useState<FoodosRestaurant | null>(null)
  const [data, setData] = useState<CateringData>(EMPTY_DATA)
  const [draft, setDraft] = useState<PackageDraft | null>(null)
  const [override, setOverride] = useState<{
    id: string
    total: string
    deposit: string
  } | null>(null)

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)

  const load = useCallback(async () => {
    try {
      const panel = await getFoodosPanelData()
      setRestaurant(panel.restaurant)
      if (!panel.restaurant) return
      setData((await getCateringData(panel.restaurant.id)) ?? EMPTY_DATA)
    } catch (err) {
      setNotice({
        ok: false,
        text: err instanceof Error ? err.message : t("foodos.catering.actionError"),
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

  async function run(key: string, task: () => Promise<void>) {
    setBusy(key)
    setNotice(null)
    try {
      await task()
    } catch (err) {
      setNotice({
        ok: false,
        text: err instanceof Error ? err.message : t("foodos.catering.actionError"),
      })
    } finally {
      setBusy(null)
    }
  }

  function patch(next: Partial<PackageDraft>) {
    setDraft((current) => (current ? { ...current, ...next } : current))
  }

  function savePackage() {
    if (!restaurant || !draft) return
    const pricePerPerson = optionalNumber(draft.pricePerPerson)
    const minPeople = optionalNumber(draft.minPeople)
    if (pricePerPerson === null || minPeople === null) {
      setNotice({ ok: false, text: t("foodos.catering.formError") })
      return
    }
    const includes = draft.includes
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line !== "")

    return run("save-package", async () => {
      const attempt = await guard(() =>
        saveCateringPackageAction({
          restaurant_id: restaurant.id,
          package_id: draft.id,
          name: draft.name.trim(),
          description: draft.description.trim() === "" ? null : draft.description.trim(),
          price_per_person: pricePerPerson,
          min_people: minPeople,
          max_people: optionalNumber(draft.maxPeople),
          lead_time_hours: optionalNumber(draft.leadTimeHours),
          includes,
          is_active: draft.isActive,
        })
      )
      if (!attempt.ran) return
      const result = attempt.value
      if (!result.ok) throw new Error(result.error ?? t("foodos.catering.formError"))
      setNotice({ ok: true, text: t("foodos.catering.packageSaved") })
      setDraft(null)
      await load()
    })
  }

  function removePackage(pkg: CateringPackage) {
    if (!restaurant) return
    if (!window.confirm(t("foodos.catering.deleteConfirm"))) return
    return run(`delete:${pkg.id}`, async () => {
      const attempt = await guard(() =>
        deleteCateringPackageAction({
          restaurant_id: restaurant.id,
          package_id: pkg.id,
        })
      )
      if (!attempt.ran) return
      const result = attempt.value
      if (!result.ok) throw new Error(result.error ?? t("foodos.catering.actionError"))
      setNotice({ ok: true, text: t("foodos.catering.packageDeleted") })
      await load()
    })
  }

  function moveStatus(request: RequestRow, next: CateringStatus) {
    if (!restaurant) return
    return run(`status:${request.id}:${next}`, async () => {
      const attempt = await guard(() =>
        setCateringRequestStatusAction({
          restaurant_id: restaurant.id,
          request_id: request.id,
          status: next,
        })
      )
      if (!attempt.ran) return
      const result = attempt.value
      if (!result.ok) throw new Error(result.error ?? t("foodos.catering.actionError"))
      setNotice({ ok: true, text: t("foodos.catering.requestCancelled") })
      await load()
    })
  }

  function saveOverride(request: RequestRow) {
    if (!restaurant || !override) return
    const total = optionalNumber(override.total)
    if (total === null) {
      setNotice({ ok: false, text: t("foodos.catering.formError") })
      return
    }
    return run(`override:${request.id}`, async () => {
      const attempt = await guard(() =>
        overrideCateringTotalAction({
          restaurant_id: restaurant.id,
          request_id: request.id,
          total,
          deposit: optionalNumber(override.deposit),
        })
      )
      if (!attempt.ran) return
      const result = attempt.value
      if (!result.ok) throw new Error(result.error ?? t("foodos.catering.actionError"))
      setNotice({ ok: true, text: t("foodos.catering.overrideSaved") })
      setOverride(null)
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
          <UtensilsCrossed className="w-12 h-12 text-gray-300 mx-auto mb-3" aria-hidden />
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

  const kpis: CateringKpis = data.kpis

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

      <ToolPreviewNotice feature="catering" />

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

      {/* ── KPIs ───────────────────────────────────────────── */}
      <section>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          <StatCard label={t("foodos.catering.kpiTotal")} value={kpis.total} icon={UtensilsCrossed} />
          <StatCard label={t("foodos.catering.kpiQuoted")} value={kpis.quoted} icon={Pencil} />
          <StatCard
            label={t("foodos.catering.kpiConfirmed")}
            value={kpis.confirmed}
            icon={CircleCheck}
            tone="positive"
          />
          <StatCard
            label={t("foodos.catering.kpiUpcoming")}
            value={kpis.upcoming7d}
            icon={CalendarDays}
          />
          <StatCard
            label={t("foodos.catering.kpiHeadcount")}
            value={kpis.confirmedHeadcount}
            icon={Users}
          />
          <StatCard
            label={t("foodos.catering.kpiRevenue")}
            value={formatMoney(kpis.confirmedRevenue)}
            icon={CalendarHeart}
            tone="positive"
          />
        </div>
        <p className="mt-3 text-xs text-gray-500">
          {t("foodos.catering.kpiNextEvent")}: {dayLabel(kpis.nextEventDate)}
        </p>
      </section>

      {/* ── Paquetes ───────────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              {t("foodos.catering.packagesTitle")}
            </h2>
            <p className="mt-1 text-sm text-gray-500">{t("foodos.catering.packagesHint")}</p>
          </div>
          {!draft ? (
            <button
              type="button"
              onClick={() => setDraft(emptyDraft())}
              className="touch-target inline-flex items-center gap-1.5 rounded-xl bg-[#0E7A0E] px-3 py-2 text-xs font-semibold text-white hover:bg-[#0b610b]"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden />
              {t("foodos.catering.newPackage")}
            </button>
          ) : null}
        </div>

        {draft ? (
          <div className="bg-white rounded-2xl border border-[#0E7A0E]/30 p-4">
            <h3 className="text-sm font-semibold text-gray-900">
              {draft.id ? t("foodos.catering.editPackage") : t("foodos.catering.newPackage")}
            </h3>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label={t("foodos.catering.fieldName")}>
                <input
                  type="text"
                  value={draft.name}
                  onChange={(event) => patch({ name: event.target.value })}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-[#0E7A0E] focus:outline-none"
                />
              </Field>

              <Field label={t("foodos.catering.fieldPrice")}>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={draft.pricePerPerson}
                  onChange={(event) => patch({ pricePerPerson: event.target.value })}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-[#0E7A0E] focus:outline-none"
                />
              </Field>

              <Field label={t("foodos.catering.fieldMin")}>
                <input
                  type="number"
                  min="1"
                  step="1"
                  inputMode="numeric"
                  value={draft.minPeople}
                  onChange={(event) => patch({ minPeople: event.target.value })}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-[#0E7A0E] focus:outline-none"
                />
              </Field>

              <Field label={t("foodos.catering.fieldMax")} hint={t("foodos.catering.unlimited")}>
                <input
                  type="number"
                  min="1"
                  step="1"
                  inputMode="numeric"
                  value={draft.maxPeople}
                  onChange={(event) => patch({ maxPeople: event.target.value })}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-[#0E7A0E] focus:outline-none"
                />
              </Field>

              <Field label={t("foodos.catering.fieldLead")}>
                <input
                  type="number"
                  min="0"
                  step="1"
                  inputMode="numeric"
                  value={draft.leadTimeHours}
                  onChange={(event) => patch({ leadTimeHours: event.target.value })}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-[#0E7A0E] focus:outline-none"
                />
              </Field>

              <Field label={t("foodos.catering.fieldActive")} hint={t("foodos.catering.fieldActiveHint")}>
                <label className="flex items-center gap-2 py-2">
                  <input
                    type="checkbox"
                    checked={draft.isActive}
                    onChange={(event) => patch({ isActive: event.target.checked })}
                    className="h-4 w-4 rounded border-gray-300 text-[#0E7A0E] focus:ring-[#0E7A0E]"
                  />
                  <span className="text-sm text-gray-700">{t("foodos.catering.fieldActive")}</span>
                </label>
              </Field>
            </div>

            <div className="mt-3 space-y-3">
              <Field label={t("foodos.catering.fieldDescription")}>
                <textarea
                  rows={2}
                  value={draft.description}
                  onChange={(event) => patch({ description: event.target.value })}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-[#0E7A0E] focus:outline-none"
                />
              </Field>

              <Field
                label={t("foodos.catering.fieldIncludes")}
                hint={t("foodos.catering.fieldIncludesHint")}
              >
                <textarea
                  rows={3}
                  value={draft.includes}
                  onChange={(event) => patch({ includes: event.target.value })}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-[#0E7A0E] focus:outline-none"
                />
              </Field>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={savePackage}
                disabled={busy === "save-package"}
                className="touch-target inline-flex items-center gap-1.5 rounded-xl bg-[#0E7A0E] px-3 py-2 text-xs font-semibold text-white hover:bg-[#0b610b] disabled:opacity-60"
              >
                {busy === "save-package" ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
                ) : null}
                {busy === "save-package"
                  ? t("foodos.catering.saving")
                  : t("foodos.catering.savePackage")}
              </button>
              <button
                type="button"
                onClick={() => setDraft(null)}
                className="touch-target inline-flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
              >
                <X className="w-3.5 h-3.5" aria-hidden />
                {t("foodos.catering.cancelEdit")}
              </button>
            </div>
          </div>
        ) : null}

        {data.packages.length === 0 && !draft ? (
          <p className="text-sm text-gray-500">{t("foodos.catering.noPackages")}</p>
        ) : (
          <ul className="space-y-3">
            {data.packages.map((pkg) => {
              const range =
                pkg.maxPeople === null
                  ? `${pkg.minPeople}+`
                  : `${pkg.minPeople}–${pkg.maxPeople}`
              return (
                <li key={pkg.id} className="bg-white rounded-2xl border border-gray-100 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-semibold text-gray-900">{pkg.name}</h3>
                        {!pkg.isActive ? (
                          <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs text-gray-500">
                            {t("foodos.catering.inactive")}
                          </span>
                        ) : null}
                      </div>
                      {pkg.description ? (
                        <p className="mt-1 text-sm text-gray-600">{pkg.description}</p>
                      ) : null}
                      <p className="mt-1 text-sm text-gray-700">
                        <span className="font-semibold">
                          {formatMoney(pkg.pricePerPerson)}
                        </span>{" "}
                        · {range} {t("foodos.catering.headcount").toLowerCase()}
                      </p>
                      <p className="mt-0.5 text-xs text-gray-500">
                        {t("foodos.catering.leadTimeNote", { hours: pkg.leadTimeHours })}
                      </p>
                      {pkg.includes.length > 0 ? (
                        <ul className="mt-2 space-y-0.5">
                          {pkg.includes.map((line) => (
                            <li key={line} className="flex items-start gap-1.5 text-xs text-gray-600">
                              <Check className="w-3 h-3 mt-0.5 shrink-0 text-emerald-600" aria-hidden />
                              {line}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setDraft(draftFrom(pkg))}
                        className="touch-target inline-flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                      >
                        <Pencil className="w-3.5 h-3.5" aria-hidden />
                        {t("foodos.catering.editPackage")}
                      </button>
                      <button
                        type="button"
                        onClick={() => removePackage(pkg)}
                        disabled={busy === `delete:${pkg.id}`}
                        className="touch-target inline-flex items-center gap-1.5 rounded-xl border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
                      >
                        {busy === `delete:${pkg.id}` ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5" aria-hidden />
                        )}
                        {t("foodos.catering.deletePackage")}
                      </button>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {/* ── Solicitudes ────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-gray-900">
          {t("foodos.catering.requestsTitle")}
        </h2>

        {data.requests.length === 0 ? (
          <p className="text-sm text-gray-500">{t("foodos.catering.requestsEmpty")}</p>
        ) : (
          <ul className="space-y-3">
            {data.requests.map((request) => {
              const row = request as RequestRow
              const terminal = isCateringTerminal(row.status)
              const actions = CATERING_STATUSES.map((candidate) => ({
                candidate,
                plan: planCateringTransition(row.status, candidate),
              })).filter((entry) => entry.plan.action !== "ignore")
              const editing = override?.id === row.id

              return (
                <li key={row.id} className="bg-white rounded-2xl border border-gray-100 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-semibold text-gray-900">
                          {row.customerName}
                        </h3>
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${statusTone(row.status)}`}
                        >
                          {statusLabel(row.status)}
                        </span>
                        {terminal ? (
                          <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-600">
                            {t("foodos.catering.terminal")}
                          </span>
                        ) : null}
                      </div>

                      <dl className="mt-2 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
                        <div className="flex gap-1.5">
                          <dt className="text-gray-500">{t("foodos.catering.eventDate")}:</dt>
                          <dd className="text-gray-900">{dayLabel(row.eventDate)}</dd>
                        </div>
                        <div className="flex gap-1.5">
                          <dt className="text-gray-500">{t("foodos.catering.headcount")}:</dt>
                          <dd className="text-gray-900">{row.headcount}</dd>
                        </div>
                        <div className="flex gap-1.5">
                          <dt className="text-gray-500">{t("foodos.catering.total")}:</dt>
                          <dd className="text-gray-900">
                            {row.total === null
                              ? t("foodos.catering.noTotal")
                              : formatMoney(row.total)}
                          </dd>
                        </div>
                        <div className="flex gap-1.5">
                          <dt className="text-gray-500">{t("foodos.catering.deposit")}:</dt>
                          <dd className="text-gray-900">
                            {row.depositAmount === null
                              ? t("foodos.catering.noDeposit")
                              : formatMoney(row.depositAmount)}
                          </dd>
                        </div>
                        <div className="flex gap-1.5">
                          <dt className="text-gray-500">{t("foodos.catering.contact")}:</dt>
                          <dd className="min-w-0 truncate text-gray-900">
                            {row.customerPhone}
                            {row.customerEmail ? ` · ${row.customerEmail}` : ""}
                          </dd>
                        </div>
                        <div className="flex gap-1.5">
                          <dt className="text-gray-500">{t("foodos.catering.packageLabel")}:</dt>
                          <dd className="text-gray-900">
                            {data.packages.find((pkg) => pkg.id === row.packageId)?.name ?? "—"}
                          </dd>
                        </div>
                      </dl>

                      {row.notes ? (
                        <p className="mt-2 text-xs text-gray-600">
                          <span className="text-gray-500">{t("foodos.catering.notes")}: </span>
                          {row.notes}
                        </p>
                      ) : null}

                      <p className="mt-1 text-xs text-gray-400">{when(row.createdAt)}</p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {actions.map(({ candidate, plan }) => {
                        const key = `status:${row.id}:${candidate}`
                        const label =
                          plan.action === "decline"
                            ? t("foodos.catering.decline")
                            : plan.action === "cancel"
                              ? t("foodos.catering.cancel")
                              : plan.action === "reopen"
                                ? t("foodos.catering.reopen")
                                : t("foodos.catering.advance", { status: statusLabel(candidate) })
                        const danger = plan.action === "decline" || plan.action === "cancel"
                        return (
                          <button
                            key={candidate}
                            type="button"
                            onClick={() => moveStatus(row, candidate)}
                            disabled={busy === key}
                            className={`touch-target inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold disabled:opacity-60 ${
                              danger
                                ? "border-red-200 text-red-700 hover:bg-red-50"
                                : "border-gray-200 text-gray-700 hover:bg-gray-50"
                            }`}
                          >
                            {busy === key ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
                            ) : danger ? (
                              <CircleAlert className="w-3.5 h-3.5" aria-hidden />
                            ) : (
                              <CalendarCheck className="w-3.5 h-3.5" aria-hidden />
                            )}
                            {label}
                          </button>
                        )
                      })}

                      <button
                        type="button"
                        onClick={() =>
                          setOverride(
                            editing
                              ? null
                              : {
                                  id: row.id,
                                  total: row.total === null ? "" : String(row.total),
                                  deposit:
                                    row.depositAmount === null ? "" : String(row.depositAmount),
                                }
                          )
                        }
                        className="touch-target inline-flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                      >
                        <Pencil className="w-3.5 h-3.5" aria-hidden />
                        {t("foodos.catering.overrideTitle")}
                      </button>
                    </div>
                  </div>

                  {editing && override ? (
                    <div className="mt-4 border-t border-gray-100 pt-4">
                      <p className="text-xs text-gray-500">{t("foodos.catering.overrideHint")}</p>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <Field label={t("foodos.catering.overrideTotal")}>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            inputMode="decimal"
                            value={override.total}
                            onChange={(event) =>
                              setOverride({ ...override, total: event.target.value })
                            }
                            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-[#0E7A0E] focus:outline-none"
                          />
                        </Field>
                        <Field label={t("foodos.catering.overrideDeposit")}>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            inputMode="decimal"
                            value={override.deposit}
                            onChange={(event) =>
                              setOverride({ ...override, deposit: event.target.value })
                            }
                            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-[#0E7A0E] focus:outline-none"
                          />
                        </Field>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => saveOverride(row)}
                          disabled={busy === `override:${row.id}`}
                          className="touch-target inline-flex items-center gap-1.5 rounded-xl bg-[#0E7A0E] px-3 py-2 text-xs font-semibold text-white hover:bg-[#0b610b] disabled:opacity-60"
                        >
                          {busy === `override:${row.id}` ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
                          ) : null}
                          {t("foodos.catering.overrideSave")}
                        </button>
                        <button
                          type="button"
                          onClick={() => setOverride(null)}
                          className="touch-target inline-flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                        >
                          <X className="w-3.5 h-3.5" aria-hidden />
                          {t("foodos.catering.cancelEdit")}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <ToolGuideHost
        toolKey="catering"
        pathname="/panel/foodos/catering"
        slug={restaurant.slug}
        icon="🍽️"
        title={t("foodos.catering.title")}
        subtitle={t("foodos.catering.guideSubtitle")}
      />

      {upsellDialog}
    </div>
  )
}

function Header() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">{t("foodos.catering.title")}</h1>
      <p className="text-sm text-gray-500 mt-1">{t("foodos.catering.subtitle")}</p>
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
