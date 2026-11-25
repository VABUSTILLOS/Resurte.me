import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

import {
  computePaymentBalance,
  isMissingPaymentsTable,
  recordOrderPayment,
  sumRecordedPaymentsCents,
  voidOrderPayment,
  type OrderPaymentRow,
  type ServiceClient,
} from "./order-payments"

// ============================================================
// Fake de Supabase con estado: soporta las cadenas exactas que usa
// order-payments.ts (insert→select→maybeSingle, select→eq→order
// awaited, update→eq/neq→select awaited).
// ============================================================

interface FakeState {
  order: { id: number; total: number; payment_status: string; status: string }
  payments: Array<Record<string, unknown>>
  tableMissing: boolean
  nextId: number
}

function makeState(over: Partial<FakeState> = {}): FakeState {
  return {
    order: { id: 501, total: 612, payment_status: "pending", status: "pending" },
    payments: [],
    tableMissing: false,
    nextId: 1,
    ...over,
  }
}

type Call = { method: string; args: unknown[] }

function execute(table: string, calls: Call[], state: FakeState) {
  const find = (m: string) => calls.find((c) => c.method === m)
  const eqs = calls
    .filter((c) => c.method === "eq")
    .map((c) => c.args as [string, unknown])
  const neqs = calls
    .filter((c) => c.method === "neq")
    .map((c) => c.args as [string, unknown])

  if (table === "order_payments") {
    if (state.tableMissing) {
      return { data: null, error: { code: "42P01", message: "relation \"order_payments\" does not exist" } }
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
    const upd = find("update")
    if (upd) {
      const patch = upd.args[0] as Record<string, unknown>
      const matched = state.payments.filter((p) => eqs.every(([k, v]) => p[k] === v))
      for (const p of matched) Object.assign(p, patch)
      return { data: matched.map((p) => ({ id: p.id })), error: null }
    }
    const rows = state.payments.filter((p) => eqs.every(([k, v]) => p[k] === v))
    return { data: rows, error: null }
  }

  if (table === "orders") {
    const upd = find("update")
    if (upd) {
      const patch = upd.args[0] as Record<string, unknown>
      const rec = state.order as unknown as Record<string, unknown>
      const ok =
        eqs.every(([k, v]) => rec[k] === v) && neqs.every(([k, v]) => rec[k] !== v)
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

const row = (over: Partial<OrderPaymentRow>): Pick<OrderPaymentRow, "amount" | "status"> => ({
  amount: 0,
  status: "recorded",
  ...over,
})

describe("computePaymentBalance — la regla única del saldo", () => {
  it("sin abonos, el saldo es el total", () => {
    const b = computePaymentBalance({ total: 612, paymentStatus: "pending", payments: [] })
    expect(b).toEqual({ paidAmount: 0, balance: 612, coveredByPayments: false, isPaidStatus: false })
  })

  it("un abono parcial baja el saldo y no cubre", () => {
    const b = computePaymentBalance({
      total: 612,
      paymentStatus: "pending",
      payments: [row({ amount: 200 })],
    })
    expect(b.paidAmount).toBe(200)
    expect(b.balance).toBe(412)
    expect(b.coveredByPayments).toBe(false)
  })

  it("los abonos que cubren el total dejan saldo cero", () => {
    const b = computePaymentBalance({
      total: 612,
      paymentStatus: "pending",
      payments: [row({ amount: 200 }), row({ amount: 412 })],
    })
    expect(b.balance).toBe(0)
    expect(b.coveredByPayments).toBe(true)
  })

  it("las filas anuladas no suman", () => {
    const b = computePaymentBalance({
      total: 612,
      paymentStatus: "pending",
      payments: [row({ amount: 612, status: "voided" })],
    })
    expect(b.balance).toBe(612)
    expect(b.coveredByPayments).toBe(false)
  })

  it("compatibilidad: pagado por una vía previa se lee cubierto aunque el libro esté vacío", () => {
    const b = computePaymentBalance({ total: 612, paymentStatus: "paid", payments: [] })
    expect(b).toEqual({ paidAmount: 612, balance: 0, coveredByPayments: false, isPaidStatus: true })
  })

  it("un sobrepago nunca deja saldo negativo ni abonado mayor al total", () => {
    const b = computePaymentBalance({
      total: 100,
      paymentStatus: "pending",
      payments: [row({ amount: 150 })],
    })
    expect(b.balance).toBe(0)
    expect(b.paidAmount).toBe(100)
    expect(b.coveredByPayments).toBe(true)
  })

  it("suma en centavos: 0.1 + 0.2 no deja residuos de flotante", () => {
    expect(
      sumRecordedPaymentsCents([row({ amount: 0.1 }), row({ amount: 0.2 })])
    ).toBe(30)
  })
})

describe("isMissingPaymentsTable", () => {
  it("reconoce 42P01 y PGRST205, y nada más", () => {
    expect(isMissingPaymentsTable({ code: "42P01" })).toBe(true)
    expect(isMissingPaymentsTable({ code: "PGRST205" })).toBe(true)
    expect(isMissingPaymentsTable({ code: "23505" })).toBe(false)
    expect(isMissingPaymentsTable(null)).toBe(false)
    expect(isMissingPaymentsTable(undefined)).toBe(false)
  })
})

describe("recordOrderPayment", () => {
  it("un abono parcial se registra y NO marca el pedido como pagado", async () => {
    const state = makeState()
    const supabase = makeFakeSupabase(state)

    const result = await recordOrderPayment(supabase, state.order, {
      amount: 200,
      method: "spei",
      origin: "manual",
    })

    expect(result.recorded).toBe(true)
    expect(result.becamePaid).toBe(false)
    expect(result.summary?.balance).toBe(412)
    expect(state.order.payment_status).toBe("pending")
    expect(state.payments).toHaveLength(1)
  })

  it("el abono que cubre el total marca pagado y confirma el pedido pendiente", async () => {
    const state = makeState({ payments: [] })
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

    const result = await recordOrderPayment(supabase, state.order, {
      amount: 412,
      method: "card",
      origin: "stripe_link",
      stripePaymentIntentId: "pi_123",
    })

    expect(result.becamePaid).toBe(true)
    expect(state.order.payment_status).toBe("paid")
    expect(state.order.status).toBe("confirmed")
    expect(result.summary?.balance).toBe(0)
  })

  it("un pedido ya en preparación no retrocede de estado al completarse el pago", async () => {
    const state = makeState()
    state.order.status = "preparing"
    const supabase = makeFakeSupabase(state)

    const result = await recordOrderPayment(supabase, state.order, {
      amount: 612,
      method: "card",
      origin: "stripe_link",
      stripePaymentIntentId: "pi_full",
    })

    expect(result.becamePaid).toBe(true)
    expect(state.order.payment_status).toBe("paid")
    expect(state.order.status).toBe("preparing")
  })

  it("la re-entrega del webhook no duplica el abono (índice único del PaymentIntent)", async () => {
    const state = makeState()
    const supabase = makeFakeSupabase(state)
    const input = {
      amount: 612,
      method: "card" as const,
      origin: "stripe_link" as const,
      stripePaymentIntentId: "pi_dup",
    }

    const first = await recordOrderPayment(supabase, state.order, input)
    const second = await recordOrderPayment(supabase, state.order, input)

    expect(first.becamePaid).toBe(true)
    expect(second.recorded).toBe(true)
    expect(second.alreadyRecorded).toBe(true)
    expect(second.becamePaid).toBe(false)
    expect(state.payments).toHaveLength(1)
  })

  it("sin la migración devuelve schemaMissing y no toca el pedido", async () => {
    const state = makeState({ tableMissing: true })
    const supabase = makeFakeSupabase(state)

    const result = await recordOrderPayment(supabase, state.order, {
      amount: 612,
      method: "card",
      origin: "stripe_link",
      stripePaymentIntentId: "pi_x",
    })

    expect(result.schemaMissing).toBe(true)
    expect(result.recorded).toBe(false)
    expect(state.order.payment_status).toBe("pending")
  })
})

describe("voidOrderPayment", () => {
  it("anular el abono que pagó el pedido lo devuelve a pendiente de pago", async () => {
    const state = makeState()
    const supabase = makeFakeSupabase(state)
    await recordOrderPayment(supabase, state.order, {
      amount: 612,
      method: "spei",
      origin: "manual",
    })
    expect(state.order.payment_status).toBe("paid")
    const paymentId = String(state.payments[0]?.id)

    const result = await voidOrderPayment(supabase, { ...state.order }, paymentId)

    expect(result.voided).toBe(true)
    expect(result.revertedPaid).toBe(true)
    expect(state.order.payment_status).toBe("pending")
    // El estado del pedido no se toca: sigue confirmado.
    expect(state.order.status).toBe("confirmed")
    expect(result.summary?.balance).toBe(612)
  })

  it("anular un pago inexistente o ya anulado no hace nada", async () => {
    const state = makeState()
    const supabase = makeFakeSupabase(state)

    const result = await voidOrderPayment(supabase, state.order, "pay-999")

    expect(result.voided).toBe(false)
    expect(result.error).toBe("not_found")
  })
})
