import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: null } })) },
  })),
}))
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn().mockResolvedValue({}) }))
vi.mock("@/lib/rate-limit", async () => {
  const { NextResponse } = await import("next/server")
  return {
    rateLimited: vi.fn().mockResolvedValue({ allowed: true }),
    clientIp: vi.fn(() => "127.0.0.1"),
    rateLimitResponse: vi.fn(() =>
      NextResponse.json({ error: "Demasiadas peticiones. Intenta en un minuto." }, { status: 429 })
    ),
  }
})
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
import { createClient } from "@/lib/supabase/server"
import { PaymentIntentError } from "@/lib/payments"
import { rateLimited } from "@/lib/rate-limit"
import { logger } from "@/lib/logger"

/** Simula una sesión activa para esta llamada (createClient viene del mock global con user null). */
function withUser(id: string) {
  vi.mocked(createClient).mockResolvedValueOnce({
    auth: { getUser: vi.fn(async () => ({ data: { user: { id } } })) },
  } as never)
}

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

describe("/api/payments/stripe/create-intent seguridad y errores", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(rateLimited).mockResolvedValue({
      allowed: true,
      remaining: 14,
      retry_after_seconds: 0,
    })
    createPaymentIntentForOrder.mockResolvedValue({
      clientSecret: "pi_secret",
      paymentIntentId: "pi_1",
      saveCardEnabled: false,
    })
  })

  it("el monto NUNCA viene del body: ignora `amount`/`currency` y deriva el total del pedido en BD", async () => {
    const res = await POST(intentReq({ order_id: 7, amount: 1, currency: "mxn" }))

    expect(res.status).toBe(200)
    // La ruta delega el cálculo del monto a createPaymentIntentForOrder, que
    // lee el total del pedido desde la BD; los parámetros que recibe no
    // incluyen amount/currency aunque el cliente los envíe.
    const params = createPaymentIntentForOrder.mock.calls[0]![0]
    expect(params).toEqual({
      type: "main",
      orderId: 7,
      userId: null,
      guestToken: null,
      saveCardConsent: false,
      customerEmail: null,
    })
    expect(params).not.toHaveProperty("amount")
    expect(params).not.toHaveProperty("currency")
  })

  it("propaga userId de la sesión y saveCardEnabled en la respuesta", async () => {
    withUser("user-1")
    createPaymentIntentForOrder.mockResolvedValue({
      clientSecret: "pi_secret",
      paymentIntentId: "pi_1",
      saveCardEnabled: true,
    })

    const res = await POST(intentReq({ order_id: 7, save_card: true }))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      clientSecret: "pi_secret",
      paymentIntentId: "pi_1",
      saveCardEnabled: true,
    })
    expect(createPaymentIntentForOrder).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1", saveCardConsent: true })
    )
  })

  it("429 cuando el rate limit no permite y no crea el PaymentIntent", async () => {
    vi.mocked(rateLimited).mockResolvedValue({
      allowed: false,
      remaining: 0,
      retry_after_seconds: 30,
    })

    const res = await POST(intentReq({ order_id: 7 }))

    expect(res.status).toBe(429)
    expect(rateLimited).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("pi-create:main:"),
      15,
      60
    )
    expect(createPaymentIntentForOrder).not.toHaveBeenCalled()
  })

  it("mapea PaymentIntentError a su status HTTP (404 pedido no encontrado)", async () => {
    createPaymentIntentForOrder.mockRejectedValue(
      new PaymentIntentError("Pedido no encontrado", 404)
    )

    const res = await POST(intentReq({ order_id: 999 }))

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: "Pedido no encontrado" })
    expect(logger.error).toHaveBeenCalled()
  })

  it("mapea PaymentIntentError 403 (pedido ajeno o guest_token inválido)", async () => {
    createPaymentIntentForOrder.mockRejectedValue(
      new PaymentIntentError("No autorizado para este pedido", 403)
    )

    const res = await POST(intentReq({ order_id: 7 }))

    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: "No autorizado para este pedido" })
  })

  it("500 ante un error genérico de Stripe", async () => {
    createPaymentIntentForOrder.mockRejectedValue(new Error("Stripe API unreachable"))

    const res = await POST(intentReq({ order_id: 7 }))

    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: "Stripe API unreachable" })
    expect(logger.error).toHaveBeenCalled()
  })
})
