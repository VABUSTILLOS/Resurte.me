import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>()
  return {
    ...actual,
    after: (fn: () => void) => fn(),
  }
})
vi.mock("@/lib/workflows", () => ({
  confirmPaymentToCustomer: vi.fn().mockResolvedValue(null),
  notifyCustomerStatusUpdate: vi.fn().mockResolvedValue(null),
}))
vi.mock("@/lib/order-emails", () => ({
  sendOrderStatusEmail: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("@/lib/notifications", () => ({
  notifyCashbackCredited: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

import {
  handleOrderPaymentLinkSucceeded,
  handlePaymentIntentSucceeded,
  type ServiceClient,
  type StripePaymentIntentLike,
} from "./stripe-webhook-handlers"
import { confirmPaymentToCustomer, notifyCustomerStatusUpdate } from "@/lib/workflows"
import { sendOrderStatusEmail } from "@/lib/order-emails"

// ============================================================
// Fake de Supabase con estado (mismo patrón que
// order-payments.test.ts): orders + order_payments.
// ============================================================

interface FakeState {
  order: {
    id: number
    user_id: string
    total: number
    payment_status: string
    status: string
    customer_email: string | null
  }
  payments: Array<Record<string, unknown>>
  tableMissing: boolean
  nextId: number
}

function makeState(over: Partial<FakeState> = {}): FakeState {
  return {
    order: {
      id: 501,
      user_id: "user-1",
      total: 612,
      payment_status: "pending",
      status: "pending",
      customer_email: null,
    },
    payments: [],
    tableMissing: false,
    nextId: 1,
    ...over,
  }
}

type Call = { method: string; args: unknown[] }

function execute(table: string, calls: Call[], state: FakeState) {
  const find = (m: string) => calls.find((c) => c.method === m)
  const eqs = calls.filter((c) => c.method === "eq").map((c) => c.args as [string, unknown])
  const neqs = calls.filter((c) => c.method === "neq").map((c) => c.args as [string, unknown])

  if (table === "order_payments") {
    if (state.tableMissing) {
      return { data: null, error: { code: "42P01", message: "relation does not exist" } }
    }
    const ins = find("insert")
    if (ins) {
      const row = ins.args[0] as Record<string, unknown>
      if (
        row.stripe_payment_intent_id &&
        state.payments.some((p) => p.stripe_payment_intent_id === row.stripe_payment_intent_id)
      ) {
        return { data: null, error: { code: "23505", message: "duplicate key" } }
      }
      const newRow: Record<string, unknown> = {
        id: `pay-${state.nextId++}`,
        created_at: new Date().toISOString(),
        status: "recorded",
        note: null,
        stripe_checkout_session_id: null,
        created_by: null,
        ...row,
      }
      state.payments.push(newRow)
      return { data: { id: newRow.id }, error: null }
    }
    const rows = state.payments.filter((p) => eqs.every(([k, v]) => p[k] === v))
    return { data: rows, error: null }
  }

  if (table === "orders") {
    const upd = find("update")
    if (upd) {
      const patch = upd.args[0] as Record<string, unknown>
      const rec = state.order as unknown as Record<string, unknown>
      const ok = eqs.every(([k, v]) => rec[k] === v) && neqs.every(([k, v]) => rec[k] !== v)
      if (!ok) return { data: [], error: null }
      Object.assign(state.order, patch)
      return { data: [{ id: state.order.id }], error: null }
    }
    return { data: state.order, error: null }
  }

  return { data: null, error: null }
}

function makeFakeSupabase(state: FakeState) {
  function builder(table: string) {
    const calls: Call[] = []
    const b: Record<string, unknown> = {}
    const record =
      (m: string) =>
      (...args: unknown[]) => {
        calls.push({ method: m, args })
        return b
      }
    for (const m of ["select", "eq", "neq", "in", "order", "limit"]) b[m] = record(m)
    b.insert = record("insert")
    b.update = record("update")
    b.maybeSingle = () => Promise.resolve(execute(table, calls, state))
    b.single = () => Promise.resolve(execute(table, calls, state))
    b.then = (res: (v: unknown) => void, rej?: (e: unknown) => void) =>
      Promise.resolve(execute(table, calls, state)).then(res, rej)
    return b
  }
  return { from: (table: string) => builder(table) } as unknown as ServiceClient
}

const linkPI = (over: Partial<StripePaymentIntentLike> = {}): StripePaymentIntentLike => ({
  id: "pi_link_1",
  amount_received: 61200,
  metadata: { order_id: "501", order_payment_link: "1" },
  payment_method: "pm_1",
  customer: "cus_1",
  receipt_email: null,
  ...over,
})

describe("handleOrderPaymentLinkSucceeded — pagos del link de Stripe (Ola 4)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("un anticipo se registra en el libro y NO marca el pedido pagado ni avisa de pago completo", async () => {
    const state = makeState()
    const supabase = makeFakeSupabase(state)

    await handleOrderPaymentLinkSucceeded(supabase, linkPI({ amount_received: 20000 }))

    expect(state.payments).toHaveLength(1)
    expect(state.payments[0]).toMatchObject({
      amount: 200,
      method: "card",
      origin: "stripe_link",
      stripe_payment_intent_id: "pi_link_1",
    })
    expect(state.order.payment_status).toBe("pending")
    expect(confirmPaymentToCustomer).not.toHaveBeenCalled()
    expect(sendOrderStatusEmail).not.toHaveBeenCalled()
  })

  it("el abono que cubre el total marca pagado, confirma y dispara los avisos", async () => {
    const state = makeState()
    state.payments.push({
      id: "pay-0",
      order_id: 501,
      amount: 200,
      method: "spei",
      origin: "manual",
      status: "recorded",
      stripe_payment_intent_id: null,
      stripe_checkout_session_id: null,
      note: null,
      created_by: null,
      created_at: new Date().toISOString(),
    })
    const supabase = makeFakeSupabase(state)

    await handleOrderPaymentLinkSucceeded(supabase, linkPI({ amount_received: 41200 }))

    expect(state.order.payment_status).toBe("paid")
    expect(state.order.status).toBe("confirmed")
    expect(confirmPaymentToCustomer).toHaveBeenCalledWith(501)
    expect(notifyCustomerStatusUpdate).toHaveBeenCalledWith(501, "confirmed")
    expect(sendOrderStatusEmail).toHaveBeenCalledWith(501, "confirmed")
  })

  it("la doble entrega (payment_intent.succeeded + checkout.session.completed) abona una sola vez", async () => {
    const state = makeState()
    const supabase = makeFakeSupabase(state)

    await handleOrderPaymentLinkSucceeded(supabase, linkPI())
    await handleOrderPaymentLinkSucceeded(supabase, linkPI())

    expect(state.payments).toHaveLength(1)
    expect(state.order.payment_status).toBe("paid")
    expect(confirmPaymentToCustomer).toHaveBeenCalledTimes(1)
  })

  it("sin order_id en la metadata no toca nada", async () => {
    const state = makeState()
    const supabase = makeFakeSupabase(state)

    await handleOrderPaymentLinkSucceeded(
      supabase,
      linkPI({ metadata: { order_payment_link: "1" } })
    )

    expect(state.payments).toHaveLength(0)
    expect(state.order.payment_status).toBe("pending")
  })

  it("sin la migración 00233, un link por el total sigue marcando pagado (degradación)", async () => {
    const state = makeState({ tableMissing: true })
    const supabase = makeFakeSupabase(state)

    await handleOrderPaymentLinkSucceeded(supabase, linkPI())

    expect(state.payments).toHaveLength(0)
    expect(state.order.payment_status).toBe("paid")
    expect(confirmPaymentToCustomer).toHaveBeenCalledWith(501)
  })

  it("sin la migración, un anticipo no marca pagado (queda para conciliar a mano)", async () => {
    const state = makeState({ tableMissing: true })
    const supabase = makeFakeSupabase(state)

    await handleOrderPaymentLinkSucceeded(supabase, linkPI({ amount_received: 20000 }))

    expect(state.order.payment_status).toBe("pending")
    expect(confirmPaymentToCustomer).not.toHaveBeenCalled()
  })

  it("handlePaymentIntentSucceeded deriva los PI del link al libro, no a la regla legada de monto", async () => {
    const state = makeState()
    const supabase = makeFakeSupabase(state)

    // Un anticipo de $200 sobre un total de $612: la regla legada lo
    // marcaría amount_mismatch; el libro lo registra como abono.
    await handlePaymentIntentSucceeded(supabase, linkPI({ amount_received: 20000 }))

    expect(state.payments).toHaveLength(1)
    expect(state.order.payment_status).toBe("pending")
  })
})
