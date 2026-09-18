import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }))
vi.mock("@/lib/admin-auth", () => ({ requireAdmin: vi.fn() }))
vi.mock("@/lib/audit-log", () => ({ logAdminAction: vi.fn() }))
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))

const refundsCreate = vi.fn()
const paymentIntentsRetrieve = vi.fn()
const chargesRetrieve = vi.fn()

vi.mock("@/lib/stripe", () => ({
  getStripe: () => ({
    refunds: { create: refundsCreate },
    paymentIntents: { retrieve: paymentIntentsRetrieve },
    charges: { retrieve: chargesRetrieve },
  }),
}))

import { POST } from "./route"
import { createServiceClient } from "@/lib/supabase/service"
import { requireAdmin } from "@/lib/admin-auth"
import { logAdminAction } from "@/lib/audit-log"

const URL = "http://localhost/api/admin/orders/42/refund"

function asAdmin() {
  vi.mocked(requireAdmin).mockResolvedValue({
    user: { id: "admin-1", email: "admin@resurte.me" },
    response: null,
  } as never)
}

function asDenied() {
  vi.mocked(requireAdmin).mockResolvedValue({
    user: null,
    response: new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }),
  } as never)
}

type StoreOptions = {
  order?: Record<string, unknown> | null
  readError?: unknown
  updateError?: unknown
}

/** Cliente de servicio mínimo para `from().select().eq().maybeSingle()` y `update().eq()`. */
function serviceWith(opts: StoreOptions = {}) {
  const updateEq = vi.fn((..._args: unknown[]) =>
    Promise.resolve({ error: opts.updateError ?? null })
  )
  const update = vi.fn((..._args: unknown[]) => ({ eq: updateEq }))
  const maybeSingle = vi
    .fn()
    .mockResolvedValue({ data: opts.order ?? null, error: opts.readError ?? null })
  const eq = vi.fn(() => ({ maybeSingle }))
  const select = vi.fn(() => ({ eq }))
  const from = vi.fn(() => ({ select, update }))
  return { from, update, updateEq, select, eq, maybeSingle }
}

const PAID_ORDER = {
  id: 42,
  payment_status: "paid",
  stripe_payment_intent_id: "pi_1",
  connected_account_id: "acct_1",
  application_fee_amount: 1_500,
  refunded_amount_cents: 0,
}

function post(body: unknown = {}) {
  return new NextRequest(URL, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  })
}

const params = Promise.resolve({ id: "42" })

beforeEach(() => {
  vi.clearAllMocks()
  asAdmin()
  paymentIntentsRetrieve.mockResolvedValue({ id: "pi_1", latest_charge: "ch_1" })
  chargesRetrieve.mockResolvedValue({ id: "ch_1", amount: 80_000, amount_refunded: 0 })
  refundsCreate.mockResolvedValue({ id: "re_1", amount: 80_000, status: "succeeded" })
})

describe("POST /api/admin/orders/[id]/refund", () => {
  it("rechaza a quien no es admin y no toca Stripe", async () => {
    asDenied()
    const res = await POST(post(), { params })
    expect(res.status).toBe(403)
    expect(refundsCreate).not.toHaveBeenCalled()
  })

  it("rechaza un id que no es numérico", async () => {
    vi.mocked(createServiceClient).mockResolvedValue(serviceWith() as never)
    const res = await POST(post(), { params: Promise.resolve({ id: "abc" }) })
    expect(res.status).toBe(400)
    expect(refundsCreate).not.toHaveBeenCalled()
  })

  it("devuelve 404 si el pedido no existe", async () => {
    vi.mocked(createServiceClient).mockResolvedValue(
      serviceWith({ order: null }) as never
    )
    const res = await POST(post(), { params })
    expect(res.status).toBe(404)
    expect(refundsCreate).not.toHaveBeenCalled()
  })

  it("rechaza reembolsar un pedido que no está pagado", async () => {
    vi.mocked(createServiceClient).mockResolvedValue(
      serviceWith({ order: { ...PAID_ORDER, payment_status: "pending" } }) as never
    )
    const res = await POST(post(), { params })
    expect(res.status).toBe(409)
    expect(refundsCreate).not.toHaveBeenCalled()
  })

  it("rechaza un pedido sin cobro de Stripe asociado", async () => {
    vi.mocked(createServiceClient).mockResolvedValue(
      serviceWith({
        order: { ...PAID_ORDER, stripe_payment_intent_id: null },
      }) as never
    )
    const res = await POST(post(), { params })
    expect(res.status).toBe(409)
    expect(refundsCreate).not.toHaveBeenCalled()
  })

  it("rechaza un amount_cents que no es entero positivo", async () => {
    vi.mocked(createServiceClient).mockResolvedValue(
      serviceWith({ order: PAID_ORDER }) as never
    )
    const res = await POST(post({ amount_cents: -5 }), { params })
    expect(res.status).toBe(400)
    expect(refundsCreate).not.toHaveBeenCalled()
  })

  it("rechaza un monto mayor a lo que queda por reembolsar", async () => {
    vi.mocked(createServiceClient).mockResolvedValue(
      serviceWith({ order: PAID_ORDER }) as never
    )
    const res = await POST(post({ amount_cents: 90_000 }), { params })
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ refundable_cents: 80_000 })
    expect(refundsCreate).not.toHaveBeenCalled()
  })

  it("rechaza cuando ya no queda nada por reembolsar", async () => {
    vi.mocked(createServiceClient).mockResolvedValue(
      serviceWith({
        order: { ...PAID_ORDER, payment_status: "partially_refunded", refunded_amount_cents: 80_000 },
      }) as never
    )
    const res = await POST(post(), { params })
    expect(res.status).toBe(409)
    expect(refundsCreate).not.toHaveBeenCalled()
  })

  it("reembolso total: revierte la transferencia y devuelve la comisión", async () => {
    const store = serviceWith({ order: PAID_ORDER })
    vi.mocked(createServiceClient).mockResolvedValue(store as never)

    const res = await POST(post(), { params })

    expect(res.status).toBe(200)
    expect(refundsCreate).toHaveBeenCalledWith({
      payment_intent: "pi_1",
      amount: 80_000,
      metadata: { order_id: "42" },
      reverse_transfer: true,
      refund_application_fee: true,
    })
    expect(store.update).toHaveBeenCalledWith({
      payment_status: "refunded",
      refunded_amount_cents: 80_000,
      stripe_refund_id: "re_1",
      updated_at: expect.any(String),
    })
    expect(await res.json()).toMatchObject({
      ok: true,
      payment_status: "refunded",
      reversed_transfer: true,
    })
  })

  it("reembolso parcial: no marca `refunded` ni revierte el cashback completo", async () => {
    // El bug que este camino cierra: $50 sobre un pedido de $800 marcado
    // `refunded` disparaba la reversión TOTAL del cashback en el trigger 00135.
    const store = serviceWith({ order: PAID_ORDER })
    vi.mocked(createServiceClient).mockResolvedValue(store as never)
    refundsCreate.mockResolvedValue({ id: "re_2", amount: 5_000, status: "succeeded" })

    const res = await POST(post({ amount_cents: 5_000 }), { params })

    expect(res.status).toBe(200)
    expect(refundsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 5_000, reverse_transfer: true })
    )
    expect(store.update).toHaveBeenCalledWith(
      expect.objectContaining({ payment_status: "partially_refunded", refunded_amount_cents: 5_000 })
    )
  })

  it("acumula sobre un reembolso parcial previo", async () => {
    const store = serviceWith({
      order: { ...PAID_ORDER, payment_status: "partially_refunded", refunded_amount_cents: 30_000 },
    })
    vi.mocked(createServiceClient).mockResolvedValue(store as never)
    refundsCreate.mockResolvedValue({ id: "re_3", amount: 50_000, status: "succeeded" })

    await POST(post(), { params })

    // Quedaban 50,000: el reembolso por defecto es el remanente y cierra el pedido.
    expect(refundsCreate).toHaveBeenCalledWith(expect.objectContaining({ amount: 50_000 }))
    expect(store.update).toHaveBeenCalledWith(
      expect.objectContaining({ payment_status: "refunded", refunded_amount_cents: 80_000 })
    )
  })

  it("sin cuenta conectada no pide revertir transferencia ni comisión", async () => {
    const store = serviceWith({
      order: { ...PAID_ORDER, connected_account_id: null, application_fee_amount: 0 },
    })
    vi.mocked(createServiceClient).mockResolvedValue(store as never)

    await POST(post(), { params })

    const arg = refundsCreate.mock.calls[0]?.[0] as Record<string, unknown>
    expect(arg.reverse_transfer).toBeUndefined()
    expect(arg.refund_application_fee).toBeUndefined()
  })

  it("sigue revirtiendo si el pedido se enrutó aunque la bandera se apagara", async () => {
    // El dato real es `connected_account_id`, no la variable de entorno.
    const store = serviceWith({ order: PAID_ORDER })
    vi.mocked(createServiceClient).mockResolvedValue(store as never)

    await POST(post(), { params })

    expect(refundsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ reverse_transfer: true })
    )
  })

  it("toma el importe cobrado de Stripe, no de orders.total", async () => {
    // `orders.total` puede no coincidir (propina añadida al PaymentIntent):
    // comparar contra el total declararía "total" un reembolso incompleto.
    const store = serviceWith({ order: { ...PAID_ORDER, total: 50_000 } })
    vi.mocked(createServiceClient).mockResolvedValue(store as never)
    chargesRetrieve.mockResolvedValue({ id: "ch_1", amount: 80_000, amount_refunded: 0 })

    const res = await POST(post(), { params })

    expect(await res.json()).toMatchObject({ payment_status: "refunded" })
    expect(store.update).toHaveBeenCalledWith(
      expect.objectContaining({ refunded_amount_cents: 80_000 })
    )
  })

  it("deja el reembolso en la bitácora con importe y motivo", async () => {
    vi.mocked(createServiceClient).mockResolvedValue(
      serviceWith({ order: PAID_ORDER }) as never
    )

    await POST(post({ reason: "Pedido incompleto" }), { params })

    expect(logAdminAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "order_refund",
        entity: "orders",
        entityId: 42,
        detail: expect.objectContaining({
          amount_cents: 80_000,
          status: "refunded",
          routed: true,
          refund_id: "re_1",
          reason: "Pedido incompleto",
        }),
      })
    )
  })

  it("si Stripe devuelve el reembolso pero falla el registro, avisa en vez de mentir", async () => {
    // El dinero ya salió y no se puede deshacer: la respuesta tiene que decir
    // que hay que revisar, no fingir que todo quedó cuadrado.
    vi.mocked(createServiceClient).mockResolvedValue(
      serviceWith({ order: PAID_ORDER, updateError: { message: "boom" } }) as never
    )

    const res = await POST(post(), { params })

    expect(res.status).toBe(500)
    expect(await res.json()).toMatchObject({ refund_id: "re_1" })
    expect(logAdminAction).not.toHaveBeenCalled()
  })

  it("si Stripe rechaza el reembolso responde 500 y no escribe en el pedido", async () => {
    const store = serviceWith({ order: PAID_ORDER })
    vi.mocked(createServiceClient).mockResolvedValue(store as never)
    refundsCreate.mockRejectedValue(new Error("charge already refunded"))

    const res = await POST(post(), { params })

    expect(res.status).toBe(500)
    expect(store.update).not.toHaveBeenCalled()
    expect(logAdminAction).not.toHaveBeenCalled()
  })
})
