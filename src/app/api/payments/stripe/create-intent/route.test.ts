import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: null } })) },
  })),
}))
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn().mockResolvedValue({}) }))
vi.mock("@/lib/rate-limit", () => ({
  rateLimited: vi.fn().mockResolvedValue({ allowed: true }),
  clientIp: vi.fn(() => "127.0.0.1"),
  rateLimitResponse: vi.fn(),
}))
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))

const { createPaymentIntentForOrder } = vi.hoisted(() => ({
  createPaymentIntentForOrder: vi.fn(),
}))
vi.mock("@/lib/payments", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/payments")>()
  return { ...actual, createPaymentIntentForOrder }
})

import { NextRequest } from "next/server"
import { POST } from "./route"

function intentReq(body: unknown) {
  return new NextRequest("https://resurte.me/api/payments/stripe/create-intent", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  })
}

describe("/api/payments/stripe/create-intent validación zod", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    createPaymentIntentForOrder.mockResolvedValue({
      clientSecret: "pi_secret",
      paymentIntentId: "pi_1",
      saveCardEnabled: false,
    })
  })

  it("un body válido crea el PaymentIntent", async () => {
    const res = await POST(intentReq({ order_id: 7 }))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.clientSecret).toBe("pi_secret")
    expect(createPaymentIntentForOrder).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: 7, type: "main" })
    )
  })

  it("acepta type foodos y flags opcionales", async () => {
    const res = await POST(
      intentReq({ order_id: "9", type: "foodos", guest_token: "tok", save_card: true, customer_email: "c@x.com" })
    )

    expect(res.status).toBe(200)
    expect(createPaymentIntentForOrder).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: "9", type: "foodos", guestToken: "tok", saveCardConsent: true })
    )
  })

  it("rechaza 400 cuando falta order_id", async () => {
    const res = await POST(intentReq({ type: "main" }))

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.fields.order_id).toBeDefined()
    expect(createPaymentIntentForOrder).not.toHaveBeenCalled()
  })

  it("rechaza 400 cuando order_id tiene un tipo inválido", async () => {
    const res = await POST(intentReq({ order_id: { id: 7 } }))

    expect(res.status).toBe(400)
    expect(createPaymentIntentForOrder).not.toHaveBeenCalled()
  })

  it("rechaza 400 cuando save_card no es booleano", async () => {
    const res = await POST(intentReq({ order_id: 7, save_card: "yes" }))

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.fields.save_card).toBeDefined()
  })
})
