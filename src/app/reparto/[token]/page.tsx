"use client"

// ============================================================
// Vista móvil del repartidor (/reparto/[token]).
//
// Es una capability URL: el repartidor no tiene cuenta ni sesión en
// Resurte. Todo lo que puede hacer lo resuelve la API con su token, que
// solo abre SUS entregas. Esta pantalla no consulta Supabase directo.
//
// Tres decisiones de UX:
//  1. Una entrega a la vez, en tarjeta, con el botón grande abajo: se
//     usa con una mano, de pie y a la intemperie.
//  2. El PIN se pide al cliente y se teclea aquí. La foto es opcional y
//     nunca bloquea el cierre.
//  3. Si falla la red se conserva lo último que se vio y el error es
//     legible; perder la lista en la calle es peor que un dato viejo.
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useParams } from "next/navigation"
import {
  AlertTriangle,
  Bike,
  Camera,
  Car,
  Check,
  ChevronDown,
  Footprints,
  KeyRound,
  Loader2,
  MapPin,
  Navigation,
  RefreshCw,
  Store,
} from "lucide-react"
import { formatMoney } from "@/lib/money"
import { detectStorefrontLang, sf, type StorefrontKey } from "@/lib/foodos-i18n"

type CourierVehicle = "moto" | "bici" | "auto" | "a_pie"

interface CourierJob {
  id: string
  status: string
  orderId: string | null
  customerName: string | null
  dropoffAddress: string
  dropoffNotes: string | null
  zoneName: string | null
  etaMinutes: number | null
  distanceKm: number | null
  courierPayout: number
  createdAt: string
  proofVerified: boolean
}

interface CourierPayload {
  courier: {
    id: string
    name: string
    phone: string | null
    vehicle: CourierVehicle
    capacity: number
  }
  restaurant: { id: string; name: string; timezone: string | null; logo_url: string | null } | null
  jobs: CourierJob[]
}

const VEHICLE_ICON: Record<CourierVehicle, React.ReactNode> = {
  moto: <Bike className="w-4 h-4" aria-hidden />,
  bici: <Bike className="w-4 h-4" aria-hidden />,
  auto: <Car className="w-4 h-4" aria-hidden />,
  a_pie: <Footprints className="w-4 h-4" aria-hidden />,
}

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-stone-100 text-stone-700",
  assigned: "bg-sky-100 text-sky-800",
  picked_up: "bg-amber-100 text-amber-900",
  delivered: "bg-emerald-100 text-emerald-800",
  failed: "bg-red-100 text-red-800",
  cancelled: "bg-stone-100 text-stone-600",
}

const STATUS_KEY: Record<string, StorefrontKey> = {
  pending: "courierStatusPending",
  assigned: "courierStatusAssigned",
  picked_up: "courierStatusPickedUp",
  delivered: "courierStatusDelivered",
  failed: "courierStatusFailed",
  cancelled: "courierStatusCancelled",
}

function mapsUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
}

export default function RepartoPage() {
  const params = useParams<{ token: string }>()
  const token = typeof params?.token === "string" ? params.token : ""

  const [lang] = useState<"es" | "en">(() => detectStorefrontLang("reparto"))
  const [data, setData] = useState<CourierPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [invalid, setInvalid] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [doneId, setDoneId] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [mode, setMode] = useState<"pin" | "fail">("pin")
  const [pin, setPin] = useState("")
  const [failNote, setFailNote] = useState("")
  const [photo, setPhoto] = useState<{ status: "idle" | "uploading" | "done" }>({ status: "idle" })
  const fileRef = useRef<HTMLInputElement | null>(null)

  const t = useCallback((key: StorefrontKey) => sf(lang, key), [lang])

  const load = useCallback(async () => {
    if (!token) return
    try {
      const res = await fetch(`/api/reparto/${encodeURIComponent(token)}`, { cache: "no-store" })
      if (res.status === 404) {
        setInvalid(true)
        setData(null)
        return
      }
      if (!res.ok) throw new Error(String(res.status))
      const payload = (await res.json()) as CourierPayload
      setData(payload)
      setInvalid(false)
    } catch {
      setError(sf(lang, "courierActionError"))
    } finally {
      setLoading(false)
    }
  }, [token, lang])

  useEffect(() => {
    const run = async () => {
      await load()
    }
    run()
  }, [load])

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") void load()
    }
    const id = window.setInterval(tick, 45_000)
    document.addEventListener("visibilitychange", tick)
    return () => {
      window.clearInterval(id)
      document.removeEventListener("visibilitychange", tick)
    }
  }, [load])

  const jobs = useMemo(() => data?.jobs ?? [], [data])

  function startAction(job: CourierJob, next: "pin" | "fail") {
    setOpenId(job.id)
    setMode(next)
    setPin("")
    setFailNote("")
    setPhoto({ status: "idle" })
    setError(null)
  }

  async function send(job: CourierJob, action: "picked_up" | "delivered" | "failed") {
    if (busyId) return
    if (action === "delivered" && !/^\d{4}$/.test(pin)) {
      setError(t("courierPinMissing"))
      return
    }
    if (action === "failed" && !failNote.trim()) {
      setError(t("courierFailReason"))
      return
    }
    setBusyId(job.id)
    setError(null)
    try {
      const res = await fetch(`/api/reparto/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          delivery_id: job.id,
          action,
          pin: action === "delivered" ? pin : undefined,
          note: action === "failed" ? failNote.trim() : undefined,
        }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null
        const message = body?.error ?? t("courierActionError")
        setError(message === "PIN incorrecto" ? t("courierPinWrong") : message)
        return
      }
      if (action === "delivered") setDoneId(job.id)
      setOpenId(null)
      setPin("")
      setFailNote("")
      await load()
    } catch {
      setError(t("courierActionError"))
    } finally {
      setBusyId(null)
    }
  }

  async function uploadPhoto(job: CourierJob, file: File) {
    setPhoto({ status: "uploading" })
    try {
      const form = new FormData()
      form.append("file", file)
      form.append("delivery_id", job.id)
      const res = await fetch(`/api/reparto/${encodeURIComponent(token)}/proof`, {
        method: "POST",
        body: form,
      })
      if (!res.ok) throw new Error(String(res.status))
      setPhoto({ status: "done" })
    } catch {
      // La foto nunca bloquea: si falla, el repartidor cierra con el PIN.
      setPhoto({ status: "idle" })
      setError(t("courierPhotoError"))
    }
  }

  return (
    <main className="min-h-[100dvh] bg-stone-50 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
      <header className="sticky top-0 z-10 border-b border-stone-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-lg items-center gap-3 px-4 py-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
            {data ? VEHICLE_ICON[data.courier.vehicle] : <Bike className="w-4 h-4" aria-hidden />}
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-bold text-stone-900">
              {data?.courier.name ?? t("courierTitle")}
            </h1>
            <p className="truncate text-xs text-stone-600">
              {data?.restaurant?.name ?? t("courierSubtitle")}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            aria-label={t("courierRefresh")}
            className="touch-target flex h-11 w-11 items-center justify-center rounded-full text-stone-600 transition hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 motion-reduce:transition-none"
          >
            <RefreshCw
              className={`w-5 h-5 ${loading ? "animate-spin motion-reduce:animate-none" : ""}`}
              aria-hidden
            />
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-lg space-y-4 px-4 pt-4">
        {loading && !data && (
          <p
            className="flex items-center justify-center gap-2 py-12 text-sm text-stone-600"
            aria-live="polite"
          >
            <Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none" aria-hidden />
            {t("courierLoading")}
          </p>
        )}

        {invalid && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-center">
            <AlertTriangle className="mx-auto mb-2 w-6 h-6 text-amber-700" aria-hidden />
            <p className="text-sm font-semibold text-amber-900">{t("courierInvalidLink")}</p>
            <p className="mt-1 text-xs text-amber-800">{t("courierInvalidLinkHint")}</p>
          </div>
        )}

        {!loading && !invalid && jobs.length === 0 && (
          <div className="rounded-2xl border border-stone-200 bg-white p-6 text-center">
            <Store className="mx-auto mb-2 w-6 h-6 text-stone-400" aria-hidden />
            <p className="text-sm font-semibold text-stone-800">{t("courierNoJobs")}</p>
            <p className="mt-1 text-xs text-stone-600">{t("courierNoJobsHint")}</p>
          </div>
        )}

        {error && (
          <p
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800"
          >
            {error}
          </p>
        )}

        {doneId && (
          <div
            role="status"
            className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900"
          >
            <Check className="w-4 h-4 shrink-0" aria-hidden />
            <span className="flex-1">{t("courierDone")}</span>
            <button
              type="button"
              onClick={() => setDoneId(null)}
              className="touch-target rounded-lg px-2 py-1 text-xs font-semibold text-emerald-800 underline"
            >
              {t("courierClose")}
            </button>
          </div>
        )}

        {jobs.map((job) => {
          const isOpen = openId === job.id
          const busy = busyId === job.id
          const statusKey = STATUS_KEY[job.status]
          return (
            <article
              key={job.id}
              className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm"
            >
              <div className="space-y-3 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                      STATUS_STYLE[job.status] ?? "bg-stone-100 text-stone-700"
                    }`}
                  >
                    {statusKey ? t(statusKey) : job.status}
                  </span>
                  {job.zoneName && (
                    <span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-semibold text-stone-700">
                      {job.zoneName}
                    </span>
                  )}
                  {job.orderId && (
                    <span className="ml-auto text-xs font-semibold text-stone-500 tabular-nums">
                      #{job.orderId.slice(0, 8)}
                    </span>
                  )}
                </div>

                {job.customerName && (
                  <p className="text-sm font-semibold text-stone-900">{job.customerName}</p>
                )}

                <p className="flex items-start gap-2 text-sm text-stone-800">
                  <MapPin className="mt-0.5 w-4 h-4 shrink-0 text-stone-500" aria-hidden />
                  <span className="font-medium">{job.dropoffAddress}</span>
                </p>

                {job.dropoffNotes && (
                  <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    <span className="font-semibold">{t("courierNotesLabel")}: </span>
                    {job.dropoffNotes}
                  </p>
                )}

                <dl className="grid grid-cols-3 gap-2 border-t border-stone-100 pt-3 text-center">
                  <div>
                    <dt className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">
                      {t("courierEta")}
                    </dt>
                    <dd className="text-sm font-bold text-stone-900 tabular-nums">
                      {job.etaMinutes === null ? "—" : `${job.etaMinutes} ${t("courierMinutes")}`}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">
                      {t("courierDistance")}
                    </dt>
                    <dd className="text-sm font-bold text-stone-900 tabular-nums">
                      {job.distanceKm === null ? "—" : `${job.distanceKm} ${t("courierKm")}`}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">
                      {t("courierPayout")}
                    </dt>
                    <dd className="text-sm font-bold text-emerald-700 tabular-nums">
                      {formatMoney(job.courierPayout)}
                    </dd>
                  </div>
                </dl>

                <div className="flex gap-2">
                  <a
                    href={mapsUrl(job.dropoffAddress)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="touch-target flex flex-1 items-center justify-center gap-2 rounded-xl border border-stone-300 px-3 py-2.5 text-sm font-semibold text-stone-800 transition hover:bg-stone-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 motion-reduce:transition-none"
                  >
                    <Navigation className="w-4 h-4" aria-hidden />
                    {t("courierOpenMap")}
                  </a>
                  {job.status === "assigned" && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void send(job, "picked_up")}
                      className="touch-target flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 motion-reduce:transition-none"
                    >
                      {busy ? (
                        <Loader2
                          className="w-4 h-4 animate-spin motion-reduce:animate-none"
                          aria-hidden
                        />
                      ) : (
                        <Bike className="w-4 h-4" aria-hidden />
                      )}
                      {t("courierPickUp")}
                    </button>
                  )}
                </div>

                {job.status === "picked_up" && (
                  <>
                    <button
                      type="button"
                      onClick={() => startAction(job, "pin")}
                      aria-expanded={isOpen && mode === "pin"}
                      className="touch-target flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-emerald-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 motion-reduce:transition-none"
                    >
                      <KeyRound className="w-4 h-4" aria-hidden />
                      {t("courierDeliver")}
                      <ChevronDown
                        className={`w-4 h-4 transition motion-reduce:transition-none ${
                          isOpen && mode === "pin" ? "rotate-180" : ""
                        }`}
                        aria-hidden
                      />
                    </button>
                    <button
                      type="button"
                      onClick={() => startAction(job, "fail")}
                      className="touch-target w-full rounded-xl px-4 py-2 text-xs font-semibold text-red-700 underline"
                    >
                      {t("courierFail")}
                    </button>
                  </>
                )}

                {isOpen && mode === "pin" && (
                  <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
                    <p className="text-xs text-emerald-900">{t("courierPinHint")}</p>
                    <label className="block">
                      <span className="text-xs font-semibold text-stone-700">
                        {t("courierPinLabel")}
                      </span>
                      <input
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={4}
                        value={pin}
                        onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                        className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-3 text-center text-2xl font-black tracking-[0.4em] text-stone-900 tabular-nums focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        placeholder="0000"
                      />
                    </label>

                    <div>
                      <span className="text-xs font-semibold text-stone-700">
                        {t("courierPhotoLabel")}
                      </span>
                      <input
                        ref={fileRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="sr-only"
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (file) void uploadPhoto(job, file)
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => fileRef.current?.click()}
                        className="touch-target mt-1 flex w-full items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-50 motion-reduce:transition-none"
                      >
                        {photo.status === "uploading" ? (
                          <Loader2
                            className="w-4 h-4 animate-spin motion-reduce:animate-none"
                            aria-hidden
                          />
                        ) : (
                          <Camera className="w-4 h-4" aria-hidden />
                        )}
                        {photo.status === "uploading"
                          ? t("courierPhotoUploading")
                          : photo.status === "done"
                            ? t("courierPhotoDone")
                            : t("courierPhotoTake")}
                      </button>
                    </div>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setOpenId(null)}
                        className="touch-target flex-1 rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm font-semibold text-stone-700"
                      >
                        {t("courierCancel")}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void send(job, "delivered")}
                        className="touch-target flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50 motion-reduce:transition-none"
                      >
                        {busy && (
                          <Loader2
                            className="w-4 h-4 animate-spin motion-reduce:animate-none"
                            aria-hidden
                          />
                        )}
                        {t("courierPinConfirm")}
                      </button>
                    </div>
                  </div>
                )}

                {isOpen && mode === "fail" && (
                  <div className="space-y-3 rounded-xl border border-red-200 bg-red-50/60 p-3">
                    <label className="block">
                      <span className="text-xs font-semibold text-stone-700">
                        {t("courierFailReason")}
                      </span>
                      <textarea
                        rows={2}
                        value={failNote}
                        onChange={(e) => setFailNote(e.target.value.slice(0, 300))}
                        placeholder={t("courierFailPlaceholder")}
                        className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500"
                      />
                    </label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setOpenId(null)}
                        className="touch-target flex-1 rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm font-semibold text-stone-700"
                      >
                        {t("courierCancel")}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void send(job, "failed")}
                        className="touch-target flex flex-1 items-center justify-center gap-2 rounded-xl bg-red-600 px-3 py-2.5 text-sm font-bold text-white transition hover:bg-red-700 disabled:opacity-50 motion-reduce:transition-none"
                      >
                        {busy && (
                          <Loader2
                            className="w-4 h-4 animate-spin motion-reduce:animate-none"
                            aria-hidden
                          />
                        )}
                        {t("courierFailSend")}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </article>
          )
        })}
      </div>
    </main>
  )
}
