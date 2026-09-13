import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { retrieve } = vi.hoisted(() => ({ retrieve: vi.fn() }))

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>()
  return {
    ...actual,
    after: (fn: () => void) => fn(),
  }
})
vi.mock("@/lib/stripe", () => ({ getStripe: () => ({ paymentIntents: { retrieve } }) }))
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }))
vi.mock("@/lib/workflows", () => ({
  confirmPaymentToCustomer: vi.fn().mockResolvedValue(null),
  notifyCustomerStatusUpdate: vi.fn().mockResolvedValue(null),
}))
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))

import { NextRequest } from "next/server"
import { GET } from "./route"
import { createServiceClient } from "@/lib/supabase/service"
import { logger } from "@/lib/logger"

interface TableResult {
  data?: unknown
  error?: unknown
}

function tableBuilder(result: TableResult = { data: null, error: null }) {
  const builder: Record<string, unknown> = {}
  for (const method of ["select", "eq", "neq", "not", "lt", "update", "order", "limit"]) {
    builder[method] = vi.fn().mockReturnValue(builder)
  }
  builder.insert = vi.fn().mockResolvedValue({ data: null, error: null })
  builder.maybeSingle = vi.fn().mockResolvedValue(result)
  builder.single = vi.fn().mockResolvedValue(result)
  builder.then = (resolve: (v: unknown) => void) => resolve(result)
  return builder as Record<string, ReturnType<typeof vi.fn>> & {
    maybeSingle: ReturnType<typeof vi.fn>
    single: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
  }
}

function mockSupabase(ordersResult: TableResult, extra: Record<string, ReturnType<typeof tableBuilder>> = {}) {
  const orders = tableBuilder(ordersResult)
  const from = vi.fn((table: string) => (table === "orders" ? orders : (extra[table] ?? tableBuilder())))
  vi.mocked(createServiceClient).mockResolvedValue({ from } as never)
  return { orders, from }
}

function cronReq(auth?: string) {
  return new NextRequest("https://resurte.me/api/cron/reconcile-payments", {
    method: "GET",
    headers: auth ? { authorization: auth } : {},
  })
}

const staleOrder = {
  id: 7,
  stripe_payment_intent_id: "pi_stale",
  payment_status: "pending",
}

describe("/api/cron/reconcile-payments", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.CRON_SECRET = "cron_secret_test"
  })

  afterEach(() => {
    delete process.env.CRON_SECRET
  })

  it("rechaza 401 sin CRON_SECRET configurado (fail closed)", async () => {
    delete process.env.CRON_SECRET

    const res = await GET(cronReq("Bearer cron_secret_test"))

    expect(res.status).toBe(401)
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it("rechaza 401 con header Authorization incorrecto", async () => {
    const res = await GET(cronReq("Bearer wrong"))

    expect(res.status).toBe(401)
    expect(retrieve).not.toHaveBeenCalled()
  })

  it("sincroniza a paid un pedido pendiente cuyo PI ya succeeded en Stripe", async () => {
    const { orders } = mockSupabase(
      { data: [staleOrder], error: null },
    )
    // El handler hace lookup por stripe_payment_intent_id → maybeSingle.
    orders.maybeSingle.mockResolvedValue({
      data: { id: 7, user_id: "user-1", total: 100, customer_email: null },
      error: null,
    })
    retrieve.mockResolvedValue({
      id: "pi_stale",
      status: "succeeded",
      amount_received: 10000,
      currency: "mxn",
      metadata: {},
      payment_method: "pm_1",
      customer: "cus_1",
      receipt_email: null,
      last_payment_error: null,
    })

    const res = await GET(cronReq("Bearer cron_secret_test"))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ checked: 1, updated: 1, errors: [] })
    // El handler compartido marcó el pedido como pagado.
    expect(orders.update).toHaveBeenCalledWith(
      expect.objectContaining({ payment_status: "paid", status: "confirmed" })
    )
  })

  it("omite y loguea pedidos sin stripe_payment_intent_id", async () => {
    mockSupabase({
      data: [{ id: 8, stripe_payment_intent_id: null, payment_status: "pending" }],
      error: null,
    })

    const res = await GET(cronReq("Bearer cron_secret_test"))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ checked: 0, updated: 0, errors: [] })
    expect(retrieve).not.toHaveBeenCalled()
    expect(logger.warn).toHaveBeenCalledWith(
      "reconcile-payments.skipped_no_pi",
      expect.objectContaining({ order: 8 })
    )
  })

  it("marca failed cuando el PI está canceled en Stripe", async () => {
    const { orders } = mockSupabase({ data: [staleOrder], error: null })
    orders.single.mockResolvedValue({ data: { id: 7, payment_status: "pending" }, error: null })
    retrieve.mockResolvedValue({
      id: "pi_stale",
      status: "canceled",
      amount_received: 0,
      currency: "mxn",
      metadata: {},
      payment_method: null,
      customer: null,
      receipt_email: null,
      last_payment_error: null,
    })

    const res = await GET(cronReq("Bearer cron_secret_test"))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ checked: 1, updated: 1, errors: [] })
    expect(orders.update).toHaveBeenCalledWith(
      expect.objectContaining({ payment_status: "failed" })
    )
  })

  it("marca failed cuando el PI requiere método de pago con error de cobro", async () => {
    const { orders } = mockSupabase({ data: [staleOrder], error: null })
    retrieve.mockResolvedValue({
      id: "pi_stale",
      status: "requires_payment_method",
      amount_received: 0,
      currency: "mxn",
      metadata: {},
      payment_method: null,
      customer: null,
      receipt_email: null,
      last_payment_error: { code: "card_declined" },
    })

    const res = await GET(cronReq("Bearer cron_secret_test"))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ checked: 1, updated: 1, errors: [] })
    expect(orders.update).toHaveBeenCalledWith(
      expect.objectContaining({ payment_status: "failed" })
    )
  })

  it("no toca PIs aún en curso (processing) y acumula errores de Stripe", async () => {
    mockSupabase({
      data: [staleOrder, { id: 9, stripe_payment_intent_id: "pi_err", payment_status: "pending" }],
      error: null,
    })
    retrieve
      .mockResolvedValueOnce({
        id: "pi_stale",
        status: "processing",
        amount_received: 0,
        currency: "mxn",
        metadata: {},
        payment_method: null,
        customer: null,
        receipt_email: null,
        last_payment_error: null,
      })
      .mockRejectedValueOnce(new Error("No such payment_intent"))

    const res = await GET(cronReq("Bearer cron_secret_test"))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.checked).toBe(2)
    expect(body.updated).toBe(0)
    expect(body.errors).toEqual([{ orderId: 9, error: "No such payment_intent" }])
  })
})
