"use client"

// ============================================================
// Flotilla — reparto propio a domicilio.
//
// Tres bloques:
//   1. KPIs del día: entregas activas, sin asignar, entregadas y tiempos.
//   2. Entregas activas: asignar repartidor y avanzar el estado.
//   3. Configuración: repartidores y zonas de entrega.
//
// La tarifa de la zona la decide el SERVIDOR (`quoteDelivery`); aquí solo se
// configura. El repartidor no entra al panel: opera por enlace.
// ============================================================

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  advanceFlotillaDelivery,
  assignFlotillaCourier,
  autoAssignFlotillaDelivery,
  deleteFlotillaCourier,
  deleteFlotillaZone,
  dispatchFlotillaToProvider,
  ensureFlotillaCourierLink,
  getFlotillaStats,
  getFoodosPanelData,
  listFlotillaCouriers,
  listFlotillaDeliveries,
  listFlotillaZones,
  revokeFlotillaCourierLink,
  toggleFlotillaCourier,
  upsertFlotillaCourier,
  upsertFlotillaZone,
  type FlotillaCourierRow,
  type FlotillaDeliveryRow,
  type FlotillaStats,
  type FlotillaZoneRow,
} from "../actions"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import StatCard from "@/components/panel/StatCard"
import NivelGate from "@/components/panel/foodos/nivel-gate"
import { useEntitlements } from "@/components/panel/foodos/entitlements-context"
import ToolGuideHost from "@/components/panel/guide/tool-guide-host"
import { t } from "@/lib/i18n/es"
import { formatMoney } from "@/lib/foodos"
import type { FoodosBranch, FoodosRestaurant } from "@/types/foodos"
import {
  Bike,
  Car,
  Check,
  Copy,
  Footprints,
  Link2,
  Link2Off,
  Loader2,
  MapPin,
  Navigation,
  PackageCheck,
  Plus,
  RefreshCw,
  Route,
  Truck,
  Users,
  Wand2,
  X,
} from "lucide-react"

type Vehicle = "moto" | "bici" | "auto" | "a_pie"
type PayoutMode = "fixed" | "per_km" | "percent"

const VEHICLES: { id: Vehicle; label: string; icon: typeof Bike }[] = [
  { id: "moto", label: t("foodos.flotilla.vehicleMoto"), icon: Bike },
  { id: "bici", label: t("foodos.flotilla.vehicleBici"), icon: Bike },
  { id: "auto", label: t("foodos.flotilla.vehicleAuto"), icon: Car },
  { id: "a_pie", label: t("foodos.flotilla.vehicleAPie"), icon: Footprints },
]

const PAYOUT_MODES: { id: PayoutMode; label: string }[] = [
  { id: "fixed", label: t("foodos.flotilla.payoutFixed") },
  { id: "per_km", label: t("foodos.flotilla.payoutPerKm") },
  { id: "percent", label: t("foodos.flotilla.payoutPercent") },
]

const STATUS_STYLE: Record<FlotillaDeliveryRow["status"], string> = {
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  assigned: "bg-blue-50 text-blue-700 border-blue-200",
  picked_up: "bg-indigo-50 text-indigo-700 border-indigo-200",
  delivered: "bg-emerald-50 text-emerald-700 border-emerald-200",
  failed: "bg-red-50 text-red-700 border-red-200",
  cancelled: "bg-gray-100 text-gray-600 border-gray-200",
}

function statusLabel(status: FlotillaDeliveryRow["status"]): string {
  switch (status) {
    case "pending":
      return t("foodos.flotilla.statusPending")
    case "assigned":
      return t("foodos.flotilla.statusAssigned")
    case "picked_up":
      return t("foodos.flotilla.statusPickedUp")
    case "delivered":
      return t("foodos.flotilla.statusDelivered")
    case "failed":
      return t("foodos.flotilla.statusFailed")
    default:
      return t("foodos.flotilla.statusCancelled")
  }
}

function vehicleLabel(vehicle: Vehicle): string {
  return VEHICLES.find((v) => v.id === vehicle)?.label ?? vehicle
}

function payoutModeLabel(mode: PayoutMode): string {
  return PAYOUT_MODES.find((p) => p.id === mode)?.label ?? mode
}

/** "09:30:00" → "09:30" para los inputs de hora. */
function hhmm(value: string | null): string {
  return value ? value.slice(0, 5) : ""
}

const EMPTY_COURIER = {
  id: null as string | null,
  name: "",
  phone: "",
  vehicle: "moto" as Vehicle,
  capacity: "1",
  shift_start: "",
  shift_end: "",
  notes: "",
  is_active: true,
}

const EMPTY_ZONE = {
  id: null as string | null,
  name: "",
  branch_id: "",
  center_lat: "",
  center_lng: "",
  radius_km: "3",
  fee: "45",
  min_order: "0",
  eta_minutes: "35",
  payout_mode: "fixed" as PayoutMode,
  payout_value: "25",
  color: "",
  sort_order: "0",
  is_active: true,
}

const EMPTY_STATS: FlotillaStats = {
  active: 0,
  unassigned: 0,
  deliveredToday: 0,
  failedToday: 0,
  avgDeliveryMinutes: null,
  feesToday: 0,
  payoutsToday: 0,
  couriers: 0,
  zones: 0,
}

export default function FlotillaPage() {
  const { can } = useEntitlements()
  const canFlotilla = can("flotilla")

  const [restaurant, setRestaurant] = useState<FoodosRestaurant | null>(null)
  const [branches, setBranches] = useState<FoodosBranch[]>([])
  const [couriers, setCouriers] = useState<FlotillaCourierRow[]>([])
  const [zones, setZones] = useState<FlotillaZoneRow[]>([])
  const [deliveries, setDeliveries] = useState<FlotillaDeliveryRow[]>([])
  const [stats, setStats] = useState<FlotillaStats>(EMPTY_STATS)

  const [courierForm, setCourierForm] = useState(EMPTY_COURIER)
  const [zoneForm, setZoneForm] = useState(EMPTY_ZONE)
  const [showCourierForm, setShowCourierForm] = useState(false)
  const [showZoneForm, setShowZoneForm] = useState(false)
  const [assignChoice, setAssignChoice] = useState<Record<string, string>>({})
  // Enlaces de repartidor ya generados en esta sesión de panel, por id.
  const [courierLinks, setCourierLinks] = useState<Record<string, string>>({})
  const [openLinkId, setOpenLinkId] = useState<string | null>(null)
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
      setBranches(data.branches ?? [])
      if (!data.restaurant) return

      const [courierRows, zoneRows, deliveryRows, metrics] = await Promise.all([
        listFlotillaCouriers(data.restaurant.id),
        listFlotillaZones(data.restaurant.id),
        listFlotillaDeliveries(data.restaurant.id),
        getFlotillaStats(data.restaurant.id),
      ])
      setCouriers(courierRows)
      setZones(zoneRows)
      setDeliveries(deliveryRows)
      setStats(metrics)
    } catch (err) {
      setNotice({ ok: false, text: err instanceof Error ? err.message : t("foodos.flotilla.actionError") })
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

  const availableCouriers = useMemo(
    () => couriers.filter((c) => c.is_active),
    [couriers]
  )

  async function refresh() {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }

  function openCourierForm(row?: FlotillaCourierRow) {
    setNotice(null)
    setCourierForm(
      row
        ? {
            id: row.id,
            name: row.name,
            phone: row.phone ?? "",
            vehicle: row.vehicle,
            capacity: String(row.capacity),
            shift_start: hhmm(row.shift_start),
            shift_end: hhmm(row.shift_end),
            notes: row.notes ?? "",
            is_active: row.is_active,
          }
        : EMPTY_COURIER
    )
    setShowCourierForm(true)
  }

  function openZoneForm(row?: FlotillaZoneRow) {
    setNotice(null)
    setZoneForm(
      row
        ? {
            id: row.id,
            name: row.name,
            branch_id: row.branch_id ?? "",
            center_lat: row.center_lat === null ? "" : String(row.center_lat),
            center_lng: row.center_lng === null ? "" : String(row.center_lng),
            radius_km: row.radius_km === null ? "" : String(row.radius_km),
            fee: String(row.fee),
            min_order: String(row.min_order),
            eta_minutes: String(row.eta_minutes),
            payout_mode: row.payout_mode,
            payout_value: String(row.payout_value),
            color: row.color ?? "",
            sort_order: String(row.sort_order),
            is_active: row.is_active,
          }
        : EMPTY_ZONE
    )
    setShowZoneForm(true)
  }

  async function saveCourier() {
    if (!restaurant) return
    if (!courierForm.name.trim()) {
      setNotice({ ok: false, text: t("foodos.flotilla.requiredName") })
      return
    }
    setSaving(true)
    try {
      await upsertFlotillaCourier({
        id: courierForm.id,
        restaurant_id: restaurant.id,
        name: courierForm.name,
        phone: courierForm.phone,
        vehicle: courierForm.vehicle,
        capacity: Number(courierForm.capacity) || 1,
        shift_start: courierForm.shift_start || null,
        shift_end: courierForm.shift_end || null,
        notes: courierForm.notes,
        is_active: courierForm.is_active,
      })
      setShowCourierForm(false)
      await load()
    } catch (err) {
      setNotice({ ok: false, text: err instanceof Error ? err.message : t("foodos.flotilla.actionError") })
    } finally {
      setSaving(false)
    }
  }

  async function saveZone() {
    if (!restaurant) return
    if (!zoneForm.name.trim()) {
      setNotice({ ok: false, text: t("foodos.flotilla.requiredName") })
      return
    }
    const lat = Number(zoneForm.center_lat)
    const lng = Number(zoneForm.center_lng)
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !zoneForm.center_lat || !zoneForm.center_lng) {
      setNotice({ ok: false, text: t("foodos.flotilla.requiredCoords") })
      return
    }
    if (!(Number(zoneForm.radius_km) > 0)) {
      setNotice({ ok: false, text: t("foodos.flotilla.requiredRadius") })
      return
    }
    setSaving(true)
    try {
      await upsertFlotillaZone({
        id: zoneForm.id,
        restaurant_id: restaurant.id,
        name: zoneForm.name,
        branch_id: zoneForm.branch_id || null,
        center_lat: lat,
        center_lng: lng,
        radius_km: Number(zoneForm.radius_km),
        fee: Number(zoneForm.fee) || 0,
        min_order: Number(zoneForm.min_order) || 0,
        eta_minutes: Number(zoneForm.eta_minutes) || 35,
        payout_mode: zoneForm.payout_mode,
        payout_value: Number(zoneForm.payout_value) || 0,
        color: zoneForm.color,
        sort_order: Number(zoneForm.sort_order) || 0,
        is_active: zoneForm.is_active,
      })
      setShowZoneForm(false)
      await load()
    } catch (err) {
      setNotice({ ok: false, text: err instanceof Error ? err.message : t("foodos.flotilla.actionError") })
    } finally {
      setSaving(false)
    }
  }

  async function runDeliveryAction(
    id: string,
    fn: () => Promise<{ ok: boolean; error?: string }>
  ) {
    setBusyId(id)
    setNotice(null)
    try {
      const result = await fn()
      if (!result.ok) setNotice({ ok: false, text: result.error ?? t("foodos.flotilla.actionError") })
      await load()
    } catch (err) {
      setNotice({ ok: false, text: err instanceof Error ? err.message : t("foodos.flotilla.actionError") })
    } finally {
      setBusyId(null)
    }
  }

  /**
   * Pide el enlace del repartidor y lo muestra. El token lo genera el
   * servidor la primera vez; aquí solo se guarda para poder copiarlo.
   */
  async function toggleCourierLink(courierId: string) {
    setNotice(null)
    if (openLinkId === courierId) {
      setOpenLinkId(null)
      return
    }
    setOpenLinkId(courierId)
    if (courierLinks[courierId]) return

    setBusyId(courierId)
    try {
      const result = await ensureFlotillaCourierLink({
        restaurant_id: restaurant?.id ?? "",
        courier_id: courierId,
      })
      if (!result.ok || !result.url) {
        setNotice({ ok: false, text: result.error ?? t("foodos.flotilla.actionError") })
        setOpenLinkId(null)
        return
      }
      setCourierLinks((prev) => ({ ...prev, [courierId]: result.url as string }))
    } catch (err) {
      setNotice({ ok: false, text: err instanceof Error ? err.message : t("foodos.flotilla.actionError") })
      setOpenLinkId(null)
    } finally {
      setBusyId(null)
    }
  }

  async function revokeCourierLink(courierId: string) {
    if (!window.confirm(t("foodos.flotilla.courierLinkRevokeHint"))) return
    setBusyId(courierId)
    setNotice(null)
    try {
      const result = await revokeFlotillaCourierLink({
        restaurant_id: restaurant?.id ?? "",
        courier_id: courierId,
      })
      if (!result.ok) {
        setNotice({ ok: false, text: result.error ?? t("foodos.flotilla.actionError") })
        return
      }
      setCourierLinks((prev) => {
        const next = { ...prev }
        delete next[courierId]
        return next
      })
      setOpenLinkId(null)
      await load()
    } finally {
      setBusyId(null)
    }
  }

  async function copyCourierLink(courierId: string, url: string) {
    try {
      await navigator.clipboard.writeText(url)
      setCopiedId(courierId)
      window.setTimeout(() => setCopiedId(null), 2000)
    } catch {
      setNotice({ ok: false, text: url })
    }
  }

  async function autoAssign(deliveryId: string) {
    await runDeliveryAction(deliveryId, async () => {
      const result = await autoAssignFlotillaDelivery({
        restaurant_id: restaurant?.id ?? "",
        delivery_id: deliveryId,
      })
      if (result.ok && result.courierName) {
        setNotice({ ok: true, text: result.courierName })
      }
      return result
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-[#0E7A0E]" />
      </div>
    )
  }

  if (!canFlotilla) {
    return (
      <div className="space-y-6">
        <Header />
        <NivelGate feature="flotilla" />
      </div>
    )
  }

  if (!restaurant) {
    return (
      <div className="space-y-6">
        <Header />
        <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
          <Truck className="w-12 h-12 text-gray-300 mx-auto mb-3" />
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
          <StatCard label={t("foodos.flotilla.kpiActive")} value={stats.active} icon={Truck} />
          <StatCard
            label={t("foodos.flotilla.kpiUnassigned")}
            value={stats.unassigned}
            icon={Users}
            tone={stats.unassigned > 0 ? "warning" : undefined}
          />
          <StatCard
            label={t("foodos.flotilla.kpiDeliveredToday")}
            value={stats.deliveredToday}
            icon={PackageCheck}
            tone="positive"
          />
          <StatCard
            label={t("foodos.flotilla.kpiAvgTime")}
            value={
              stats.avgDeliveryMinutes === null
                ? t("foodos.flotilla.noData")
                : `${stats.avgDeliveryMinutes} ${t("foodos.flotilla.minutesShort")}`
            }
            icon={Route}
          />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-3">
          <StatCard label={t("foodos.flotilla.kpiFeesToday")} value={formatMoney(stats.feesToday)} icon={MapPin} />
          <StatCard
            label={t("foodos.flotilla.kpiPayoutsToday")}
            value={formatMoney(stats.payoutsToday)}
            icon={Bike}
          />
          <StatCard label={t("foodos.flotilla.kpiCouriers")} value={stats.couriers} icon={Users} />
          <StatCard label={t("foodos.flotilla.kpiZones")} value={stats.zones} icon={Navigation} />
        </div>
      </section>

      {/* ── Entregas activas ───────────────────────────────── */}
      <section className="bg-white rounded-2xl border border-gray-100 p-5">
        <h2 className="font-bold text-gray-900 mb-3">{t("foodos.flotilla.deliveriesTitle")}</h2>
        {deliveries.length === 0 ? (
          <p className="text-sm text-gray-500">{t("foodos.flotilla.deliveriesEmpty")}</p>
        ) : (
          <ul className="space-y-3">
            {deliveries.map((d) => {
              const busy = busyId === d.id
              const choice = assignChoice[d.id] ?? ""
              return (
                <li key={d.id} className="rounded-xl border border-gray-100 p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900 truncate">
                        {d.customer_name ?? t("foodos.flotilla.deliveryCustomer")}
                      </p>
                      <p className="text-sm text-gray-500 truncate">{d.dropoff_address}</p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold ${STATUS_STYLE[d.status]}`}
                    >
                      {statusLabel(d.status)}
                    </span>
                  </div>

                  <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-gray-600">
                    <div>
                      <dt className="text-gray-400">{t("foodos.flotilla.deliveryZone")}</dt>
                      <dd className="font-semibold">{d.zone_name ?? t("foodos.flotilla.deliveryNoZone")}</dd>
                    </div>
                    <div>
                      <dt className="text-gray-400">{t("foodos.flotilla.deliveryFee")}</dt>
                      <dd className="font-semibold">{formatMoney(d.fee)}</dd>
                    </div>
                    <div>
                      <dt className="text-gray-400">{t("foodos.flotilla.deliveryPayout")}</dt>
                      <dd className="font-semibold">{formatMoney(d.courier_payout)}</dd>
                    </div>
                    <div>
                      <dt className="text-gray-400">{t("foodos.flotilla.deliveryEta")}</dt>
                      <dd className="font-semibold">
                        {d.eta_minutes === null
                          ? t("foodos.flotilla.noData")
                          : `${d.eta_minutes} ${t("foodos.flotilla.minutesShort")}`}
                      </dd>
                    </div>
                  </dl>

                  <p className="text-xs text-gray-500">
                    {d.courier_name ?? t("foodos.flotilla.deliveryNoCourier")}
                    {d.distance_km !== null && ` · ${d.distance_km} km`}
                    {d.provider === "uber_direct" && ` · ${t("foodos.flotilla.deliveryProvider")}`}
                  </p>

                  {d.provider_tracking_url && (
                    <a
                      href={d.provider_tracking_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-block text-xs font-semibold text-[#0E7A0E] hover:underline"
                    >
                      {t("foodos.flotilla.deliveryProvider")}
                    </a>
                  )}

                  {d.status === "pending" && (
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="sr-only" htmlFor={`courier-${d.id}`}>
                        {t("foodos.flotilla.assignLabel")}
                      </label>
                      <select
                        id={`courier-${d.id}`}
                        value={choice}
                        onChange={(e) =>
                          setAssignChoice((prev) => ({ ...prev, [d.id]: e.target.value }))
                        }
                        className="touch-target rounded-xl border border-gray-200 px-3 py-2 text-sm"
                      >
                        <option value="">{t("foodos.flotilla.assignLabel")}</option>
                        {availableCouriers.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} ({c.load}/{c.capacity})
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={busy || !choice}
                        onClick={() =>
                          runDeliveryAction(d.id, () =>
                            assignFlotillaCourier({
                              restaurant_id: restaurant.id,
                              delivery_id: d.id,
                              courier_id: choice,
                            })
                          )
                        }
                        className="touch-target rounded-xl bg-[#0E7A0E] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                      >
                        {t("foodos.flotilla.assignAction")}
                      </button>
                      <ActionButton
                        disabled={busy}
                        icon={Wand2}
                        label={t("foodos.flotilla.autoAssign")}
                        title={t("foodos.flotilla.autoAssignHint")}
                        onClick={() => autoAssign(d.id)}
                      />
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    {d.status === "assigned" && (
                      <ActionButton
                        disabled={busy}
                        icon={PackageCheck}
                        label={t("foodos.flotilla.markPickedUp")}
                        onClick={() =>
                          runDeliveryAction(d.id, () =>
                            advanceFlotillaDelivery({
                              restaurant_id: restaurant.id,
                              delivery_id: d.id,
                              status: "picked_up",
                            })
                          )
                        }
                      />
                    )}
                    {d.status === "picked_up" && (
                      <ActionButton
                        disabled={busy}
                        icon={Check}
                        label={t("foodos.flotilla.markDelivered")}
                        onClick={() =>
                          runDeliveryAction(d.id, () =>
                            advanceFlotillaDelivery({
                              restaurant_id: restaurant.id,
                              delivery_id: d.id,
                              status: "delivered",
                            })
                          )
                        }
                      />
                    )}
                    <ActionButton
                      disabled={busy}
                      icon={X}
                      label={t("foodos.flotilla.markFailed")}
                      onClick={() =>
                        runDeliveryAction(d.id, () =>
                          advanceFlotillaDelivery({
                            restaurant_id: restaurant.id,
                            delivery_id: d.id,
                            status: "failed",
                          })
                        )
                      }
                    />
                    <ActionButton
                      disabled={busy}
                      icon={Navigation}
                      label={t("foodos.flotilla.dispatchProvider")}
                      title={t("foodos.flotilla.dispatchProviderHint")}
                      onClick={() =>
                        runDeliveryAction(d.id, () =>
                          dispatchFlotillaToProvider({
                            restaurant_id: restaurant.id,
                            delivery_id: d.id,
                          })
                        )
                      }
                    />
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {/* ── Repartidores ───────────────────────────────────── */}
      <section className="bg-white rounded-2xl border border-gray-100 p-5">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h2 className="font-bold text-gray-900">{t("foodos.flotilla.couriersTitle")}</h2>
          <button
            type="button"
            onClick={() => openCourierForm()}
            className="touch-target inline-flex items-center gap-2 rounded-xl bg-[#0E7A0E] px-3 py-2 text-sm font-semibold text-white"
          >
            <Plus className="w-4 h-4" aria-hidden />
            {t("foodos.flotilla.addCourier")}
          </button>
        </div>
        {couriers.length === 0 ? (
          <p className="text-sm text-gray-500">{t("foodos.flotilla.couriersEmpty")}</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {couriers.map((c) => (
              <li key={c.id} className="py-3">
                <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900 truncate">
                    {c.name}
                    {!c.is_active && (
                      <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                        {t("foodos.flotilla.courierInactive")}
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-gray-500">
                    {vehicleLabel(c.vehicle)} · {c.load}/{c.capacity} {t("foodos.flotilla.courierLoad")}
                    {c.shift_start && c.shift_end && ` · ${hhmm(c.shift_start)}–${hhmm(c.shift_end)}`}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => toggleCourierLink(c.id)}
                    aria-expanded={openLinkId === c.id}
                    className="touch-target inline-flex items-center gap-1 rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700"
                  >
                    {c.has_link ? (
                      <Link2 className="w-3.5 h-3.5" aria-hidden />
                    ) : (
                      <Link2Off className="w-3.5 h-3.5 text-gray-400" aria-hidden />
                    )}
                    {t("foodos.flotilla.courierLink")}
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      await toggleFlotillaCourier(c.id, !c.is_active)
                      await load()
                    }}
                    className="touch-target rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700"
                  >
                    {c.is_active ? t("foodos.flotilla.courierInactive") : t("foodos.flotilla.courierActive")}
                  </button>
                  <button
                    type="button"
                    onClick={() => openCourierForm(c)}
                    className="touch-target rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700"
                  >
                    {t("foodos.flotilla.editCourier")}
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!window.confirm(t("foodos.flotilla.confirmDelete"))) return
                      await deleteFlotillaCourier(c.id)
                      await load()
                    }}
                    className="touch-target rounded-xl border border-red-200 px-3 py-2 text-xs font-semibold text-red-600"
                  >
                    {t("foodos.flotilla.delete")}
                  </button>
                </div>
                </div>

                {openLinkId === c.id && (
                  <div className="mt-2 rounded-xl border border-gray-100 bg-gray-50 p-3">
                    <p className="text-xs font-semibold text-gray-700">
                      {t("foodos.flotilla.courierLinkTitle")}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-500">
                      {t("foodos.flotilla.courierLinkHint")}
                    </p>
                    {busyId === c.id ? (
                      <Loader2 className="mt-2 w-4 h-4 animate-spin text-[#0E7A0E]" />
                    ) : courierLinks[c.id] ? (
                      <div className="mt-2 space-y-2">
                        <p className="break-all rounded-lg bg-white px-2 py-1.5 text-xs text-gray-700">
                          {courierLinks[c.id]}
                        </p>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => copyCourierLink(c.id, courierLinks[c.id] as string)}
                            className="touch-target inline-flex items-center gap-1 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700"
                          >
                            <Copy className="w-3.5 h-3.5" aria-hidden />
                            {copiedId === c.id
                              ? t("foodos.flotilla.courierLinkCopied")
                              : t("foodos.flotilla.courierLinkCopy")}
                          </button>
                          <button
                            type="button"
                            onClick={() => revokeCourierLink(c.id)}
                            className="touch-target inline-flex items-center gap-1 rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-600"
                          >
                            <Link2Off className="w-3.5 h-3.5" aria-hidden />
                            {t("foodos.flotilla.courierLinkRevoke")}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="mt-2 text-xs font-semibold text-gray-500">
                        {t("foodos.flotilla.courierLinkNone")}
                      </p>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Zonas ──────────────────────────────────────────── */}
      <section className="bg-white rounded-2xl border border-gray-100 p-5">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h2 className="font-bold text-gray-900">{t("foodos.flotilla.zonesTitle")}</h2>
          <button
            type="button"
            onClick={() => openZoneForm()}
            className="touch-target inline-flex items-center gap-2 rounded-xl bg-[#0E7A0E] px-3 py-2 text-sm font-semibold text-white"
          >
            <Plus className="w-4 h-4" aria-hidden />
            {t("foodos.flotilla.addZone")}
          </button>
        </div>
        {zones.length === 0 ? (
          <p className="text-sm text-gray-500">{t("foodos.flotilla.zonesEmpty")}</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {zones.map((z) => (
              <li key={z.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900 truncate">
                    {z.name}
                    {!z.is_active && (
                      <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                        {t("foodos.flotilla.courierInactive")}
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-gray-500">
                    {formatMoney(z.fee)} · {z.radius_km ?? t("foodos.flotilla.noData")} km ·{" "}
                    {z.eta_minutes} {t("foodos.flotilla.minutesShort")} ·{" "}
                    {payoutModeLabel(z.payout_mode)} {formatMoney(z.payout_value)}
                    {z.min_order > 0 && ` · min ${formatMoney(z.min_order)}`}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => openZoneForm(z)}
                    className="touch-target rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700"
                  >
                    {t("foodos.flotilla.editZone")}
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!window.confirm(t("foodos.flotilla.confirmDelete"))) return
                      await deleteFlotillaZone(z.id)
                      await load()
                    }}
                    className="touch-target rounded-xl border border-red-200 px-3 py-2 text-xs font-semibold text-red-600"
                  >
                    {t("foodos.flotilla.delete")}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ToolGuideHost
        toolKey="flotilla"
        pathname="/panel/foodos/flotilla"
        slug={restaurant.slug}
        icon="🛵"
        title={t("foodos.flotilla.title")}
        subtitle={t("foodos.flotilla.guideSubtitle")}
      />

      {/* ── Alta de repartidor ─────────────────────────────── */}
      <BottomSheet
        open={showCourierForm}
        onClose={() => setShowCourierForm(false)}
        ariaLabel={t("foodos.flotilla.addCourier")}
        maxWidthClass="max-w-lg"
      >
        <div className="p-5 space-y-4">
          <h3 className="text-lg font-bold text-gray-900">
            {courierForm.id ? t("foodos.flotilla.editCourier") : t("foodos.flotilla.addCourier")}
          </h3>

          <Field label={t("foodos.flotilla.courierName")}>
            <input
              value={courierForm.name}
              onChange={(e) => setCourierForm({ ...courierForm, name: e.target.value })}
              placeholder={t("foodos.flotilla.courierNamePlaceholder")}
              className="touch-target w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
            />
          </Field>

          <Field label={t("foodos.flotilla.courierPhone")}>
            <input
              value={courierForm.phone}
              onChange={(e) => setCourierForm({ ...courierForm, phone: e.target.value })}
              inputMode="tel"
              className="touch-target w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
            />
          </Field>

          <Field label={t("foodos.flotilla.courierVehicle")}>
            <div className="flex flex-wrap gap-2">
              {VEHICLES.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  aria-pressed={courierForm.vehicle === v.id}
                  onClick={() => setCourierForm({ ...courierForm, vehicle: v.id })}
                  className={`touch-target rounded-xl border px-3 py-2 text-sm font-semibold ${
                    courierForm.vehicle === v.id
                      ? "border-[#0E7A0E] bg-emerald-50 text-[#0E7A0E]"
                      : "border-gray-200 text-gray-700"
                  }`}
                >
                  {v.label}
                </button>
              ))}
            </div>
          </Field>

          <Field label={t("foodos.flotilla.courierCapacity")}>
            <input
              type="number"
              min={1}
              max={10}
              value={courierForm.capacity}
              onChange={(e) => setCourierForm({ ...courierForm, capacity: e.target.value })}
              className="touch-target w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label={t("foodos.flotilla.courierShiftStart")}>
              <input
                type="time"
                value={courierForm.shift_start}
                onChange={(e) => setCourierForm({ ...courierForm, shift_start: e.target.value })}
                className="touch-target w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
              />
            </Field>
            <Field label={t("foodos.flotilla.courierShiftEnd")}>
              <input
                type="time"
                value={courierForm.shift_end}
                onChange={(e) => setCourierForm({ ...courierForm, shift_end: e.target.value })}
                className="touch-target w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
              />
            </Field>
          </div>
          <p className="text-xs text-gray-500">{t("foodos.flotilla.courierShiftHint")}</p>

          <Field label={t("foodos.flotilla.courierNotes")}>
            <textarea
              rows={2}
              value={courierForm.notes}
              onChange={(e) => setCourierForm({ ...courierForm, notes: e.target.value })}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
            />
          </Field>

          <label className="flex items-center gap-3 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={courierForm.is_active}
              onChange={(e) => setCourierForm({ ...courierForm, is_active: e.target.checked })}
              className="h-4 w-4"
            />
            {t("foodos.flotilla.courierActive")}
          </label>

          <div className="flex gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={saveCourier}
              className="touch-target flex-1 rounded-xl bg-[#0E7A0E] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {t("foodos.flotilla.save")}
            </button>
            <button
              type="button"
              onClick={() => setShowCourierForm(false)}
              className="touch-target rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-700"
            >
              {t("foodos.flotilla.cancel")}
            </button>
          </div>
        </div>
      </BottomSheet>

      {/* ── Alta de zona ───────────────────────────────────── */}
      <BottomSheet
        open={showZoneForm}
        onClose={() => setShowZoneForm(false)}
        ariaLabel={t("foodos.flotilla.addZone")}
        maxWidthClass="max-w-lg"
      >
        <div className="p-5 space-y-4">
          <h3 className="text-lg font-bold text-gray-900">
            {zoneForm.id ? t("foodos.flotilla.editZone") : t("foodos.flotilla.addZone")}
          </h3>

          <Field label={t("foodos.flotilla.zoneName")}>
            <input
              value={zoneForm.name}
              onChange={(e) => setZoneForm({ ...zoneForm, name: e.target.value })}
              placeholder={t("foodos.flotilla.zoneNamePlaceholder")}
              className="touch-target w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
            />
          </Field>

          {branches.length > 0 && (
            <Field label={t("foodos.flotilla.zoneBranch")}>
              <select
                value={zoneForm.branch_id}
                onChange={(e) => setZoneForm({ ...zoneForm, branch_id: e.target.value })}
                className="touch-target w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
              >
                <option value="">{t("foodos.flotilla.zoneAllBranches")}</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </Field>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label={t("foodos.flotilla.zoneLat")}>
              <input
                value={zoneForm.center_lat}
                onChange={(e) => setZoneForm({ ...zoneForm, center_lat: e.target.value })}
                inputMode="decimal"
                placeholder="19.4326"
                className="touch-target w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
              />
            </Field>
            <Field label={t("foodos.flotilla.zoneLng")}>
              <input
                value={zoneForm.center_lng}
                onChange={(e) => setZoneForm({ ...zoneForm, center_lng: e.target.value })}
                inputMode="decimal"
                placeholder="-99.1332"
                className="touch-target w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
              />
            </Field>
          </div>
          <p className="text-xs text-gray-500">{t("foodos.flotilla.zoneCoordsHint")}</p>

          <div className="grid grid-cols-2 gap-3">
            <Field label={t("foodos.flotilla.zoneRadius")}>
              <input
                type="number"
                min={0.1}
                step={0.1}
                value={zoneForm.radius_km}
                onChange={(e) => setZoneForm({ ...zoneForm, radius_km: e.target.value })}
                className="touch-target w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
              />
            </Field>
            <Field label={t("foodos.flotilla.zoneFee")}>
              <input
                type="number"
                min={0}
                value={zoneForm.fee}
                onChange={(e) => setZoneForm({ ...zoneForm, fee: e.target.value })}
                className="touch-target w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
              />
            </Field>
            <Field label={t("foodos.flotilla.zoneMinOrder")}>
              <input
                type="number"
                min={0}
                value={zoneForm.min_order}
                onChange={(e) => setZoneForm({ ...zoneForm, min_order: e.target.value })}
                className="touch-target w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
              />
            </Field>
            <Field label={t("foodos.flotilla.zoneEta")}>
              <input
                type="number"
                min={5}
                max={240}
                value={zoneForm.eta_minutes}
                onChange={(e) => setZoneForm({ ...zoneForm, eta_minutes: e.target.value })}
                className="touch-target w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
              />
            </Field>
          </div>

          <Field label={t("foodos.flotilla.zonePayoutMode")}>
            <div className="flex flex-wrap gap-2">
              {PAYOUT_MODES.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={zoneForm.payout_mode === p.id}
                  onClick={() => setZoneForm({ ...zoneForm, payout_mode: p.id })}
                  className={`touch-target rounded-xl border px-3 py-2 text-sm font-semibold ${
                    zoneForm.payout_mode === p.id
                      ? "border-[#0E7A0E] bg-emerald-50 text-[#0E7A0E]"
                      : "border-gray-200 text-gray-700"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label={t("foodos.flotilla.zonePayoutValue")}>
              <input
                type="number"
                min={0}
                value={zoneForm.payout_value}
                onChange={(e) => setZoneForm({ ...zoneForm, payout_value: e.target.value })}
                className="touch-target w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
              />
            </Field>
            <Field label={t("foodos.flotilla.zoneSortOrder")}>
              <input
                type="number"
                value={zoneForm.sort_order}
                onChange={(e) => setZoneForm({ ...zoneForm, sort_order: e.target.value })}
                className="touch-target w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
              />
            </Field>
          </div>
          <p className="text-xs text-gray-500">{t("foodos.flotilla.zoneSortHint")}</p>

          <label className="flex items-center gap-3 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={zoneForm.is_active}
              onChange={(e) => setZoneForm({ ...zoneForm, is_active: e.target.checked })}
              className="h-4 w-4"
            />
            {t("foodos.flotilla.zoneActive")}
          </label>

          <div className="flex gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={saveZone}
              className="touch-target flex-1 rounded-xl bg-[#0E7A0E] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {t("foodos.flotilla.save")}
            </button>
            <button
              type="button"
              onClick={() => setShowZoneForm(false)}
              className="touch-target rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-700"
            >
              {t("foodos.flotilla.cancel")}
            </button>
          </div>
        </div>
      </BottomSheet>
    </div>
  )
}

function Header() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">{t("foodos.flotilla.title")}</h1>
      <p className="text-sm text-gray-500 mt-1">{t("foodos.flotilla.subtitle")}</p>
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

function ActionButton({
  icon: Icon,
  label,
  title,
  disabled,
  onClick,
}: {
  icon: typeof Bike
  label: string
  title?: string
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className="touch-target inline-flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
    >
      <Icon className="w-4 h-4" aria-hidden />
      {label}
    </button>
  )
}
