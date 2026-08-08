import { describe, expect, it, vi, beforeEach } from "vitest"

vi.mock("@/lib/stripe", () => ({ getStripe: vi.fn() }))
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(),
}))

import { processUpsellForOrder, PaymentIntentError } from "@/lib/payments"
import { getStripe } from "@/lib/stripe"
import { createServiceClient } from "@/lib/supabase/service"

const PAID_ORDER = {
  id: 42,
  user_id: "u1",
  payment_status: "paid",
  status: "confirmed",
  stripe_payment_method_id: "pm_123",
  stripe_customer_id: "cus_123",
  address_id: 7,
  store_id: 1,
}

const PRODUCT = {
  id: 77,
  name: "Pack de agua 12L",
  price: 120,
  sale_price: null,
  stock_status: "in_stock",
}

function makeSupabase(opts: {
  order?: Record<string, unknown> | null
  product?: Record<string, unknown> | null
  bumpRule?: Record<string, unknown> | null
  existingPaidUpsell?: Record<string, unknown> | null
  addressGuestToken?: string | null
} = {}) {
  const {
    order = PAID_ORDER,
    product = PRODUCT,
    bumpRule = { discount_pct: 0.25 },
    existingPaidUpsell = null,
    addressGuestToken = "gt-owner",
  } = opts

  const insertedRows: Record<string, unknown>[] = []

  return {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === "orders") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: order, error: null }),
            }),
          }),
        }
      }
      if (table === "addresses") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: addressGuestToken ? { guest_token: addressGuestToken } : null,
                error: null,
              }),
            }),
          }),
        }
      }
      if (table === "order_upsells") {
        // Rama de idempotencia: busca el último upsell para la llave y
        // reconcilia requires_action vía Stripe si aplica.
        const selectPaid = vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: existingPaidUpsell,
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        })
        const insert = vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockImplementation(() => {
              const row = { id: 1001 }
              insertedRows.push({ table: "order_upsells", row })
              return Promise.resolve({ data: row, error: null })
            }),
          }),
        })
        const update = vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: null, error: null }),
        })
        return { select: selectPaid, insert, update }
      }
      if (table === "products") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: product, error: null }),
            }),
          }),
        }
      }
      if (table === "bump_rules") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: bumpRule, error: null }),
                }),
              }),
            }),
          }),
        }
      }
      if (table === "order_items") {
        return {
          insert: vi.fn().mockImplementation((row: unknown) => {
            insertedRows.push({ table: "order_items", row })
            return Promise.resolve({ data: null, error: null })
          }),
        }
      }
      return { select: vi.fn().mockResolvedValue({ data: null, error: null }) }
    }),
  }
}

describe("processUpsellForOrder — 1-click upsells off-session", () => {
  const stripe = {
    paymentIntents: { create: vi.fn(), retrieve: vi.fn() },
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getStripe).mockReturnValue(stripe as never)
    vi.mocked(createServiceClient).mockResolvedValue(makeSupabase() as never)
  })

  it("cobra off-session y registra el upsell como pagado sin tocar orders.total", async () => {
    stripe.paymentIntents.create.mockResolvedValue({
      id: "pi_upsell",
      status: "succeeded",
      client_secret: null,
    })

    const result = await processUpsellForOrder({
      orderId: 42,
      productId: 77,
      quantity: 2,
      idempotencyKey: "key-abc",
      userId: "u1",
    })

    expect(result.status).toBe("succeeded")
    expect(result.status === "succeeded" && result.amount).toBe(180) // 120 * 2 * (1 - 0.25)
    expect(stripe.paymentIntents.create).toHaveBeenCalledTimes(1)
    const [params, options] = stripe.paymentIntents.create.mock.calls[0] as [Record<string, unknown>, { idempotencyKey: string }]
    expect(params).toMatchObject({
      amount: 18000,
      currency: "mxn",
      payment_method: "pm_123",
      customer: "cus_123",
      off_session: true,
      confirm: true,
    })
    expect(options.idempotencyKey).toBe("upsell-1001")
  })

  it("idempotencia: devuelve el upsell ya pagado sin volver a cobrar", async () => {
    vi.mocked(createServiceClient).mockResolvedValue(
      makeSupabase({
        existingPaidUpsell: { id: 99, stripe_payment_intent_id: "pi_prev", amount: 180, status: "paid" },
      }) as never
    )

    const result = await processUpsellForOrder({
      orderId: 42,
      productId: 77,
      quantity: 2,
      idempotencyKey: "key-abc",
      userId: "u1",
    })

    expect(result).toEqual({
      status: "succeeded",
      paymentIntentId: "pi_prev",
      orderUpsellId: 99,
      amount: 180,
    })
    expect(stripe.paymentIntents.create).not.toHaveBeenCalled()
  })

  it("reconcilia 3DS: upsell requires_action ya pagado en Stripe → marca paid e inserta items sin cobrar de nuevo", async () => {
    vi.mocked(createServiceClient).mockResolvedValue(
      makeSupabase({
        existingPaidUpsell: {
          id: 99,
          stripe_payment_intent_id: "pi_3ds",
          amount: 180,
          status: "requires_action",
        },
      }) as never
    )
    stripe.paymentIntents.retrieve.mockResolvedValue({
      id: "pi_3ds",
      status: "succeeded",
      client_secret: null,
    })

    const result = await processUpsellForOrder({
      orderId: 42,
      productId: 77,
      quantity: 2,
      idempotencyKey: "key-abc",
      userId: "u1",
    })

    expect(result).toEqual({
      status: "succeeded",
      paymentIntentId: "pi_3ds",
      orderUpsellId: 99,
      amount: 180,
    })
    expect(stripe.paymentIntents.retrieve).toHaveBeenCalledWith("pi_3ds")
    expect(stripe.paymentIntents.create).not.toHaveBeenCalled()
  })

  it("reconcilia 3DS: upsell sigue en requires_action en Stripe → devuelve el mismo clientSecret sin cobrar de nuevo", async () => {
    vi.mocked(createServiceClient).mockResolvedValue(
      makeSupabase({
        existingPaidUpsell: {
          id: 99,
          stripe_payment_intent_id: "pi_3ds",
          amount: 180,
          status: "requires_action",
        },
      }) as never
    )
    stripe.paymentIntents.retrieve.mockResolvedValue({
      id: "pi_3ds",
      status: "requires_action",
      client_secret: "pi_3ds_secret_xyz",
    })

    const result = await processUpsellForOrder({
      orderId: 42,
      productId: 77,
      quantity: 2,
      idempotencyKey: "key-abc",
      userId: "u1",
    })

    expect(result).toEqual({
      status: "requires_action",
      clientSecret: "pi_3ds_secret_xyz",
      paymentIntentId: "pi_3ds",
      orderUpsellId: 99,
    })
    expect(stripe.paymentIntents.create).not.toHaveBeenCalled()
  })

  it("reconcilia 3DS: intent no recuperable (canceled) → marca failed y crea cargo nuevo", async () => {
    vi.mocked(createServiceClient).mockResolvedValue(
      makeSupabase({
        existingPaidUpsell: {
          id: 99,
          stripe_payment_intent_id: "pi_3ds",
          amount: 180,
          status: "requires_action",
        },
      }) as never
    )
    stripe.paymentIntents.retrieve.mockResolvedValue({
      id: "pi_3ds",
      status: "canceled",
      client_secret: null,
    })
    stripe.paymentIntents.create.mockResolvedValue({
      id: "pi_upsell",
      status: "succeeded",
      client_secret: null,
    })

    const result = await processUpsellForOrder({
      orderId: 42,
      productId: 77,
      quantity: 2,
      idempotencyKey: "key-abc",
      userId: "u1",
    })

    expect(result.status).toBe("succeeded")
    expect(stripe.paymentIntents.retrieve).toHaveBeenCalledWith("pi_3ds")
    expect(stripe.paymentIntents.create).toHaveBeenCalledTimes(1)
  })

  it("rechaza pedidos que no están pagados/confirmados", async () => {
    vi.mocked(createServiceClient).mockResolvedValue(
      makeSupabase({
        order: { ...PAID_ORDER, payment_status: "pending", status: "pending" },
      }) as never
    )

    await expect(
      processUpsellForOrder({
        orderId: 42,
        productId: 77,
        quantity: 1,
        idempotencyKey: "key-abc",
        userId: "u1",
      })
    ).rejects.toThrow("no está confirmado")
  })

  it("rechaza pedidos sin método de pago guardado (wallet/Link)", async () => {
    vi.mocked(createServiceClient).mockResolvedValue(
      makeSupabase({
        order: { ...PAID_ORDER, stripe_payment_method_id: null },
      }) as never
    )

    await expect(
      processUpsellForOrder({
        orderId: 42,
        productId: 77,
        quantity: 1,
        idempotencyKey: "key-abc",
        userId: "u1",
      })
    ).rejects.toThrow("método de pago guardado")
  })

  it("rechaza si el pedido pertenece a otro usuario", async () => {
    await expect(
      processUpsellForOrder({
        orderId: 42,
        productId: 77,
        quantity: 1,
        idempotencyKey: "key-abc",
        userId: "other-user",
      })
    ).rejects.toThrow("No autorizado")
  })

  it("cargo declinado: marca failed y lanza error, la orden base queda intacta", async () => {
    const err = Object.assign(new Error("card_declined"), {
      code: "card_declined",
    })
    stripe.paymentIntents.create.mockRejectedValue(err)

    await expect(
      processUpsellForOrder({
        orderId: 42,
        productId: 77,
        quantity: 1,
        idempotencyKey: "key-abc",
        userId: "u1",
      })
    ).rejects.toBeInstanceOf(PaymentIntentError)

    const supabase = await createServiceClient()
    // No debe haber insertado order_items (el upsell no se pagó)
    const fromMock = vi.mocked(supabase.from)
    const itemInserts = fromMock.mock.calls.filter((c) => c[0] === "order_items")
    expect(itemInserts).toHaveLength(0)
  })

  it("3DS requerido: devuelve clientSecret para confirmPayment en el modal", async () => {
    const err = Object.assign(new Error("authentication_required"), {
      code: "authentication_required",
      payment_intent: { id: "pi_3ds", client_secret: "secret_3ds" },
    })
    stripe.paymentIntents.create.mockRejectedValue(err)

    const result = await processUpsellForOrder({
      orderId: 42,
      productId: 77,
      quantity: 1,
      idempotencyKey: "key-abc",
      userId: "u1",
    })

    expect(result).toEqual({
      status: "requires_action",
      clientSecret: "secret_3ds",
      paymentIntentId: "pi_3ds",
      orderUpsellId: 1001,
    })
  })

  it("sin bump_rule aplica precio completo (sin descuento)", async () => {
    vi.mocked(createServiceClient).mockResolvedValue(
      makeSupabase({ bumpRule: null }) as never
    )
    stripe.paymentIntents.create.mockResolvedValue({
      id: "pi_full",
      status: "succeeded",
      client_secret: null,
    })

    const result = await processUpsellForOrder({
      orderId: 42,
      productId: 77,
      quantity: 1,
      idempotencyKey: "key-abc",
      userId: "u1",
    })

    expect(result.status).toBe("succeeded")
    const [params] = stripe.paymentIntents.create.mock.calls[0] as [Record<string, unknown>]
    expect(params.amount).toBe(12000)
  })

  it("valida cantidad inválida", async () => {
    await expect(
      processUpsellForOrder({
        orderId: 42,
        productId: 77,
        quantity: 0,
        idempotencyKey: "key-abc",
        userId: "u1",
      })
    ).rejects.toThrow("Cantidad de upsell inválida")
  })
})
