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
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))

import {
  handlePaymentIntentSucceeded,
  handlePaymentIntentRefunded,
  handlePaymentIntentFailed,
  handlePaymentIntentCanceled,
  handlePaymentIntentProcessing,
  handleFoodosPaymentIntentExpired,
  type ServiceClient,
} from "./stripe-webhook-handlers"
import { confirmPaymentToCustomer, notifyCustomerStatusUpdate } from "@/lib/workflows"
import { sendOrderStatusEmail } from "@/lib/order-emails"
import { logger } from "@/lib/logger"

interface TableResult {
  data?: unknown
  error?: unknown
}

/** Mismo patrón de builder que route.test.ts del webhook. */
function tableBuilder(result: TableResult = { data: null, error: null }) {
  const builder: Record<string, unknown> = {}
  for (const method of ["select", "eq", "in", "update", "order", "limit"]) {
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
  return { from } as unknown as ServiceClient
}

describe("stripe-webhook-handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("succeeded: monto suficiente marca pagado y dispara workflows", async () => {
    const orders = tableBuilder({
      data: { id: 7, user_id: "user-1", total: 100, customer_email: null },
      error: null,
    })
    const supabase = mockSupabase({ orders })

    await handlePaymentIntentSucceeded(supabase, {
      id: "pi_ok",
      amount_received: 10000,
      metadata: {},
      payment_method: "pm_1",
      customer: "cus_1",
      receipt_email: "drawer@x.com",
    })

    expect(orders.update).toHaveBeenCalledWith(
      expect.objectContaining({
        payment_status: "paid",
        status: "confirmed",
        stripe_payment_method_id: "pm_1",
        stripe_customer_id: "cus_1",
        customer_email: "drawer@x.com",
      })
    )
    expect(confirmPaymentToCustomer).toHaveBeenCalledWith(7)
    expect(notifyCustomerStatusUpdate).toHaveBeenCalledWith(7, "confirmed")
    // El pago confirma la orden sin pasar por el panel admin: el email del
    // hito también debe dispararse desde aquí.
    expect(sendOrderStatusEmail).toHaveBeenCalledWith(7, "confirmed")
  })

  it("succeeded: monto insuficiente marca amount_mismatch y nunca paid", async () => {
    const orders = tableBuilder({
      data: { id: 7, user_id: "user-1", total: 100, customer_email: "c@x.com" },
      error: null,
    })
    const supabase = mockSupabase({ orders })

    await handlePaymentIntentSucceeded(supabase, {
      id: "pi_low",
      amount_received: 5000,
      metadata: {},
    })

    expect(orders.update).toHaveBeenCalledWith(
      expect.objectContaining({ payment_status: "amount_mismatch" })
    )
    expect(orders.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ payment_status: "paid" })
    )
    expect(confirmPaymentToCustomer).not.toHaveBeenCalled()
    expect(sendOrderStatusEmail).not.toHaveBeenCalled()
  })

  it("succeeded: fallback por metadata.order_id repara el PI canónico", async () => {
    const orders = tableBuilder()
    orders.maybeSingle
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({
        data: { id: 42, user_id: "user-1", total: 50, customer_email: "c@x.com" },
        error: null,
      })
    const supabase = mockSupabase({ orders })

    await handlePaymentIntentSucceeded(supabase, {
      id: "pi_fallback",
      amount_received: 5000,
      metadata: { order_id: "42" },
    })

    expect(orders.update).toHaveBeenCalledWith({ stripe_payment_intent_id: "pi_fallback" })
    expect(orders.update).toHaveBeenCalledWith(
      expect.objectContaining({ payment_status: "paid" })
    )
  })

  it("refunded: marca orders y foodos_orders como refunded", async () => {
    const orders = tableBuilder()
    const foodos = tableBuilder()
    const supabase = mockSupabase({ orders, foodos_orders: foodos })

    await handlePaymentIntentRefunded(supabase, { id: "pi_ref" })

    expect(orders.update).toHaveBeenCalledWith(
      expect.objectContaining({ payment_status: "refunded" })
    )
    expect(foodos.update).toHaveBeenCalledWith(
      expect.objectContaining({ payment_status: "refunded" })
    )
  })

  it("payment_failed: marca orders, foodos_orders y order_upsells", async () => {
    const orders = tableBuilder()
    const foodos = tableBuilder()
    const upsells = tableBuilder()
    const supabase = mockSupabase({ orders, foodos_orders: foodos, order_upsells: upsells })

    await handlePaymentIntentFailed(supabase, { id: "pi_fail" })

    expect(orders.update).toHaveBeenCalledWith(
      expect.objectContaining({ payment_status: "failed" })
    )
    expect(foodos.update).toHaveBeenCalledWith(
      expect.objectContaining({ payment_status: "failed" })
    )
    expect(upsells.update).toHaveBeenCalledWith({ status: "failed" })
  })

  it("canceled: no degrada un pedido ya pagado", async () => {
    const orders = tableBuilder({ data: { id: 7, payment_status: "paid" }, error: null })
    const supabase = mockSupabase({ orders })

    await handlePaymentIntentCanceled(supabase, { id: "pi_cancel" })

    expect(orders.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ payment_status: "failed" })
    )
  })

  it("canceled: marca failed un pedido no pagado", async () => {
    const orders = tableBuilder({ data: { id: 7, payment_status: "pending" }, error: null })
    const supabase = mockSupabase({ orders })

    await handlePaymentIntentCanceled(supabase, { id: "pi_cancel_2" })

    expect(orders.update).toHaveBeenCalledWith(
      expect.objectContaining({ payment_status: "failed" })
    )
  })

  it("canceled: cancellation_reason expired marca expired en FoodOS", async () => {
    const foodos = tableBuilder({ data: { id: "f-1", payment_status: "pending" }, error: null })
    const supabase = mockSupabase({ foodos_orders: foodos })

    await handlePaymentIntentCanceled(supabase, {
      id: "pi_oxxo_exp",
      cancellation_reason: "expired",
    })

    expect(foodos.update).toHaveBeenCalledWith(
      expect.objectContaining({ payment_status: "expired" })
    )
  })

  it("canceled: motivo distinto marca failed en FoodOS", async () => {
    const foodos = tableBuilder({ data: { id: "f-2", payment_status: "pending" }, error: null })
    const supabase = mockSupabase({ foodos_orders: foodos })

    await handlePaymentIntentCanceled(supabase, {
      id: "pi_oxxo_dup",
      cancellation_reason: "duplicate",
    })

    expect(foodos.update).toHaveBeenCalledWith(
      expect.objectContaining({ payment_status: "failed" })
    )
  })

  it("canceled: nunca degrada un pedido FoodOS ya pagado", async () => {
    const foodos = tableBuilder({ data: { id: "f-3", payment_status: "paid" }, error: null })
    const supabase = mockSupabase({ foodos_orders: foodos })

    await handlePaymentIntentCanceled(supabase, {
      id: "pi_oxxo_paid",
      cancellation_reason: "expired",
    })

    expect(foodos.update).not.toHaveBeenCalled()
  })

  it("processing: marca processing solo desde pending (idempotente)", async () => {
    const orders = tableBuilder()
    const foodos = tableBuilder()
    const supabase = mockSupabase({ orders, foodos_orders: foodos })

    await handlePaymentIntentProcessing(supabase, { id: "pi_oxxo" })

    expect(orders.update).toHaveBeenCalledWith(
      expect.objectContaining({ payment_status: "processing" })
    )
    expect(foodos.update).toHaveBeenCalledWith(
      expect.objectContaining({ payment_status: "processing" })
    )
    // El guard evita degradar un pedido ya pagado si Stripe re-entrega el
    // evento fuera de orden.
    expect(orders.eq).toHaveBeenCalledWith("payment_status", "pending")
    expect(foodos.eq).toHaveBeenCalledWith("payment_status", "pending")
  })

  it("expired: solo degrada estados no terminales en FoodOS", async () => {
    const foodos = tableBuilder()
    const supabase = mockSupabase({ foodos_orders: foodos })

    await handleFoodosPaymentIntentExpired(supabase, { id: "pi_oxxo_ttl" })

    expect(foodos.update).toHaveBeenCalledWith(
      expect.objectContaining({ payment_status: "expired" })
    )
    expect(foodos.eq).toHaveBeenCalledWith("stripe_payment_intent_id", "pi_oxxo_ttl")
    expect(foodos.in).toHaveBeenCalledWith("payment_status", ["pending", "processing"])
  })

  // Regresión: `foodos_orders` NO tiene columna `updated_at` (a diferencia de
  // `orders`). PostgREST rechaza el UPDATE completo con PGRST204, y como el
  // error no se inspeccionaba, el pedido se quedaba en `pending` para siempre
  // aunque el cobro se hubiera acreditado. Ningún handler debe reintroducirlo.
  it("ningún handler escribe updated_at en foodos_orders", async () => {
    const foodos = tableBuilder({
      data: { id: "f-x", total: 100, payment_status: "pending" },
      error: null,
    })
    const supabase = mockSupabase({
      orders: tableBuilder({
        data: { id: 7, user_id: "u-1", total: 100, payment_status: "pending" },
        error: null,
      }),
      foodos_orders: foodos,
      order_upsells: tableBuilder(),
    })

    await handlePaymentIntentSucceeded(supabase, {
      id: "pi_reg",
      amount_received: 10000,
      metadata: {},
      payment_method: null,
      customer: null,
      receipt_email: null,
    })
    await handlePaymentIntentRefunded(supabase, { id: "pi_reg" })
    await handlePaymentIntentFailed(supabase, { id: "pi_reg" })
    await handlePaymentIntentCanceled(supabase, { id: "pi_reg" })
    await handlePaymentIntentProcessing(supabase, { id: "pi_reg" })
    await handleFoodosPaymentIntentExpired(supabase, { id: "pi_reg" })

    expect(foodos.update).toHaveBeenCalled()
    for (const call of foodos.update.mock.calls) {
      expect(call[0]).not.toHaveProperty("updated_at")
    }
  })

  it("succeeded sin orden ligada no falla ni dispara workflows", async () => {
    const orders = tableBuilder({ data: null, error: null })
    const supabase = mockSupabase({ orders })

    await handlePaymentIntentSucceeded(supabase, {
      id: "pi_huerfano",
      amount_received: 1000,
      metadata: {},
    })

    expect(orders.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ payment_status: "paid" })
    )
    expect(confirmPaymentToCustomer).not.toHaveBeenCalled()
    expect(logger.info).toHaveBeenCalled()
  })
})
