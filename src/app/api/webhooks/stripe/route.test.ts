import { beforeEach, describe, expect, it, vi } from "vitest"

const { constructEvent } = vi.hoisted(() => ({ constructEvent: vi.fn() }))

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>()
  return {
    ...actual,
    // Ejecuta los callbacks de after() de forma síncrona para poder
    // asertar los workflows disparados por el webhook.
    after: (fn: () => void) => fn(),
  }
})
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers({ "stripe-signature": "sig_test" })),
}))
vi.mock("@/lib/stripe", () => ({
  getStripe: () => ({ webhooks: { constructEvent } }),
}))
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }))
vi.mock("@/lib/workflows", () => ({
  confirmPaymentToCustomer: vi.fn().mockResolvedValue(null),
  notifyCustomerStatusUpdate: vi.fn().mockResolvedValue(null),
}))
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))

import { NextRequest } from "next/server"
import { POST } from "./route"
import { createServiceClient } from "@/lib/supabase/service"
import { confirmPaymentToCustomer, notifyCustomerStatusUpdate } from "@/lib/workflows"
import { logger } from "@/lib/logger"

interface TableResult {
  data?: unknown
  error?: unknown
}

/**
 * Builder PostgREST chainable y "awaitable": todos los métodos devuelven el
 * mismo builder, que resuelve { data: null, error: null } al awaitarse (para
 * cadenas `update().eq()`). `maybeSingle`/`single` resuelven el resultado
 * configurado para la tabla.
 */
function tableBuilder(result: TableResult = { data: null, error: null }) {
  const builder: Record<string, unknown> = {}
  for (const method of ["select", "eq", "neq", "update", "order", "limit"]) {
    builder[method] = vi.fn().mockReturnValue(builder)
  }
  builder.insert = vi.fn().mockResolvedValue({ data: null, error: null })
  builder.maybeSingle = vi.fn().mockResolvedValue(result)
  builder.single = vi.fn().mockResolvedValue(result)
  builder.then = (resolve: (v: unknown) => void) => resolve({ data: null, error: null })
  return builder as Record<string, ReturnType<typeof vi.fn>> & {
    maybeSingle: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
    insert: ReturnType<typeof vi.fn>
    eq: ReturnType<typeof vi.fn>
  }
}

function mockSupabase(tables: Record<string, ReturnType<typeof tableBuilder>>) {
  const from = vi.fn((table: string) => tables[table] ?? tableBuilder())
  vi.mocked(createServiceClient).mockResolvedValue({ from } as never)
  return from
}

function webhookReq(body = "{}") {
  return new NextRequest("https://resurte.me/api/webhooks/stripe", {
    method: "POST",
    body,
    headers: { "content-type": "text/plain" },
  })
}

function stripeEvent(type: string, object: Record<string, unknown>) {
  return { type, data: { object } }
}

describe("/api/webhooks/stripe", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test"
  })

  it("responde 400 cuando la firma de Stripe es inválida", async () => {
    constructEvent.mockImplementation(() => {
      throw new Error("No signatures found matching the expected signature for payload")
    })

    const res = await POST(webhookReq())

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain("signature")
    expect(constructEvent).toHaveBeenCalledWith("{}", "sig_test", "whsec_test")
    expect(logger.error).toHaveBeenCalled()
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it("payment_intent.succeeded con monto insuficiente NO marca el pedido como pagado", async () => {
    const orders = tableBuilder({
      data: { id: 7, user_id: "user-1", total: 100, customer_email: "c@x.com" },
      error: null,
    })
    mockSupabase({ orders })
    constructEvent.mockReturnValue(
      stripeEvent("payment_intent.succeeded", {
        id: "pi_low",
        amount_received: 5000, // $50 < total $100
        metadata: {},
      })
    )

    const res = await POST(webhookReq())

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ received: true })
    // Fail-closed: se marca amount_mismatch, nunca paid.
    expect(orders.update).toHaveBeenCalledWith(
      expect.objectContaining({ payment_status: "amount_mismatch" })
    )
    expect(orders.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ payment_status: "paid" })
    )
    expect(confirmPaymentToCustomer).not.toHaveBeenCalled()
    expect(notifyCustomerStatusUpdate).not.toHaveBeenCalled()
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining("Amount mismatch")
    )
  })

  it("payment_intent.succeeded con monto suficiente marca pagado y dispara workflows", async () => {
    const orders = tableBuilder({
      data: { id: 7, user_id: "user-1", total: 100, customer_email: null },
      error: null,
    })
    mockSupabase({ orders })
    constructEvent.mockReturnValue(
      stripeEvent("payment_intent.succeeded", {
        id: "pi_ok",
        amount_received: 10000, // $100 >= total $100
        metadata: {},
        payment_method: "pm_1",
        customer: "cus_1",
        receipt_email: "drawer@x.com",
      })
    )

    const res = await POST(webhookReq())

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ received: true })
    expect(orders.update).toHaveBeenCalledWith(
      expect.objectContaining({
        payment_status: "paid",
        status: "confirmed",
        stripe_payment_method_id: "pm_1",
        stripe_customer_id: "cus_1",
        customer_email: "drawer@x.com",
      })
    )
    // Workflows de WhatsApp disparados vía after() con el id de la orden.
    expect(confirmPaymentToCustomer).toHaveBeenCalledWith(7)
    expect(notifyCustomerStatusUpdate).toHaveBeenCalledWith(7, "confirmed")
  })

  it("payment_intent.succeeded repara el PI por metadata.order_id cuando el lookup canónico falla", async () => {
    const orders = tableBuilder()
    orders.maybeSingle
      .mockResolvedValueOnce({ data: null, error: null }) // lookup por stripe_payment_intent_id
      .mockResolvedValueOnce({
        data: { id: 42, user_id: "user-1", total: 50, customer_email: "c@x.com" },
        error: null,
      }) // fallback por metadata.order_id
    mockSupabase({ orders })
    constructEvent.mockReturnValue(
      stripeEvent("payment_intent.succeeded", {
        id: "pi_fallback",
        amount_received: 5000,
        metadata: { order_id: "42" },
      })
    )

    const res = await POST(webhookReq())

    expect(res.status).toBe(200)
    expect(orders.eq).toHaveBeenCalledWith("id", 42)
    // Repara el dato canónico y luego marca como pagado.
    expect(orders.update).toHaveBeenCalledWith({ stripe_payment_intent_id: "pi_fallback" })
    expect(orders.update).toHaveBeenCalledWith(
      expect.objectContaining({ payment_status: "paid", status: "confirmed" })
    )
    expect(confirmPaymentToCustomer).toHaveBeenCalledWith(42)
  })

  it("payment_intent.succeeded marca un upsell como pagado e inserta sus items", async () => {
    const upsells = tableBuilder({
      data: {
        id: 9,
        order_id: 7,
        product_id: 3,
        quantity: 1,
        unit_price: 25,
        status: "pending",
      },
      error: null,
    })
    const orderItems = tableBuilder({ data: null, error: null })
    mockSupabase({ order_upsells: upsells, order_items: orderItems })
    constructEvent.mockReturnValue(
      stripeEvent("payment_intent.succeeded", {
        id: "pi_upsell",
        amount_received: 2500,
        metadata: {},
      })
    )

    const res = await POST(webhookReq())

    expect(res.status).toBe(200)
    expect(upsells.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "paid" })
    )
    expect(orderItems.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        order_id: 7,
        product_id: 3,
        quantity: 1,
        unit_price: 25,
        item_type: "upsell",
      })
    )
  })

  it("payment_intent.refunded marca pedidos y foodos_orders como refunded", async () => {
    const orders = tableBuilder()
    const foodos = tableBuilder()
    mockSupabase({ orders, foodos_orders: foodos })
    constructEvent.mockReturnValue(
      stripeEvent("payment_intent.refunded", { id: "pi_ref" })
    )

    const res = await POST(webhookReq())

    expect(res.status).toBe(200)
    expect(orders.update).toHaveBeenCalledWith(
      expect.objectContaining({ payment_status: "refunded" })
    )
    expect(foodos.update).toHaveBeenCalledWith(
      expect.objectContaining({ payment_status: "refunded" })
    )
  })

  it("payment_intent.payment_failed marca orders, foodos_orders y order_upsells como fallidos", async () => {
    const orders = tableBuilder()
    const foodos = tableBuilder()
    const upsells = tableBuilder()
    mockSupabase({ orders, foodos_orders: foodos, order_upsells: upsells })
    constructEvent.mockReturnValue(
      stripeEvent("payment_intent.payment_failed", { id: "pi_fail" })
    )

    const res = await POST(webhookReq())

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ received: true })
    expect(orders.update).toHaveBeenCalledWith(
      expect.objectContaining({ payment_status: "failed" })
    )
    expect(foodos.update).toHaveBeenCalledWith(
      expect.objectContaining({ payment_status: "failed" })
    )
    expect(upsells.update).toHaveBeenCalledWith({ status: "failed" })
    expect(upsells.eq).toHaveBeenCalledWith("stripe_payment_intent_id", "pi_fail")
  })

  it("payment_intent.canceled NO degrada un pedido ya pagado", async () => {
    const orders = tableBuilder({
      data: { id: 7, payment_status: "paid" },
      error: null,
    })
    const upsells = tableBuilder()
    mockSupabase({ orders, order_upsells: upsells })
    constructEvent.mockReturnValue(
      stripeEvent("payment_intent.canceled", { id: "pi_cancel" })
    )

    const res = await POST(webhookReq())

    expect(res.status).toBe(200)
    expect(orders.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ payment_status: "failed" })
    )
    // Los upsells sí se marcan como cancelados.
    expect(upsells.update).toHaveBeenCalledWith({ status: "canceled" })
  })

  it("payment_intent.canceled marca como failed un pedido no pagado", async () => {
    const orders = tableBuilder({
      data: { id: 7, payment_status: "pending" },
      error: null,
    })
    mockSupabase({ orders })
    constructEvent.mockReturnValue(
      stripeEvent("payment_intent.canceled", { id: "pi_cancel_2" })
    )

    const res = await POST(webhookReq())

    expect(res.status).toBe(200)
    expect(orders.update).toHaveBeenCalledWith(
      expect.objectContaining({ payment_status: "failed" })
    )
  })

  it("ignora eventos no manejados con 200 y log de advertencia", async () => {
    mockSupabase({})
    constructEvent.mockReturnValue(
      stripeEvent("customer.created", { id: "cus_new" })
    )

    const res = await POST(webhookReq())

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ received: true })
    expect(logger.warn).toHaveBeenCalledWith("stripe.unhandled_event", {
      type: "customer.created",
    })
    expect(createServiceClient).not.toHaveBeenCalled()
  })
})
