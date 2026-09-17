"use client"

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react"
import Image from "next/image"
import Link from "next/link"
import {
  CalendarDays,
  Check,
  ChevronRight,
  Clock,
  Loader2,
  PartyPopper,
  Send,
  Users,
} from "lucide-react"

import { MAX_HEADCOUNT, quoteCatering, type CateringPackage } from "@/lib/foodos-catering"
import type { PublicCateringRestaurant } from "@/lib/foodos-catering-public"
import { detectStorefrontLang, sf, type StorefrontLang } from "@/lib/foodos-i18n"
import { formatMoney } from "@/lib/money"

interface Props {
  restaurant: PublicCateringRestaurant
  packages: CateringPackage[]
}

/** Sustituye `{n}`/`{min}`/`{max}` en las cadenas del micrositio. */
function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in vars ? String(vars[key]) : match
  )
}

/**
 * Página pública de catering de `/r/[slug]/catering`.
 *
 * Dos reglas se ven en este componente:
 *
 * 1. **El navegador no manda precios.** El total que se muestra es una vista
 *    previa calculada con `quoteCatering`; lo que viaja al servidor son datos
 *    del evento. El número que se guarda lo vuelve a calcular el servidor con
 *    la misma función pura.
 *
 * 2. **Esto es una cotización, no una venta.** El comensal no paga nada aquí:
 *    la solicitud queda en manos del restaurante, que confirma o declina.
 */
export function CateringView({ restaurant, packages }: Props) {
  const [lang, setLang] = useState<StorefrontLang>(() => detectStorefrontLang(restaurant.slug))
  const changeLang = (next: StorefrontLang) => {
    setLang(next)
    try {
      localStorage.setItem(`foodos-lang-${restaurant.slug}`, next)
    } catch {
      /* storage privado */
    }
  }

  const first = packages[0]
  const [selectedId, setSelectedId] = useState<string>(first?.id ?? "")
  const selected = useMemo(
    () => packages.find((pkg) => pkg.id === selectedId) ?? first,
    [packages, selectedId, first]
  )

  const [headcount, setHeadcount] = useState<string>(() => String(first?.minPeople ?? 10))
  const [eventDate, setEventDate] = useState("")
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [email, setEmail] = useState("")
  const [notes, setNotes] = useState("")

  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState<{ total: number } | null>(null)

  // Vista previa del total: mismo cálculo que hará el servidor, para que el
  // comensal sepa cuánto cuesta antes de enviar.
  const quote = useMemo(() => {
    if (!selected) return null
    const people = Number(headcount)
    if (!Number.isFinite(people) || people <= 0) return null
    const result = quoteCatering({ package: selected, headcount: people })
    return result.ok ? result.quote : null
  }, [selected, headcount])

  // La barra inferior es de esta página, así que publica su altura en
  // `--cart-bar-h` y marca `body.cart-bar-active`: el mismo mecanismo que el
  // carrito del micrositio, para que el WhatsApp flotante global y el aviso de
  // cookies suban por encima en vez de chocar.
  const barRef = useRef<HTMLDivElement>(null)
  const barVisible = Boolean(selected) && sent === null
  useEffect(() => {
    if (typeof document === "undefined") return
    const bar = barRef.current
    if (barVisible && bar) {
      const publish = () => {
        document.documentElement.style.setProperty("--cart-bar-h", `${bar.offsetHeight}px`)
      }
      publish()
      const observer = new ResizeObserver(publish)
      observer.observe(bar)
      document.body.classList.add("cart-bar-active")
      return () => {
        observer.disconnect()
        document.body.classList.remove("cart-bar-active")
      }
    }
    document.body.classList.remove("cart-bar-active")
  }, [barVisible])

  const pickPackage = (pkg: CateringPackage) => {
    setSelectedId(pkg.id)
    setHeadcount(String(pkg.minPeople))
    setEventDate("")
    setError(null)
  }

  const money = (amount: number) => formatMoney(amount, restaurant.currency)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!selected || sending) return
    setError(null)

    if (!name.trim() || phone.replace(/\D/g, "").length < 10) {
      setError(sf(lang, "cateringContactRequired"))
      return
    }
    const people = Number(headcount)
    if (!Number.isFinite(people) || people <= 0) {
      setError(sf(lang, "cateringHeadcountRequired"))
      return
    }
    if (!eventDate) {
      setError(sf(lang, "cateringDateRequired"))
      return
    }
    // La anticipación se comprueba aquí para dar el error en el idioma del
    // comensal y antes de gastar una petición; el servidor lo revalida igual.
    const hoursAway = (Date.parse(eventDate) - Date.now()) / (60 * 60 * 1000)
    if (Number.isFinite(hoursAway) && hoursAway < selected.leadTimeHours) {
      setError(fill(sf(lang, "cateringLeadError"), { n: selected.leadTimeHours }))
      return
    }

    setSending(true)
    try {
      const response = await fetch("/api/foodos/catering/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: restaurant.slug,
          package_id: selected.id,
          headcount: people,
          event_date: eventDate,
          customer_name: name,
          customer_phone: phone,
          customer_email: email,
          notes,
        }),
      })
      const data = (await response.json()) as { error?: string; total?: number | null }
      if (!response.ok) {
        setError(data.error ?? sf(lang, "cateringError"))
        return
      }
      setSent({ total: data.total ?? quote?.total ?? 0 })
    } catch {
      setError(sf(lang, "cateringError"))
    } finally {
      setSending(false)
    }
  }

  if (sent) {
    return (
      <main className="min-h-dvh bg-stone-50 px-4 py-10">
        <section className="mx-auto w-full max-w-md rounded-3xl bg-white p-6 text-center shadow-sm ring-1 ring-stone-200">
          <PartyPopper className="mx-auto h-10 w-10 text-amber-500" aria-hidden="true" />
          <h1 className="mt-3 text-xl font-black text-stone-900">{sf(lang, "cateringSent")}</h1>
          <p className="mt-2 text-sm text-stone-600">{sf(lang, "cateringSentHint")}</p>
          <dl className="mt-5 rounded-2xl bg-stone-50 px-4 py-3 text-left">
            <dt className="text-xs font-semibold uppercase tracking-wide text-stone-500">
              {sf(lang, "cateringTotal")}
            </dt>
            <dd className="text-2xl font-black text-stone-900">{money(sent.total)}</dd>
          </dl>
          <Link
            href={`/r/${restaurant.slug}`}
            className="touch-target mt-6 flex items-center justify-center gap-2 rounded-full bg-stone-900 px-5 py-3 text-sm font-semibold text-white hover:bg-stone-700"
          >
            {sf(lang, "cateringBack")}
          </Link>
        </section>
      </main>
    )
  }

  return (
    <main className="min-h-dvh bg-stone-50 pb-28">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-4">
          <Link href={`/r/${restaurant.slug}`} className="flex min-w-0 items-center gap-3">
            {restaurant.logoUrl ? (
              <Image
                src={restaurant.logoUrl}
                alt={restaurant.name}
                width={40}
                height={40}
                className="h-10 w-10 rounded-full object-cover"
              />
            ) : (
              <span
                aria-hidden="true"
                className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500 font-black text-amber-950"
              >
                {restaurant.name.charAt(0).toUpperCase()}
              </span>
            )}
            <span className="min-w-0">
              <span className="block truncate text-sm font-black text-stone-900">
                {restaurant.name}
              </span>
              <span className="block truncate text-xs text-stone-500">
                {sf(lang, "cateringTitle")}
              </span>
            </span>
          </Link>
          <button
            type="button"
            onClick={() => changeLang(lang === "es" ? "en" : "es")}
            className="touch-target rounded-full border border-stone-200 bg-white px-3 py-2 text-xs font-bold text-stone-600 hover:bg-stone-50"
            aria-label="Cambiar idioma / Switch language"
          >
            {lang === "es" ? "EN" : "ES"}
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 py-6">
        <h1 className="text-2xl font-black text-stone-900">{sf(lang, "cateringTitle")}</h1>
        <p className="mt-1 text-sm text-stone-600">{sf(lang, "cateringSubtitle")}</p>

        <form id="catering-form" onSubmit={submit} className="mt-6 space-y-6">
          <section>
            <h2 className="text-sm font-bold uppercase tracking-wide text-stone-500">
              {sf(lang, "cateringPickPackage")}
            </h2>
            <ul className="mt-3 space-y-3">
              {packages.map((pkg) => {
                const active = pkg.id === selected?.id
                return (
                  <li key={pkg.id}>
                    <button
                      type="button"
                      onClick={() => pickPackage(pkg)}
                      aria-pressed={active}
                      className={`w-full rounded-2xl border p-4 text-left transition-colors motion-reduce:transition-none ${
                        active
                          ? "border-amber-400 bg-amber-50"
                          : "border-stone-200 bg-white hover:border-stone-300"
                      }`}
                    >
                      <span className="flex items-start justify-between gap-3">
                        <span className="min-w-0">
                          <span className="block font-bold text-stone-900">{pkg.name}</span>
                          {pkg.description && (
                            <span className="mt-1 block text-xs text-stone-600">
                              {pkg.description}
                            </span>
                          )}
                        </span>
                        <span className="shrink-0 text-right">
                          <span className="block text-lg font-black text-stone-900">
                            {money(pkg.pricePerPerson)}
                          </span>
                          <span className="block text-[10px] uppercase tracking-wide text-stone-500">
                            {sf(lang, "cateringPerPerson")}
                          </span>
                        </span>
                      </span>
                      <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-semibold text-stone-600">
                        <span className="inline-flex items-center gap-1">
                          <Users className="h-3 w-3" aria-hidden="true" />
                          {pkg.maxPeople === null
                            ? fill(sf(lang, "cateringMinPeople"), { n: pkg.minPeople })
                            : fill(sf(lang, "cateringHeadcountHint"), {
                                min: pkg.minPeople,
                                max: pkg.maxPeople,
                              })}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3 w-3" aria-hidden="true" />
                          {fill(sf(lang, "cateringLeadTime"), { n: pkg.leadTimeHours })}
                        </span>
                      </span>
                      {pkg.includes.length > 0 && (
                        <span className="mt-3 block border-t border-stone-200 pt-2">
                          <span className="text-[10px] font-bold uppercase tracking-wide text-stone-500">
                            {sf(lang, "cateringIncludes")}
                          </span>
                          <span className="mt-1 flex flex-wrap gap-1">
                            {pkg.includes.map((entry) => (
                              <span
                                key={entry}
                                className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-stone-700 ring-1 ring-stone-200"
                              >
                                <Check className="h-3 w-3 text-emerald-600" aria-hidden="true" />
                                {entry}
                              </span>
                            ))}
                          </span>
                        </span>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>

          {selected && (
            <section className="rounded-2xl bg-white p-4 ring-1 ring-stone-200">
              <h2 className="text-sm font-bold uppercase tracking-wide text-stone-500">
                {sf(lang, "cateringQuote")}
              </h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-stone-600">
                    {sf(lang, "cateringHeadcount")}
                  </span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={selected.minPeople}
                    max={selected.maxPeople ?? MAX_HEADCOUNT}
                    value={headcount}
                    onChange={(event) => setHeadcount(event.target.value)}
                    className="touch-target w-full rounded-xl border border-stone-300 px-3 py-2 text-base text-stone-900"
                  />
                  <span className="mt-1 block text-[11px] text-stone-500">
                    {selected.maxPeople === null
                      ? fill(sf(lang, "cateringHeadcountMin"), { min: selected.minPeople })
                      : fill(sf(lang, "cateringHeadcountHint"), {
                          min: selected.minPeople,
                          max: selected.maxPeople,
                        })}
                  </span>
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-stone-600">
                    {sf(lang, "cateringEventDate")}
                  </span>
                  <input
                    type="date"
                    required
                    value={eventDate}
                    onChange={(event) => setEventDate(event.target.value)}
                    className="touch-target w-full rounded-xl border border-stone-300 px-3 py-2 text-base text-stone-900"
                  />
                  <span className="mt-1 block text-[11px] text-stone-500">
                    {fill(sf(lang, "cateringLeadTime"), { n: selected.leadTimeHours })}
                  </span>
                </label>
              </div>

              <div aria-live="polite" className="mt-4 rounded-xl bg-stone-50 px-4 py-3">
                {quote ? (
                  <>
                    <span className="block text-xs font-semibold uppercase tracking-wide text-stone-500">
                      {sf(lang, "cateringEstimated")}
                    </span>
                    <span className="block text-2xl font-black text-stone-900">
                      {money(quote.total)}
                    </span>
                    <span className="mt-1 block text-[11px] text-stone-600">
                      {money(quote.pricePerPerson)} × {quote.headcount}
                      {quote.chargedMinimum
                        ? ` · ${fill(sf(lang, "cateringChargedMinimum"), {
                            n: selected.minPeople,
                          })}`
                        : ""}
                    </span>
                  </>
                ) : (
                  <span className="block text-sm text-stone-600">
                    {sf(lang, "cateringQuotePending")}
                  </span>
                )}
              </div>
            </section>
          )}

          <section className="rounded-2xl bg-white p-4 ring-1 ring-stone-200">
            <h2 className="text-sm font-bold uppercase tracking-wide text-stone-500">
              {sf(lang, "yourData")}
            </h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-stone-600">
                  {sf(lang, "cateringName")}
                </span>
                <input
                  type="text"
                  required
                  autoComplete="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="touch-target w-full rounded-xl border border-stone-300 px-3 py-2 text-base text-stone-900"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-stone-600">
                  {sf(lang, "cateringPhone")}
                </span>
                <input
                  type="tel"
                  required
                  inputMode="tel"
                  autoComplete="tel"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  className="touch-target w-full rounded-xl border border-stone-300 px-3 py-2 text-base text-stone-900"
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="mb-1 block text-xs font-semibold text-stone-600">
                  {sf(lang, "cateringEmail")}
                </span>
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="touch-target w-full rounded-xl border border-stone-300 px-3 py-2 text-base text-stone-900"
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="mb-1 block text-xs font-semibold text-stone-600">
                  {sf(lang, "cateringNotes")}
                </span>
                <textarea
                  rows={3}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  className="w-full rounded-xl border border-stone-300 px-3 py-2 text-base text-stone-900"
                />
              </label>
            </div>

            {error && (
              <p
                role="alert"
                className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700"
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={sending}
              className="touch-target mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-stone-900 px-5 py-3 text-sm font-bold text-white hover:bg-stone-700 disabled:opacity-60"
            >
              {sending ? (
                <>
                  <Loader2
                    className="h-4 w-4 animate-spin motion-reduce:animate-none"
                    aria-hidden="true"
                  />
                  {sf(lang, "cateringSending")}
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" aria-hidden="true" />
                  {sf(lang, "cateringSend")}
                </>
              )}
            </button>
          </section>

          <p className="text-[11px] text-stone-500">{sf(lang, "cateringSentHint")}</p>

          <Link
            href={`/r/${restaurant.slug}`}
            className="touch-target inline-flex items-center gap-1 text-sm font-semibold text-stone-600 hover:text-stone-900"
          >
            <ChevronRight className="h-4 w-4 rotate-180" aria-hidden="true" />
            {sf(lang, "cateringBack")}
          </Link>
        </form>
      </div>

      {barVisible && selected && (
        <div
          ref={barRef}
          className="fixed inset-x-0 bottom-0 border-t border-stone-200 bg-white/95 backdrop-blur"
          style={{ paddingBottom: "var(--inset-bottom)" }}
        >
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
            <span className="min-w-0">
              <span className="block truncate text-[11px] font-semibold uppercase tracking-wide text-stone-500">
                {sf(lang, "cateringEstimated")}
              </span>
              <span className="flex items-center gap-1 text-lg font-black text-stone-900">
                <CalendarDays className="h-4 w-4 text-stone-400" aria-hidden="true" />
                {quote ? money(quote.total) : "—"}
              </span>
            </span>
            <button
              type="submit"
              form="catering-form"
              disabled={sending}
              className="touch-target rounded-full bg-stone-900 px-5 py-3 text-sm font-bold text-white hover:bg-stone-700 disabled:opacity-60"
            >
              {sf(lang, "cateringSend")}
            </button>
          </div>
        </div>
      )}
    </main>
  )
}
