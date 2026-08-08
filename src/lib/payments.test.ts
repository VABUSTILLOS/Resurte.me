import { describe, expect, it, vi, beforeEach } from "vitest"

vi.mock("@/lib/stripe", () => ({ getStripe: vi.fn() }))
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(),
}))

import { createPaymentIntentForOrder, PaymentIntentError } from "@/lib/payments"
import { getStripe } from "@/lib/stripe"
import { createServiceClient } from "@/lib/supabase/service"

/** Construye el mock de Supabase con las consultas que hace el módulo. */
function makeSupabase(opts: {
  order?: Record<string, unknown> | null
  foodosOrder?: Record<string, unknown> | null
  guestAddresses?: number[]
  addressGuestToken?: string | null
} = {}) {
  const {
    order = { id: 42, user_id: "u1", payment_method: "card", payment_status: "pending", total: 150, address_id: 7, customer_email: "buyer@example.com" },
    foodosOrder = null,
    guestAddresses = [],
    addressGuestToken = null,
  } = opts

  return {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === "orders") {
        const eqForMaybeSingle = vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: order, error: null }),
        })
        const update = vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: null, error: null }),
        })
        return {
          select: vi.fn().mockImplementation((cols: string) => {
            // La búsqueda de prior (stripe_customer_id) no se usa en estos
            // tests; devolver null para la rama de reuse de customer.
            if (cols.includes("stripe_customer_id")) {
              const limit = vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              })
              return {
                eq: vi.fn().mockReturnValue({
                  not: vi.fn().mockReturnValue({
                    order: vi.fn().mockReturnValue({ limit }),
                  }),
                }),
              }
            }
            return { eq: eqForMaybeSingle }
          }),
          update,
        }
      }
      if (table === "addresses") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({
                data: guestAddresses.map((id) => ({ id })),
                error: null,
              }),
              maybeSingle: vi.fn().mockResolvedValue({
                data: addressGuestToken ? { guest_token: addressGuestToken } : null,
                error: null,
              }),
            }),
          }),
        }
      }
      if (table === "foodos_orders") {
        const eq = vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: foodosOrder, error: null }),
        })
        const update = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: null, error: null }) })
        return { select: vi.fn().mockReturnValue({ eq }), update }
      }
      return { select: vi.fn().mockResolvedValue({ data: null, error: null }) }
    }),
  }
}

describe("createPaymentIntentForOrder — guardado de método de pago", () => {
  const stripe = {
    paymentIntents: { create: vi.fn() },
    customers: { create: vi.fn() },
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getStripe).mockReturnValue(stripe as never)
    vi.mocked(createServiceClient).mockResolvedValue(makeSupabase() as never)
    stripe.paymentIntents.create.mockResolvedValue({
      id: "pi_123",
      client_secret: "secret_123",
    })
    stripe.customers.create.mockResolvedValue({ id: "cus_new" })
  })

  it("sin consentimiento no crea customer ni setup_future_usage", async () => {
    const result = await createPaymentIntentForOrder({
      type: "main",
      orderId: 42,
      userId: "u1",
      saveCardConsent: false,
    })

    expect(result.saveCardEnabled).toBe(false)
    expect(stripe.customers.create).not.toHaveBeenCalled()
    const intent = stripe.paymentIntents.create.mock.calls[0]?.[0]
    expect(intent.payment_method_options).toBeUndefined()
    expect(intent.customer).toBeUndefined()
  })

  it("con consentimiento crea customer y fija setup_future_usage=off_session", async () => {
    const result = await createPaymentIntentForOrder({
      type: "main",
      orderId: 42,
      userId: "u1",
      saveCardConsent: true,
      customerEmail: "buyer@example.com",
    })

    expect(result.saveCardEnabled).toBe(true)
    expect(stripe.customers.create).toHaveBeenCalledWith(
      expect.objectContaining({ email: "buyer@example.com" })
    )
    const intent = stripe.paymentIntents.create.mock.calls[0]?.[0]
    expect(intent.customer).toBe("cus_new")
    expect(intent.payment_method_options).toEqual({
      card: { setup_future_usage: "off_session" },
    })
  })

  it("si Stripe falla al crear el customer, el pago base NO se bloquea", async () => {
    stripe.customers.create.mockRejectedValue(new Error("stripe down"))
    const result = await createPaymentIntentForOrder({
      type: "main",
      orderId: 42,
      userId: "u1",
      saveCardConsent: true,
    })

    expect(result.saveCardEnabled).toBe(false)
    expect(stripe.paymentIntents.create).toHaveBeenCalledTimes(1)
    const intent = stripe.paymentIntents.create.mock.calls[0]?.[0]
    expect(intent.customer).toBeUndefined()
  })

  it("foodos nunca habilita el guardado de método", async () => {
    vi.mocked(createServiceClient).mockResolvedValue(
      makeSupabase({
        foodosOrder: { id: 9, payment_method: "card", payment_status: "pending", total: 80, restaurant_id: "r1" },
      }) as never
    )

    const result = await createPaymentIntentForOrder({
      type: "foodos",
      orderId: 9,
      saveCardConsent: true,
    })
    expect(result.saveCardEnabled).toBe(false)
    expect(stripe.customers.create).not.toHaveBeenCalled()
  })

  it("lanza PaymentIntentError si el pedido no está pendiente", async () => {
    vi.mocked(createServiceClient).mockResolvedValue(
      makeSupabase({
        order: { id: 42, user_id: "u1", payment_method: "card", payment_status: "paid", total: 150 },
      }) as never
    )
    await expect(
      createPaymentIntentForOrder({ type: "main", orderId: 42, userId: "u1" })
    ).rejects.toBeInstanceOf(PaymentIntentError)
  })

  it("lanza PaymentIntentError si el pedido no usa tarjeta", async () => {
    vi.mocked(createServiceClient).mockResolvedValue(
      makeSupabase({
        order: { id: 42, user_id: "u1", payment_method: "spei", payment_status: "pending", total: 150 },
      }) as never
    )
    await expect(
      createPaymentIntentForOrder({ type: "main", orderId: 42, userId: "u1" })
    ).rejects.toThrow("pago con tarjeta")
  })
})
