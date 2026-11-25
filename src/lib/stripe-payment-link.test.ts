import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const createSessionMock = vi.hoisted(() => vi.fn())

vi.mock("@/lib/stripe", () => ({
  getStripe: () => ({
    checkout: { sessions: { create: createSessionMock } },
  }),
}))
vi.mock("@/lib/order-emails", () => ({
  buildTrackingUrl: (city: string, id: number, token: string) =>
    `https://resurte.me/${city}/pedido/${id}?t=${token}`,
}))
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

import {
  getOrCreateOrderPaymentLink,
  PaymentLinkError,
  type PaymentLinkOrder,
} from "./stripe-payment-link"
import type { ServiceClient } from "./order-payments"

// Fake mínimo: orders (link persistido) y order_payments (libro).
interface FakeState {
  orderRow: Record<string, unknown>
  payments: Array<{ amount: number; status: string }>
  tableMissing: boolean
  updates: Array<Record<string, unknown>>
}

function makeFakeSupabase(state: FakeState) {
  function builder(table: string) {
    const calls: { method: string; args: unknown[] }[] = []
    const b: Record<string, unknown> = {}
    const record =
      (m: string) =>
      (...args: unknown[]) => {
        calls.push({ method: m, args })
        return b
      }
    for (const m of ["select", "eq", "neq", "order"]) b[m] = record(m)
    b.update = record("update")
    const resolve = () => {
      const upd = calls.find((c) => c.method === "update")
      if (table === "orders" && upd) {
        const patch = upd.args[0] as Record<string, unknown>
        state.updates.push(patch)
        Object.assign(state.orderRow, patch)
        return { data: null, error: null }
      }
      if (table === "orders") return { data: state.orderRow, error: null }
      if (table === "order_payments") {
        if (state.tableMissing) {
          return { data: null, error: { code: "42P01", message: "does not exist" } }
        }
        return { data: state.payments, error: null }
      }
      return { data: null, error: null }
    }
    b.maybeSingle = () => Promise.resolve(resolve())
    b.then = (res: (v: unknown) => void, rej?: (e: unknown) => void) =>
      Promise.resolve(resolve()).then(res, rej)
    return b
  }
  return { from: (table: string) => builder(table) } as unknown as ServiceClient
}

const ORDER: PaymentLinkOrder = {
  id: 501,
  total: 612,
  payment_status: "pending",
  status: "pending",
  customer_email: "ana@example.com",
  restore_token: "tok-123",
  city_slug: "chihuahua",
}

function makeState(over: Partial<FakeState> = {}): FakeState {
  return {
    orderRow: {
      payment_link_session_id: null,
      payment_link_url: null,
      payment_link_amount: null,
      payment_link_created_at: null,
    },
    payments: [],
    tableMissing: false,
    updates: [],
    ...over,
  }
}

describe("getOrCreateOrderPaymentLink", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.STRIPE_SECRET_KEY = "sk_test_123"
    createSessionMock.mockResolvedValue({
      id: "cs_test_1",
      url: "https://checkout.stripe.com/c/pay/cs_test_1",
    })
  })
  afterEach(() => {
    delete process.env.STRIPE_SECRET_KEY
  })

  it("sin llave de Stripe se corta antes de tocar la base", async () => {
    delete process.env.STRIPE_SECRET_KEY
    const state = makeState()
    const supabase = makeFakeSupabase(state)

    await expect(getOrCreateOrderPaymentLink(supabase, ORDER)).rejects.toMatchObject({
      code: "stripe_not_configured",
    })
    expect(createSessionMock).not.toHaveBeenCalled()
  })

  it("crea la sesión por el saldo exacto de la BD, con la metadata que el webhook necesita", async () => {
    const state = makeState()
    const supabase = makeFakeSupabase(state)

    const link = await getOrCreateOrderPaymentLink(supabase, ORDER)

    expect(link.url).toBe("https://checkout.stripe.com/c/pay/cs_test_1")
    expect(link.amount).toBe(612)
    expect(link.reused).toBe(false)
    const args = createSessionMock.mock.calls[0]?.[0]
    expect(args.mode).toBe("payment")
    expect(args.line_items[0].price_data.unit_amount).toBe(61200)
    expect(args.line_items[0].price_data.currency).toBe("mxn")
    expect(args.payment_intent_data.metadata).toEqual({
      order_id: "501",
      order_payment_link: "1",
    })
    expect(args.metadata).toEqual({ order_id: "501", order_payment_link: "1" })
    expect(args.success_url).toBe("https://resurte.me/chihuahua/pedido/501?t=tok-123")
    // El link queda persistido para reutilizarse.
    expect(state.orderRow.payment_link_url).toBe(link.url)
    expect(state.orderRow.payment_link_amount).toBe(612)
  })

  it("el saldo descuenta los abonos ya registrados: el link es por lo que falta", async () => {
    const state = makeState({ payments: [{ amount: 200, status: "recorded" }] })
    const supabase = makeFakeSupabase(state)

    const link = await getOrCreateOrderPaymentLink(supabase, ORDER)

    expect(link.balance).toBe(412)
    expect(link.amount).toBe(412)
    expect(createSessionMock.mock.calls[0]?.[0].line_items[0].price_data.unit_amount).toBe(41200)
  })

  it("acepta un anticipo menor al saldo y rechaza uno mayor", async () => {
    const state = makeState()
    const supabase = makeFakeSupabase(state)

    const partial = await getOrCreateOrderPaymentLink(supabase, ORDER, { amount: 100 })
    expect(partial.amount).toBe(100)
    expect(createSessionMock.mock.calls[0]?.[0].line_items[0].price_data.unit_amount).toBe(10000)

    await expect(
      getOrCreateOrderPaymentLink(supabase, ORDER, { amount: 700 })
    ).rejects.toBeInstanceOf(PaymentLinkError)
    await expect(
      getOrCreateOrderPaymentLink(supabase, ORDER, { amount: 700 })
    ).rejects.toMatchObject({ code: "invalid_amount" })
  })

  it("reutiliza el link vigente si es por el mismo monto (no crea otra sesión)", async () => {
    const state = makeState({
      orderRow: {
        payment_link_session_id: "cs_vigente",
        payment_link_url: "https://checkout.stripe.com/c/pay/cs_vigente",
        payment_link_amount: 612,
        payment_link_created_at: new Date().toISOString(),
      },
    })
    const supabase = makeFakeSupabase(state)

    const link = await getOrCreateOrderPaymentLink(supabase, ORDER)

    expect(link.reused).toBe(true)
    expect(link.url).toBe("https://checkout.stripe.com/c/pay/cs_vigente")
    expect(createSessionMock).not.toHaveBeenCalled()
  })

  it("un link persistido por otro monto no se reutiliza: el saldo manda", async () => {
    const state = makeState({
      orderRow: {
        payment_link_session_id: "cs_vieja",
        payment_link_url: "https://checkout.stripe.com/c/pay/cs_vieja",
        payment_link_amount: 612,
        payment_link_created_at: new Date().toISOString(),
      },
      payments: [{ amount: 200, status: "recorded" }],
    })
    const supabase = makeFakeSupabase(state)

    const link = await getOrCreateOrderPaymentLink(supabase, ORDER)

    expect(link.reused).toBe(false)
    expect(link.amount).toBe(412)
    expect(createSessionMock).toHaveBeenCalledTimes(1)
  })

  it("un pedido ya pagado no tiene link", async () => {
    const state = makeState()
    const supabase = makeFakeSupabase(state)

    await expect(
      getOrCreateOrderPaymentLink(supabase, { ...ORDER, payment_status: "paid" })
    ).rejects.toMatchObject({ code: "no_balance" })
    expect(createSessionMock).not.toHaveBeenCalled()
  })
})
