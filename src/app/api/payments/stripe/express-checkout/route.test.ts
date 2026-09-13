import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: null } })) },
  })),
}))
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn().mockResolvedValue({}) }))
vi.mock("@/lib/payments", () => ({
  chargeOrderWithSavedCard: vi.fn(),
  // Clase real para que el `instanceof` de la ruta funcione con el mock.
  PaymentIntentError: class PaymentIntentError extends Error {
    status: number
    code?: string
    constructor(message: string, status = 400, code?: string) {
      super(message)
      this.status = status
      this.code = code
    }
  },
}))
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

import { NextRequest } from "next/server"
import { POST } from "./route"
import { createClient } from "@/lib/supabase/server"
import { chargeOrderWithSavedCard, PaymentIntentError } from "@/lib/payments"
import { rateLimited } from "@/lib/rate-limit"
import { logger } from "@/lib/logger"

function req(body: unknown) {
  return new NextRequest("http://localhost/api/payments/stripe/express-checkout", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  })
}

/** Simula una sesión activa para esta llamada (createClient viene del mock global con user null). */
function withUser(id: string) {
  vi.mocked(createClient).mockResolvedValueOnce({
    auth: { getUser: vi.fn(async () => ({ data: { user: { id } } })) },
  } as never)
}

describe("POST /api/payments/stripe/express-checkout", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(rateLimited).mockResolvedValue({
      allowed: true,
      remaining: 9,
      retry_after_seconds: 0,
    })
  })

  it("400 cuando falta order_id", async () => {
    const res = await POST(req({}))

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: "order_id es requerido" })
    expect(chargeOrderWithSavedCard).not.toHaveBeenCalled()
  })

  it("400 cuando order_id es null", async () => {
    const res = await POST(req({ order_id: null }))

    expect(res.status).toBe(400)
    expect(chargeOrderWithSavedCard).not.toHaveBeenCalled()
  })

  it("401 sin sesión activa", async () => {
    const res = await POST(req({ order_id: 7 }))

    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({
      error: "Debes iniciar sesión para usar el pago rápido",
    })
    expect(chargeOrderWithSavedCard).not.toHaveBeenCalled()
  })

  it("429 cuando el rate limit no permite y no cobra", async () => {
    withUser("user-1")
    vi.mocked(rateLimited).mockResolvedValue({
      allowed: false,
      remaining: 0,
      retry_after_seconds: 45,
    })

    const res = await POST(req({ order_id: 7 }))

    expect(res.status).toBe(429)
    expect(rateLimited).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("express-checkout:user-1:"),
      10,
      60
    )
    expect(chargeOrderWithSavedCard).not.toHaveBeenCalled()
  })

  it("flujo feliz: cobro succeeded con el orderId numérico y el userId de la sesión", async () => {
    withUser("user-1")
    vi.mocked(chargeOrderWithSavedCard).mockResolvedValue({
      status: "succeeded",
      paymentIntentId: "pi_ok",
    })

    const res = await POST(req({ order_id: "7" }))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: "succeeded", paymentIntentId: "pi_ok" })
    // La ruta normaliza order_id con Number() antes de delegar.
    expect(chargeOrderWithSavedCard).toHaveBeenCalledWith({
      orderId: 7,
      userId: "user-1",
    })
  })

  it("requires_action devuelve el clientSecret para completar 3DS/SCA", async () => {
    withUser("user-1")
    vi.mocked(chargeOrderWithSavedCard).mockResolvedValue({
      status: "requires_action",
      clientSecret: "pi_3ds_secret",
      paymentIntentId: "pi_3ds",
    })

    const res = await POST(req({ order_id: 7 }))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      status: "requires_action",
      clientSecret: "pi_3ds_secret",
      paymentIntentId: "pi_3ds",
    })
  })

  it("declined / no_saved_card responden 200 (fail-open, la orden queda intacta)", async () => {
    withUser("user-1")
    vi.mocked(chargeOrderWithSavedCard).mockResolvedValue({ status: "declined" })

    let res = await POST(req({ order_id: 7 }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: "declined" })

    withUser("user-1")
    vi.mocked(chargeOrderWithSavedCard).mockResolvedValue({ status: "no_saved_card" })

    res = await POST(req({ order_id: 7 }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: "no_saved_card" })
  })

  it("mapea PaymentIntentError a su status HTTP (404 orden inexistente, 403 ajena)", async () => {
    withUser("user-1")
    vi.mocked(chargeOrderWithSavedCard).mockRejectedValue(
      new PaymentIntentError("Pedido no encontrado", 404)
    )

    let res = await POST(req({ order_id: 999 }))
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: "Pedido no encontrado" })

    withUser("user-1")
    vi.mocked(chargeOrderWithSavedCard).mockRejectedValue(
      new PaymentIntentError("No autorizado para este pedido", 403)
    )

    res = await POST(req({ order_id: 8 }))
    expect(res.status).toBe(403)
    expect(logger.error).toHaveBeenCalled()
  })

  it("500 ante un error genérico de Stripe", async () => {
    withUser("user-1")
    vi.mocked(chargeOrderWithSavedCard).mockRejectedValue(
      new Error("Stripe API unreachable")
    )

    const res = await POST(req({ order_id: 7 }))

    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: "Stripe API unreachable" })
    expect(logger.error).toHaveBeenCalled()
  })
})
