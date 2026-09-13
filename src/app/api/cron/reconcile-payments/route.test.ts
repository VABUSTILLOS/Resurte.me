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

function tableBuilder(
  result: TableResult = { data: null, error: null },
  singleResult?: TableResult
) {
  const builder: Record<string, unknown> = {}
  for (const method of ["select", "eq", "in", "not", "lt", "update", "order", "limit"]) {
    builder[method] = vi.fn().mockReturnValue(builder)
  }
  builder.insert = vi.fn().mockResolvedValue({ data: null, error: null })
  // `maybeSingle()`/`single()` resuelven una fila, no un arreglo: en tablas
  // cuyo barrido espera un arreglo (reconciliación) hay que pasar ambas formas.
  builder.maybeSingle = vi.fn().mockResolvedValue(singleResult ?? result)
  builder.single = vi.fn().mockResolvedValue(singleResult ?? result)
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
    expect(body).toEqual({ checked: 1, updated: 1, errors: [], foodosChecked: 0, foodosUpdated: 0 })
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
    expect(body).toEqual({ checked: 0, updated: 0, errors: [], foodosChecked: 0, foodosUpdated: 0 })
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
    expect(body).toEqual({ checked: 1, updated: 1, errors: [], foodosChecked: 0, foodosUpdated: 0 })
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
    expect(await res.json()).toEqual({ checked: 1, updated: 1, errors: [], foodosChecked: 0, foodosUpdated: 0 })
    expect(orders.update).toHaveBeenCalledWith(
      expect.objectContaining({ payment_status: "failed" })
    )
  })

  it("expira un voucher FoodOS caducado sin last_payment_error", async () => {
    const foodos = tableBuilder({
      data: [
        {
          id: "f-stale",
          stripe_payment_intent_id: "pi_oxxo_stale",
          payment_status: "processing",
          created_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
        },
      ],
      error: null,
    })
    mockSupabase({ data: [], error: null }, { foodos_orders: foodos })
    // Stripe deja el intent en requires_payment_method y sin error: el único
    // rastro de que el voucher caducó es la antigüedad del pedido.
    retrieve.mockResolvedValueOnce({
      id: "pi_oxxo_stale",
      status: "requires_payment_method",
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
    expect(body.foodosChecked).toBe(1)
    expect(body.foodosUpdated).toBe(1)
    expect(foodos.update).toHaveBeenCalledWith(
      expect.objectContaining({ payment_status: "expired" })
    )
  })

  it("no expira un voucher FoodOS dentro de la ventana de 96h", async () => {
    const foodos = tableBuilder({
      data: [
        {
          id: "f-fresh",
          stripe_payment_intent_id: "pi_oxxo_fresh",
          payment_status: "processing",
          created_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        },
      ],
      error: null,
    })
    mockSupabase({ data: [], error: null }, { foodos_orders: foodos })
    retrieve.mockResolvedValueOnce({
      id: "pi_oxxo_fresh",
      status: "requires_payment_method",
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
    expect(body.foodosChecked).toBe(1)
    expect(body.foodosUpdated).toBe(0)
    expect(foodos.update).not.toHaveBeenCalled()
  })

  it("marca paid un voucher FoodOS ya acreditado en Stripe", async () => {
    const row = {
      id: "f-paid",
      stripe_payment_intent_id: "pi_oxxo_paid",
      payment_status: "processing",
      total: 100,
      created_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    }
    const foodos = tableBuilder(
      { data: [row], error: null },
      { data: row, error: null }
    )
    mockSupabase({ data: [], error: null }, { foodos_orders: foodos })
    retrieve.mockResolvedValueOnce({
      id: "pi_oxxo_paid",
      status: "succeeded",
      amount_received: 10000,
      amount: 10000,
      currency: "mxn",
      metadata: {},
      payment_method: "pm_oxxo",
      customer: null,
      receipt_email: null,
      last_payment_error: null,
    })

    const res = await GET(cronReq("Bearer cron_secret_test"))

    expect(res.status).toBe(200)
    expect(foodos.update).toHaveBeenCalledWith(
      expect.objectContaining({ payment_status: "paid" })
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
