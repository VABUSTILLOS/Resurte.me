import { describe, expect, it, vi, beforeEach } from "vitest"

vi.mock("@/lib/stripe", () => ({ getStripe: vi.fn() }))
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(),
}))

import { chargeOrderWithSavedCard, PaymentIntentError } from "@/lib/payments"
import { getStripe } from "@/lib/stripe"
import { createServiceClient } from "@/lib/supabase/service"

const PENDING_ORDER = {
  id: 99,
  user_id: "u1",
  payment_method: "card",
  payment_status: "pending",
  total: 250,
  stripe_payment_intent_id: null,
}

const PRIOR_PAID = {
  stripe_payment_method_id: "pm_saved",
  stripe_customer_id: "cus_saved",
}

function makeSupabase(opts: {
  order?: Record<string, unknown> | null
  priorPaid?: Record<string, unknown> | null
  updateResult?: { data: unknown; error: unknown }
} = {}) {
  const {
    order = PENDING_ORDER,
    priorPaid = PRIOR_PAID,
    updateResult = { data: null, error: null },
  } = opts

  return {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === "orders") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockImplementation((col: string) => {
              if (col === "id") {
                return {
                  maybeSingle: vi.fn().mockResolvedValue({ data: order, error: null }),
                }
              }
              // col === "user_id" → búsqueda de orden pagada previa con tarjeta.
              return {
                eq: vi.fn().mockReturnValue({
                  not: vi.fn().mockReturnValue({
                    order: vi.fn().mockReturnValue({
                      limit: vi.fn().mockReturnValue({
                        maybeSingle: vi.fn().mockResolvedValue({
                          data: priorPaid,
                          error: null,
                        }),
                      }),
                    }),
                  }),
                }),
              }
            }),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue(updateResult),
          }),
        }
      }
      return { select: vi.fn().mockResolvedValue({ data: null, error: null }) }
    }),
  }
}

describe("chargeOrderWithSavedCard — Express Checkout 1-click", () => {
  const stripe = {
    paymentIntents: { create: vi.fn(), retrieve: vi.fn() },
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getStripe).mockReturnValue(stripe as never)
    vi.mocked(createServiceClient).mockResolvedValue(makeSupabase() as never)
  })

  it("cobra off-session con la tarjeta guardada y persiste el PI en la orden", async () => {
    vi.mocked(stripe.paymentIntents.create).mockResolvedValue({
      id: "pi_new",
      status: "succeeded",
      client_secret: "cs_live",
    } as never)

    const result = await chargeOrderWithSavedCard({ orderId: 99, userId: "u1" })

    expect(result).toEqual({ status: "succeeded", paymentIntentId: "pi_new" })
    expect(stripe.paymentIntents.create).toHaveBeenCalledWith({
      amount: 25000,
      currency: "mxn",
      payment_method: "pm_saved",
      customer: "cus_saved",
      off_session: true,
      confirm: true,
      metadata: { order_id: "99", source: "resurte.me-express" },
    })
  })

  it("devuelve no_saved_card sin cobrar si el usuario no tiene tarjeta guardada", async () => {
    vi.mocked(createServiceClient).mockResolvedValue(
      makeSupabase({ priorPaid: null }) as never
    )

    const result = await chargeOrderWithSavedCard({ orderId: 99, userId: "u1" })

    expect(result).toEqual({ status: "no_saved_card" })
    expect(stripe.paymentIntents.create).not.toHaveBeenCalled()
  })

  it("devuelve requires_action con clientSecret cuando el banco pide 3DS", async () => {
    vi.mocked(stripe.paymentIntents.create).mockResolvedValue({
      id: "pi_3ds",
      status: "requires_action",
      client_secret: "cs_3ds",
    } as never)

    const result = await chargeOrderWithSavedCard({ orderId: 99, userId: "u1" })

    expect(result).toEqual({
      status: "requires_action",
      clientSecret: "cs_3ds",
      paymentIntentId: "pi_3ds",
    })
  })

  it("reconcilia authentication_required lanzado por Stripe (off_session decline 3DS)", async () => {
    const err = Object.assign(new Error("authentication_required"), {
      code: "authentication_required",
      payment_intent: { id: "pi_3ds_b", client_secret: "cs_3ds_b" },
    })
    vi.mocked(stripe.paymentIntents.create).mockRejectedValue(err)

    const result = await chargeOrderWithSavedCard({ orderId: 99, userId: "u1" })

    expect(result).toEqual({
      status: "requires_action",
      clientSecret: "cs_3ds_b",
      paymentIntentId: "pi_3ds_b",
    })
  })

  it("devuelve declined sin mutar la orden si el cargo falla", async () => {
    vi.mocked(stripe.paymentIntents.create).mockRejectedValue(
      new Error("Your card has insufficient funds.")
    )

    const result = await chargeOrderWithSavedCard({ orderId: 99, userId: "u1" })

    expect(result).toEqual({ status: "declined" })
  })

  it("reconcilia un PaymentIntent existente ya succeeded (idempotencia, sin doble cargo)", async () => {
    vi.mocked(stripe.paymentIntents.retrieve).mockResolvedValue({
      id: "pi_existing",
      status: "succeeded",
      client_secret: null,
    } as never)

    const order = { ...PENDING_ORDER, stripe_payment_intent_id: "pi_existing" }
    vi.mocked(createServiceClient).mockResolvedValue(
      makeSupabase({ order }) as never
    )

    const result = await chargeOrderWithSavedCard({ orderId: 99, userId: "u1" })

    expect(result).toEqual({ status: "succeeded", paymentIntentId: "pi_existing" })
    expect(stripe.paymentIntents.create).not.toHaveBeenCalled()
  })

  it("reconcilia un PaymentIntent existente en requires_action", async () => {
    vi.mocked(stripe.paymentIntents.retrieve).mockResolvedValue({
      id: "pi_ra",
      status: "requires_action",
      client_secret: "cs_ra",
    } as never)

    const order = { ...PENDING_ORDER, stripe_payment_intent_id: "pi_ra" }
    vi.mocked(createServiceClient).mockResolvedValue(
      makeSupabase({ order }) as never
    )

    const result = await chargeOrderWithSavedCard({ orderId: 99, userId: "u1" })

    expect(result).toEqual({
      status: "requires_action",
      clientSecret: "cs_ra",
      paymentIntentId: "pi_ra",
    })
  })

  it("lanza 404 si la orden no existe", async () => {
    vi.mocked(createServiceClient).mockResolvedValue(
      makeSupabase({ order: null }) as never
    )

    await expect(
      chargeOrderWithSavedCard({ orderId: 999, userId: "u1" })
    ).rejects.toThrowError(new PaymentIntentError("Pedido no encontrado", 404))
  })

  it("lanza 403 si la orden no es del usuario autenticado", async () => {
    await expect(
      chargeOrderWithSavedCard({ orderId: 99, userId: "otro-usuario" })
    ).rejects.toThrowError(new PaymentIntentError("No autorizado para este pedido", 403))
  })

  it("lanza 400 si el pedido no usa tarjeta o ya no está pendiente", async () => {
    vi.mocked(createServiceClient).mockResolvedValue(
      makeSupabase({ order: { ...PENDING_ORDER, payment_method: "cash" } }) as never
    )
    await expect(
      chargeOrderWithSavedCard({ orderId: 99, userId: "u1" })
    ).rejects.toThrowError(new PaymentIntentError("El pedido no usa pago con tarjeta"))

    vi.mocked(createServiceClient).mockResolvedValue(
      makeSupabase({ order: { ...PENDING_ORDER, payment_status: "paid" } }) as never
    )
    await expect(
      chargeOrderWithSavedCard({ orderId: 99, userId: "u1" })
    ).rejects.toThrowError(new PaymentIntentError("El pedido ya no está pendiente de pago"))
  })
})
