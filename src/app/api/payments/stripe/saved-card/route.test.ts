import { beforeEach, describe, expect, it, vi } from "vitest"

const { retrievePaymentMethod } = vi.hoisted(() => ({
  retrievePaymentMethod: vi.fn(),
}))

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: null } })) },
  })),
}))
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }))
vi.mock("@/lib/stripe", () => ({
  getStripe: () => ({ paymentMethods: { retrieve: retrievePaymentMethod } }),
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
import { GET } from "./route"
import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"
import { rateLimited } from "@/lib/rate-limit"
import { logger } from "@/lib/logger"

/**
 * Builder PostgREST chainable para la consulta de la orden pagada previa:
 * select/eq/not/order/limit devuelven el mismo builder; maybeSingle resuelve
 * el resultado configurado.
 */
function ordersReturning(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {}
  for (const m of ["select", "eq", "not", "order", "limit"]) {
    builder[m] = vi.fn().mockReturnValue(builder)
  }
  builder.maybeSingle = vi.fn().mockResolvedValue(result)
  vi.mocked(createServiceClient).mockResolvedValue({
    from: vi.fn(() => builder),
  } as never)
  return builder as Record<string, ReturnType<typeof vi.fn>> & {
    maybeSingle: ReturnType<typeof vi.fn>
  }
}

/** Simula una sesión activa (createClient viene del mock global con user null). */
function withUser(id: string) {
  vi.mocked(createClient).mockResolvedValue({
    auth: { getUser: vi.fn(async () => ({ data: { user: { id } } })) },
  } as never)
}

function req() {
  return new NextRequest("http://localhost/api/payments/stripe/saved-card")
}

describe("GET /api/payments/stripe/saved-card", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(createServiceClient).mockResolvedValue({ from: vi.fn() } as never)
    vi.mocked(rateLimited).mockResolvedValue({
      allowed: true,
      remaining: 19,
      retry_after_seconds: 0,
    })
    withUser("user-1")
  })

  it("401 sin sesión activa", async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: null } })) },
    } as never)

    const res = await GET(req())

    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: "No autorizado" })
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it("429 cuando el rate limit no permite", async () => {
    vi.mocked(rateLimited).mockResolvedValue({
      allowed: false,
      remaining: 0,
      retry_after_seconds: 20,
    })

    const res = await GET(req())

    expect(res.status).toBe(429)
    expect(rateLimited).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("saved-card:user-1:"),
      20,
      60
    )
    expect(retrievePaymentMethod).not.toHaveBeenCalled()
  })

  it("hasSavedCard:false cuando no hay orden pagada con método guardado", async () => {
    ordersReturning({ data: null, error: null })

    const res = await GET(req())

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ hasSavedCard: false })
    expect(retrievePaymentMethod).not.toHaveBeenCalled()
  })

  it("hasSavedCard:false cuando la orden pagada no tiene stripe_payment_method_id", async () => {
    ordersReturning({ data: { stripe_payment_method_id: null }, error: null })

    const res = await GET(req())

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ hasSavedCard: false })
  })

  it("hasSavedCard:true con last4 y brand cuando Stripe resuelve la tarjeta", async () => {
    const orders = ordersReturning({
      data: { stripe_payment_method_id: "pm_1" },
      error: null,
    })
    retrievePaymentMethod.mockResolvedValue({
      type: "card",
      card: { last4: "4242", brand: "visa" },
    })

    const res = await GET(req())

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      hasSavedCard: true,
      last4: "4242",
      brand: "visa",
    })
    // La consulta se limita a órdenes pagadas del usuario con PM guardado.
    expect(orders.eq).toHaveBeenCalledWith("user_id", "user-1")
    expect(orders.eq).toHaveBeenCalledWith("payment_status", "paid")
    expect(retrievePaymentMethod).toHaveBeenCalledWith("pm_1")
  })

  it("fail-open: si Stripe falla responde hasSavedCard:true sin detalles", async () => {
    ordersReturning({ data: { stripe_payment_method_id: "pm_1" }, error: null })
    retrievePaymentMethod.mockRejectedValue(new Error("Stripe API unreachable"))

    const res = await GET(req())

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ hasSavedCard: true })
    expect(logger.warn).toHaveBeenCalled()
  })

  it("fail-open: PM no tarjeta (ej. link/wallet) responde hasSavedCard:true sin detalles", async () => {
    ordersReturning({ data: { stripe_payment_method_id: "pm_link" }, error: null })
    retrievePaymentMethod.mockResolvedValue({ type: "link", card: null })

    const res = await GET(req())

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ hasSavedCard: true })
  })

  it("hasSavedCard:false ante error de la consulta a Supabase", async () => {
    // La primera llamada (rate limit) resuelve; la segunda (consulta dentro
    // del try) falla y la ruta responde fail-open.
    vi.mocked(createServiceClient)
      .mockResolvedValueOnce({ from: vi.fn() } as never)
      .mockRejectedValueOnce(new Error("db down"))

    const res = await GET(req())

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ hasSavedCard: false })
    expect(logger.error).toHaveBeenCalled()
  })
})
