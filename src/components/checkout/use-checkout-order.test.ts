import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * No hay @testing-library/react en el proyecto (ver package.json) y Vitest
 * corre en environment "node", así que no se puede montar el hook con React.
 * En su lugar se mockea "react" con un mini-harness síncrono:
 *  - useState/useRef persisten en slots entre "renders" (re-invocaciones del hook)
 *  - useEffect ejecuta su callback de inmediato (los efectos del hook son
 *    idempotentes con los mocks de abajo)
 *  - useCallback devuelve la función tal cual (siempre fresca por render)
 * Así se testea la lógica de createOrder/onPaid como funciones puras.
 */
const hooks = vi.hoisted(() => {
  const states: unknown[] = []
  const refs: { current: unknown }[] = []
  return { states, refs, stateIdx: 0, refIdx: 0 }
})

vi.mock("react", () => ({
  useState: (init: unknown) => {
    const i = hooks.stateIdx++
    if (hooks.states.length <= i) {
      hooks.states.push(typeof init === "function" ? (init as () => unknown)() : init)
    }
    const set = (v: unknown) => {
      hooks.states[i] =
        typeof v === "function" ? (v as (p: unknown) => unknown)(hooks.states[i]) : v
    }
    return [hooks.states[i], set]
  },
  useRef: (init: unknown) => {
    const i = hooks.refIdx++
    if (hooks.refs.length <= i) hooks.refs.push({ current: init })
    return hooks.refs[i]
  },
  useEffect: (cb: () => unknown) => {
    cb()
  },
  useCallback: (fn: unknown) => fn,
}))

// Sesión configurable: null = invitado, objeto = usuario logueado
const authState = vi.hoisted(() => ({
  user: null as null | { id: string; email?: string },
}))

vi.mock("@/lib/supabase/client", () => ({
  createClient: vi.fn(() => {
    // Builder encadenable genérico (profiles / addresses) que resuelve vacío
    const builder: Record<string, unknown> = {}
    for (const m of ["select", "eq", "order"]) builder[m] = vi.fn().mockReturnValue(builder)
    builder.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })
    builder.then = (resolve: (v: unknown) => void) => resolve({ data: [], error: null })
    return {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: authState.user } }),
      },
      from: vi.fn(() => builder),
    }
  }),
}))

vi.mock("@/lib/analytics", () => ({ AnalyticsEvents: { lead: vi.fn() } }))
vi.mock("@/lib/guest-address", () => ({
  getGuestToken: vi.fn(() => "gt-0"),
  saveGuestToken: vi.fn(),
  getLastAddress: vi.fn(() => null),
  saveLastAddress: vi.fn(),
  claimGuestAddresses: vi.fn(),
}))
vi.mock("@/lib/utm", () => ({
  getStoredUtm: vi.fn(() => ({ source: "ig", medium: "story" })),
}))

import { useCheckoutOrder, type CheckoutOrderOptions } from "./use-checkout-order"
import { saveGuestToken, saveLastAddress } from "@/lib/guest-address"
import type { City, CartItem } from "@/types"
import type { SelectedBump } from "./BumpCards"

const CITY: City = { id: 3, name: "CDMX", slug: "cdmx", state: "CDMX", lat: 0, lng: 0, is_active: true }

const CART_ITEM: CartItem = {
  product_id: 7,
  name: "Aguacate",
  slug: "aguacate",
  image_url: "",
  brand: "",
  price: 50,
  sale_price: 45,
  quantity: 2,
  stock_status: "in_stock",
}

const BUMP: SelectedBump = { ruleId: 1, productId: 99, quantity: 1, unitPrice: 29 }

const REPURCHASE = {
  code: "VOLVE10",
  discount_type: "percentage" as const,
  discount_value: 10,
  min_order: 200,
  expires_at: "2026-10-12T00:00:00Z",
}

const ORDER_RESPONSE = {
  orderId: 101,
  cashbackCredits: 20,
  cashbackTier: "Verde",
  repurchaseCoupon: REPURCHASE,
  trackingToken: "tok-9",
  guestToken: "gt-1",
}

const fetchMock = vi.fn()
vi.stubGlobal("fetch", fetchMock)

function jsonResponse(data: unknown, ok = true) {
  return { ok, json: vi.fn().mockResolvedValue(data) }
}

function makeOptions(overrides: Partial<CheckoutOrderOptions> = {}): CheckoutOrderOptions {
  return {
    city: CITY,
    address: {
      label: "Casa",
      street: "Av. Siempre Viva",
      number: "123",
      interior: "",
      neighborhood: "Centro",
      zip_code: "06000",
      references: "",
    },
    schedule: { date: "2026-09-13", time: "10:00 AM — 12:00 PM" },
    phone: "5551234567",
    email: "cliente@x.mx",
    coupon: { code: "BIENVENIDO" },
    cartItems: [CART_ITEM],
    selectedBumps: [BUMP],
    effectiveSubtotal: 400,
    deliveryFee: 35,
    total: 435,
    leadSource: "checkout_page",
    setAddress: vi.fn(),
    setPhone: vi.fn(),
    setEmail: vi.fn(),
    onPaid: vi.fn(),
    onAfterOrderCreated: vi.fn(),
    ...overrides,
  }
}

/** "Render": re-invoca el hook con el estado persistido en los slots. */
function render(opts: CheckoutOrderOptions) {
  hooks.stateIdx = 0
  hooks.refIdx = 0
  return useCheckoutOrder(opts)
}

/** Primer render corre los efectos (sesión); se flushean microtasks (getUser)
 * y el segundo render expone callbacks frescos con isLoggedIn ya resuelto. */
async function mount(opts: CheckoutOrderOptions) {
  render(opts)
  await new Promise((r) => setImmediate(r))
  return render(opts)
}

function lastOrdersCall() {
  const call = fetchMock.mock.calls.find((c) => c[0] === "/api/orders")
  expect(call).toBeDefined()
  return JSON.parse(call![1]?.body as string) as Record<string, unknown>
}

describe("useCheckoutOrder · createOrder", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    hooks.states.length = 0
    hooks.refs.length = 0
    authState.user = null
  })

  it("sin ciudad: error local y nunca llama a la API", async () => {
    const opts = makeOptions({ city: null })
    const r = await mount(opts)
    const result = await r.createOrder()
    expect(result).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(render(opts).checkoutError).toBe(
      "No se pudo determinar tu ciudad. Recarga la página."
    )
  })

  it("construye el payload POST /api/orders (invitado: guest_token, items + bumps, utm)", async () => {
    fetchMock.mockResolvedValue(jsonResponse(ORDER_RESPONSE))
    const opts = makeOptions()
    const r = await mount(opts)
    await r.createOrder()

    const [url, init] = fetchMock.mock.calls.find((c) => c[0] === "/api/orders")!
    expect(url).toBe("/api/orders")
    expect(init?.method).toBe("POST")

    const body = lastOrdersCall()
    expect(body).toMatchObject({
      city_id: 3,
      guest_token: "gt-0",
      payment_method: "card",
      phone: "5551234567",
      email: "cliente@x.mx",
      subtotal: 400,
      delivery_fee: 35,
      total: 435,
      coupon_code: "BIENVENIDO",
      utm: { source: "ig", medium: "story" },
      address: { street: "Av. Siempre Viva", number: "123", zip_code: "06000" },
      schedule: { date: "2026-09-13", time: "10:00 AM — 12:00 PM" },
    })
    // Invitado: no se envían address_id ni save_default
    expect(body).not.toHaveProperty("address_id")
    expect(body).not.toHaveProperty("save_default")
    // Items: sale_price tiene prioridad; bump con item_type y nombre de respaldo
    expect(body.items).toEqual([
      { product_id: 7, quantity: 2, unit_price: 45, name: "Aguacate" },
      {
        product_id: 99,
        quantity: 1,
        unit_price: 29,
        name: "Artículo especial #99",
        item_type: "bump",
      },
    ])
  })

  it("logueado: envía save_default y no envía guest_token", async () => {
    authState.user = { id: "u1", email: "u@x.mx" }
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(
        jsonResponse(url === "/api/orders" ? { ...ORDER_RESPONSE, guestToken: undefined } : null, true)
      )
    )
    const opts = makeOptions({ saveDefault: true })
    const r = await mount(opts)
    await r.createOrder()

    const body = lastOrdersCall()
    expect(body.save_default).toBe(true)
    expect(body).not.toHaveProperty("guest_token")
  })

  it("parsea la respuesta: orderId, cashback, repurchaseCoupon y trackingToken", async () => {
    fetchMock.mockResolvedValue(jsonResponse(ORDER_RESPONSE))
    const opts = makeOptions()
    const r = await mount(opts)
    const created = await r.createOrder()

    expect(created).toEqual({
      orderId: 101,
      cashback: { credits: 20, tier: "Verde" },
      repurchaseCoupon: REPURCHASE,
      trackingToken: "tok-9",
    })
    // Efectos laterales de invitado + callback post-creación
    expect(saveGuestToken).toHaveBeenCalledWith("gt-1")
    expect(saveLastAddress).toHaveBeenCalledWith(
      expect.objectContaining({ street: "Av. Siempre Viva", phone: "5551234567" })
    )
    expect(opts.onAfterOrderCreated).toHaveBeenCalledTimes(1)
    // El estado del hook conserva el cupón y el token para el post-pago
    const fresh = render(opts)
    expect(fresh.checkoutError).toBeNull()
  })

  it("cashback/cupón/token ausentes en la respuesta: valores por defecto", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ orderId: 55 }))
    const opts = makeOptions()
    const created = await (await mount(opts)).createOrder()
    expect(created).toEqual({
      orderId: 55,
      cashback: { credits: 0, tier: null },
      repurchaseCoupon: null,
      trackingToken: null,
    })
    expect(saveGuestToken).not.toHaveBeenCalled()
  })

  it("error de API con detail: checkoutError combina error y detalle", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: "Error al crear el pedido", detail: "columna utm_source no existe" }, false)
    )
    const opts = makeOptions()
    const created = await (await mount(opts)).createOrder()
    expect(created).toBeNull()
    expect(render(opts).checkoutError).toBe(
      "Error al crear el pedido — columna utm_source no existe"
    )
    expect(opts.onAfterOrderCreated).not.toHaveBeenCalled()
  })

  it("error de API sin detail: solo el mensaje de error", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: "Cupón inválido" }, false))
    const opts = makeOptions()
    await (await mount(opts)).createOrder()
    expect(render(opts).checkoutError).toBe("Cupón inválido")
  })

  it("respuesta ok sin orderId: error genérico de creación", async () => {
    fetchMock.mockResolvedValue(jsonResponse({}))
    const opts = makeOptions()
    const created = await (await mount(opts)).createOrder()
    expect(created).toBeNull()
    expect(render(opts).checkoutError).toBe("No se pudo crear el pedido. Intenta de nuevo.")
  })

  it("fetch rechaza: checkoutError con el mensaje de la excepción", async () => {
    fetchMock.mockRejectedValue(new Error("network down"))
    const opts = makeOptions()
    const created = await (await mount(opts)).createOrder()
    expect(created).toBeNull()
    expect(render(opts).checkoutError).toBe("network down")

    fetchMock.mockRejectedValue("boom")
    await render(opts).createOrder()
    expect(render(opts).checkoutError).toBe("Error de conexión. Intenta de nuevo.")
  })
})

describe("useCheckoutOrder · flujo onPaid", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    hooks.states.length = 0
    hooks.refs.length = 0
    authState.user = null
  })

  it("handleStripeSuccess incluye trackingToken y repurchaseCoupon en el callback", async () => {
    fetchMock.mockResolvedValue(jsonResponse(ORDER_RESPONSE))
    const opts = makeOptions()
    const created = await (await mount(opts)).createOrder()
    expect(created).not.toBeNull()

    render(opts).handleStripeSuccess("pi_123", {
      orderId: created!.orderId,
      cashback: created!.cashback,
    })
    expect(opts.onPaid).toHaveBeenCalledWith({
      orderId: 101,
      cashback: { credits: 20, tier: "Verde" },
      paymentIntentId: "pi_123",
      repurchaseCoupon: REPURCHASE,
      trackingToken: "tok-9",
    })
  })

  it("handlePlaceOrder con método no-tarjeta paga directo y propaga cupón/token", async () => {
    fetchMock.mockResolvedValue(jsonResponse(ORDER_RESPONSE))
    const opts = makeOptions()
    await (await mount(opts)).handlePlaceOrder("spei")

    // SPEI no debe inicializar Stripe: solo 1 fetch (la creación de la orden)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(opts.onPaid).toHaveBeenCalledWith({
      orderId: 101,
      cashback: { credits: 20, tier: "Verde" },
      paymentIntentId: "",
      repurchaseCoupon: REPURCHASE,
      trackingToken: "tok-9",
    })
  })

  it("handlePlaceOrder con orden fallida no invoca onPaid", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: "sin stock" }, false))
    const opts = makeOptions()
    await (await mount(opts)).handlePlaceOrder("spei")
    expect(opts.onPaid).not.toHaveBeenCalled()
    expect(render(opts).checkoutError).toBe("sin stock")
  })
})
