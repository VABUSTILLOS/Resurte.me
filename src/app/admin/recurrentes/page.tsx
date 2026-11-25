"use client"

import { useCallback, useEffect, useState } from "react"
import { CalendarClock, Pause, Play, Plus, Search, Trash2, X } from "lucide-react"

/**
 * Recurrentes y precios (Ola 5, 00234).
 *
 * Dos herramientas del dominio Clientes:
 * - Pedidos recurrentes: la plantilla del pedido fijo de un
 *   restaurante (artículos, frecuencia, dirección y método
 *   habituales). El cron diario genera el pedido real; aquí se
 *   crea, se pausa, se reanuda y se cancela, y se ve el
 *   desenlace del último ciclo.
 * - Precios especiales: el precio fijo de un producto para un
 *   cliente. Solo aplica en su sesión web; el servidor lo
 *   recalcula en el checkout.
 *
 * Sin la migración 00234 ambas secciones lo declaran y no hay
 * nada que operar (la tienda sigue vendiendo como siempre).
 */

interface CustomerHit {
  id: string
  full_name: string | null
  phone: string | null
}

interface AddressHit {
  id: number
  label: string | null
  street: string
  number: string
  neighborhood: string
  is_default: boolean
}

interface TemplateItem {
  product_id: number
  variant_id: number | null
  quantity: number
  product_name: string | null
}

interface Template {
  id: string
  user_id: string
  name: string | null
  items: TemplateItem[]
  frequency: string
  schedule_text: string
  payment_method: string
  status: string
  next_run_on: string
  last_run_on: string | null
  last_result: string | null
  last_order_id: number | null
  customer_name: string | null
  customer_phone: string | null
}

interface SpecialPrice {
  id: string
  product_id: number
  price: number
  product_name: string | null
  public_price: number | null
}

const WEEKDAYS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"]

const PAYMENT_LABEL: Record<string, string> = {
  cash_on_delivery: "Contra entrega",
  spei: "SPEI",
  oxxo: "OXXO",
  mercado_pago: "Mercado Pago",
  codi: "CoDi",
}

const RESULT_LABEL: Record<string, string> = {
  created: "Pedido creado",
  below_minimum: "No llegó al mínimo de $500",
  insufficient_stock: "Faltó existencia",
  quantity_violation: "Cantidad fuera de mín/máx",
  invalid_items: "Un artículo ya no se vende así",
  error: "Error al generarlo",
}

const inputCls =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
const btnCls =
  "inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
const ghostBtnCls =
  "inline-flex items-center gap-1 rounded-lg border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"

function CustomerPicker({
  selected,
  onSelect,
}: {
  selected: CustomerHit | null
  onSelect: (c: CustomerHit | null) => void
}) {
  const [query, setQuery] = useState("")
  const [hits, setHits] = useState<CustomerHit[]>([])

  useEffect(() => {
    // El setState vive dentro del temporizador/promesa, nunca
    // síncrono en el cuerpo del efecto (react-hooks/set-state-in-effect).
    const t = setTimeout(async () => {
      if (query.trim().length < 2) {
        setHits([])
        return
      }
      try {
        const res = await fetch(`/api/admin/customers/search?q=${encodeURIComponent(query.trim())}`)
        const data = (await res.json()) as { customers?: CustomerHit[] }
        setHits(data.customers ?? [])
      } catch {
        setHits([])
      }
    }, 300)
    return () => clearTimeout(t)
  }, [query])

  if (selected) {
    return (
      <div className="flex items-center justify-between rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm">
        <span>
          <strong>{selected.full_name ?? "Sin nombre"}</strong>
          {selected.phone ? <span className="text-gray-500"> · {selected.phone}</span> : null}
        </span>
        <button type="button" className={ghostBtnCls} onClick={() => onSelect(null)}>
          <X className="h-3.5 w-3.5" /> Cambiar
        </button>
      </div>
    )
  }

  return (
    <div className="relative">
      <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-600" />
      <input
        className={`${inputCls} pl-9`}
        placeholder="Busca al cliente por nombre o teléfono…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {hits.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg">
          {hits.map((h) => (
            <li key={h.id}>
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50"
                onClick={() => {
                  onSelect(h)
                  setHits([])
                  setQuery("")
                }}
              >
                <strong>{h.full_name ?? "Sin nombre"}</strong>
                {h.phone ? <span className="text-gray-500"> · {h.phone}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

interface ItemDraft {
  product_id: string
  variant_id: string
  quantity: string
}

export default function RecurrentesPage() {
  const [available, setAvailable] = useState<boolean | null>(null)
  const [templates, setTemplates] = useState<Template[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  // ── Formulario de alta ──
  const [customer, setCustomer] = useState<CustomerHit | null>(null)
  const [addresses, setAddresses] = useState<AddressHit[]>([])
  const [addressId, setAddressId] = useState<string>("")
  const [name, setName] = useState("")
  const [frequency, setFrequency] = useState("weekly")
  const [weekday, setWeekday] = useState("1")
  const [dayOfMonth, setDayOfMonth] = useState("1")
  const [paymentMethod, setPaymentMethod] = useState("cash_on_delivery")
  const [items, setItems] = useState<ItemDraft[]>([{ product_id: "", variant_id: "", quantity: "1" }])
  const [creating, setCreating] = useState(false)

  // ── Precios especiales ──
  const [priceCustomer, setPriceCustomer] = useState<CustomerHit | null>(null)
  const [prices, setPrices] = useState<SpecialPrice[]>([])
  const [priceProductId, setPriceProductId] = useState("")
  const [priceValue, setPriceValue] = useState("")
  const [priceBusy, setPriceBusy] = useState(false)

  // Fetchers puros (sin setState): el efecto de montaje encadena
  // la promesa y escribe al resolver; los manejadores recargan
  // con las versiones que sí escriben (react-hooks/set-state-in-effect).
  const fetchTemplates = useCallback(async (): Promise<{ available: boolean; templates: Template[] }> => {
    try {
      const res = await fetch("/api/admin/recurring-orders")
      const data = (await res.json()) as { available?: boolean; templates?: Template[] }
      return { available: data.available ?? false, templates: data.templates ?? [] }
    } catch {
      return { available: false, templates: [] }
    }
  }, [])

  const loadTemplates = useCallback(async () => {
    const data = await fetchTemplates()
    setAvailable(data.available)
    setTemplates(data.templates)
  }, [fetchTemplates])

  useEffect(() => {
    let cancelled = false
    void fetchTemplates().then((data) => {
      if (cancelled) return
      setAvailable(data.available)
      setTemplates(data.templates)
    })
    return () => {
      cancelled = true
    }
  }, [fetchTemplates])

  const fetchAddresses = useCallback(async (userId: string): Promise<AddressHit[]> => {
    try {
      const res = await fetch(`/api/admin/customers/search?user_id=${userId}`)
      const data = (await res.json()) as { addresses?: AddressHit[] }
      return data.addresses ?? []
    } catch {
      return []
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const pending = customer ? fetchAddresses(customer.id) : Promise.resolve<AddressHit[]>([])
    void pending.then((rows) => {
      if (cancelled) return
      setAddresses(rows)
      setAddressId("")
    })
    return () => {
      cancelled = true
    }
  }, [customer, fetchAddresses])

  const fetchPrices = useCallback(async (userId: string): Promise<SpecialPrice[]> => {
    try {
      const res = await fetch(`/api/admin/customer-prices?user_id=${userId}`)
      const data = (await res.json()) as { prices?: SpecialPrice[] }
      return data.prices ?? []
    } catch {
      return []
    }
  }, [])

  const loadPrices = useCallback(
    async (userId: string) => {
      setPrices(await fetchPrices(userId))
    },
    [fetchPrices]
  )

  useEffect(() => {
    let cancelled = false
    const pending = priceCustomer
      ? fetchPrices(priceCustomer.id)
      : Promise.resolve<SpecialPrice[]>([])
    void pending.then((rows) => {
      if (!cancelled) setPrices(rows)
    })
    return () => {
      cancelled = true
    }
  }, [priceCustomer, fetchPrices])

  async function changeStatus(t: Template, status: string) {
    setBusyId(t.id)
    setError(null)
    try {
      const res = await fetch(`/api/admin/recurring-orders/${t.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      })
      const data = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(data.error ?? "No se pudo guardar")
      await loadTemplates()
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar")
    } finally {
      setBusyId(null)
    }
  }

  async function createTemplate(e: React.FormEvent) {
    e.preventDefault()
    if (!customer) {
      setError("Elige primero al cliente")
      return
    }
    setCreating(true)
    setError(null)
    try {
      const res = await fetch("/api/admin/recurring-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: customer.id,
          name: name || null,
          frequency,
          weekday: frequency === "monthly" ? undefined : Number(weekday),
          day_of_month: frequency === "monthly" ? Number(dayOfMonth) : undefined,
          payment_method: paymentMethod,
          address_id: addressId ? Number(addressId) : null,
          items: items
            .filter((i) => i.product_id)
            .map((i) => ({
              product_id: Number(i.product_id),
              variant_id: i.variant_id ? Number(i.variant_id) : null,
              quantity: Number(i.quantity) || 1,
            })),
        }),
      })
      const data = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(data.error ?? "No se pudo crear")
      setName("")
      setItems([{ product_id: "", variant_id: "", quantity: "1" }])
      await loadTemplates()
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear")
    } finally {
      setCreating(false)
    }
  }

  async function addPrice(e: React.FormEvent) {
    e.preventDefault()
    if (!priceCustomer) return
    setPriceBusy(true)
    setError(null)
    try {
      const res = await fetch("/api/admin/customer-prices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: priceCustomer.id,
          product_id: Number(priceProductId),
          price: Number(priceValue),
        }),
      })
      const data = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(data.error ?? "No se pudo guardar")
      setPriceProductId("")
      setPriceValue("")
      await loadPrices(priceCustomer.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar")
    } finally {
      setPriceBusy(false)
    }
  }

  async function removePrice(p: SpecialPrice) {
    if (!priceCustomer) return
    setPriceBusy(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/admin/customer-prices?user_id=${priceCustomer.id}&product_id=${p.product_id}`,
        { method: "DELETE" }
      )
      const data = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(data.error ?? "No se pudo eliminar")
      await loadPrices(priceCustomer.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo eliminar")
    } finally {
      setPriceBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-4 sm:p-6">
      <header>
        <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900">
          <CalendarClock className="h-6 w-6 text-emerald-700" />
          Recurrentes y precios por cliente
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          El pedido fijo de cada restaurante se genera solo el día que toca, con los precios de
          ese momento. El precio especial solo aplica en la sesión web de ese cliente; en
          WhatsApp manda el precio público del catálogo.
        </p>
      </header>

      {available === false && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          La migración <strong>00234</strong> aún no se aplica en Supabase: las recurrencias y
          los precios especiales están inactivos y la tienda vende como siempre. Al correrla,
          esta pantalla se activa sola.
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* ── Alta de recurrencia ─────────────────────────── */}
      <section className="rounded-xl border border-gray-200 bg-white p-4 sm:p-5">
        <h2 className="mb-3 text-base font-semibold text-gray-900">Nueva recurrencia</h2>
        <form onSubmit={createTemplate} className="space-y-3">
          <CustomerPicker selected={customer} onSelect={setCustomer} />
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              className={inputCls}
              placeholder="Nombre (ej. Pedido semanal cocina)"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <select className={inputCls} value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} aria-label="Método de pago habitual">
              {Object.entries(PAYMENT_LABEL).map(([v, label]) => (
                <option key={v} value={v}>
                  Pago habitual: {label}
                </option>
              ))}
            </select>
            <select className={inputCls} value={frequency} onChange={(e) => setFrequency(e.target.value)} aria-label="Frecuencia">
              <option value="weekly">Semanal</option>
              <option value="biweekly">Quincenal</option>
              <option value="monthly">Mensual</option>
            </select>
            {frequency === "monthly" ? (
              <label className="flex items-center gap-2 text-sm text-gray-600">
                Día del mes
                <input
                  type="number"
                  min={1}
                  max={28}
                  className={inputCls}
                  value={dayOfMonth}
                  onChange={(e) => setDayOfMonth(e.target.value)}
                />
              </label>
            ) : (
              <select className={inputCls} value={weekday} onChange={(e) => setWeekday(e.target.value)} aria-label="Día de la semana">
                {WEEKDAYS.map((d, i) => (
                  <option key={d} value={i}>
                    {d}
                  </option>
                ))}
              </select>
            )}
            <select className={inputCls} value={addressId} onChange={(e) => setAddressId(e.target.value)} aria-label="Dirección de entrega">
              <option value="">Dirección: la preferida del cliente</option>
              {addresses.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label ? `${a.label} — ` : ""}
                  {a.street} {a.number}, {a.neighborhood}
                  {a.is_default ? " (predeterminada)" : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-700">
              Artículos (ID de producto; la presentación es el ID de variante de la Ola 3, si
              aplica)
            </p>
            {items.map((item, idx) => (
              <div key={idx} className="grid grid-cols-[1fr_1fr_90px_auto] gap-2">
                <input
                  className={inputCls}
                  placeholder="ID producto"
                  inputMode="numeric"
                  value={item.product_id}
                  onChange={(e) =>
                    setItems(items.map((it, i) => (i === idx ? { ...it, product_id: e.target.value } : it)))
                  }
                />
                <input
                  className={inputCls}
                  placeholder="ID presentación (opcional)"
                  inputMode="numeric"
                  value={item.variant_id}
                  onChange={(e) =>
                    setItems(items.map((it, i) => (i === idx ? { ...it, variant_id: e.target.value } : it)))
                  }
                />
                <input
                  className={inputCls}
                  placeholder="Cant."
                  inputMode="numeric"
                  value={item.quantity}
                  onChange={(e) =>
                    setItems(items.map((it, i) => (i === idx ? { ...it, quantity: e.target.value } : it)))
                  }
                />
                <button
                  type="button"
                  className={ghostBtnCls}
                  onClick={() => setItems(items.filter((_, i) => i !== idx))}
                  disabled={items.length === 1}
                  aria-label="Quitar artículo"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            <button
              type="button"
              className={ghostBtnCls}
              onClick={() => setItems([...items, { product_id: "", variant_id: "", quantity: "1" }])}
            >
              <Plus className="h-3.5 w-3.5" /> Agregar artículo
            </button>
          </div>

          <button type="submit" className={btnCls} disabled={creating || available === false}>
            {creating ? "Creando…" : "Crear recurrencia"}
          </button>
        </form>
      </section>

      {/* ── Lista de recurrencias ───────────────────────── */}
      <section className="rounded-xl border border-gray-200 bg-white p-4 sm:p-5">
        <h2 className="mb-3 text-base font-semibold text-gray-900">Recurrencias</h2>
        {templates.length === 0 ? (
          <p className="text-sm text-gray-500">Todavía no hay recurrencias registradas.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {templates.map((t) => (
              <li key={t.id} className="py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900">
                      {t.customer_name ?? "Cliente"}{" "}
                      <span className="font-normal text-gray-500">
                        · {t.name ?? t.schedule_text}
                      </span>
                    </p>
                    <p className="text-xs text-gray-500">
                      {t.schedule_text} · Pago: {PAYMENT_LABEL[t.payment_method] ?? t.payment_method}
                      {" · "}
                      {t.status === "active"
                        ? `Próximo pedido: ${t.next_run_on}`
                        : t.status === "paused"
                          ? "Pausada"
                          : "Cancelada"}
                      {t.last_result
                        ? ` · Último ciclo: ${RESULT_LABEL[t.last_result] ?? t.last_result}${
                            t.last_order_id ? ` (#${t.last_order_id})` : ""
                          }`
                        : ""}
                    </p>
                    <p className="mt-1 text-xs text-gray-600">
                      {t.items
                        .map((i) => `${i.quantity}× ${i.product_name ?? `Producto ${i.product_id}`}`)
                        .join(" · ")}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    {t.status === "active" && (
                      <button
                        className={ghostBtnCls}
                        disabled={busyId === t.id}
                        onClick={() => void changeStatus(t, "paused")}
                      >
                        <Pause className="h-3.5 w-3.5" /> Pausar
                      </button>
                    )}
                    {t.status !== "active" && t.status !== "cancelled" && (
                      <button
                        className={ghostBtnCls}
                        disabled={busyId === t.id}
                        onClick={() => void changeStatus(t, "active")}
                      >
                        <Play className="h-3.5 w-3.5" /> Reanudar
                      </button>
                    )}
                    {t.status !== "cancelled" && (
                      <button
                        className={ghostBtnCls}
                        disabled={busyId === t.id}
                        onClick={() => void changeStatus(t, "cancelled")}
                      >
                        <X className="h-3.5 w-3.5" /> Cancelar
                      </button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Precios especiales ──────────────────────────── */}
      <section className="rounded-xl border border-gray-200 bg-white p-4 sm:p-5">
        <h2 className="mb-1 text-base font-semibold text-gray-900">Precios especiales por cliente</h2>
        <p className="mb-3 text-xs text-gray-500">
          Precio fijo de un producto para un cliente. Nunca por debajo del costo cuando el
          producto lo tiene registrado. Para cambiarlo, guarda el mismo producto con el precio
          nuevo.
        </p>
        <CustomerPicker selected={priceCustomer} onSelect={setPriceCustomer} />
        {priceCustomer && (
          <>
            <ul className="mt-3 divide-y divide-gray-100">
              {prices.length === 0 && (
                <li className="py-2 text-sm text-gray-500">
                  Este cliente no tiene precios especiales: paga el precio público.
                </li>
              )}
              {prices.map((p) => (
                <li key={p.id} className="flex items-center justify-between py-2 text-sm">
                  <span>
                    {p.product_name ?? `Producto ${p.product_id}`}{" "}
                    <span className="text-gray-500">
                      · público ${p.public_price?.toFixed(2) ?? "—"} → especial{" "}
                      <strong className="text-emerald-700">${p.price.toFixed(2)}</strong>
                    </span>
                  </span>
                  <button
                    className={ghostBtnCls}
                    disabled={priceBusy}
                    onClick={() => void removePrice(p)}
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Quitar
                  </button>
                </li>
              ))}
            </ul>
            <form onSubmit={addPrice} className="mt-3 grid grid-cols-[1fr_1fr_auto] gap-2">
              <input
                className={inputCls}
                placeholder="ID de producto"
                inputMode="numeric"
                value={priceProductId}
                onChange={(e) => setPriceProductId(e.target.value)}
              />
              <input
                className={inputCls}
                placeholder="Precio especial $"
                inputMode="decimal"
                value={priceValue}
                onChange={(e) => setPriceValue(e.target.value)}
              />
              <button type="submit" className={btnCls} disabled={priceBusy || available === false}>
                <Plus className="h-4 w-4" /> Asignar
              </button>
            </form>
          </>
        )}
      </section>
    </div>
  )
}
