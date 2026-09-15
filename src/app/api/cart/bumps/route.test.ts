import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }))
vi.mock("@/lib/order-bumps", () => ({ resolveBumps: vi.fn().mockResolvedValue([]) }))
vi.mock("@/lib/rate-limit", async () => {
  const { NextResponse } = await import("next/server")
  return {
    rateLimited: vi.fn().mockResolvedValue({ allowed: true, remaining: 119, retry_after_seconds: 0 }),
    clientIp: vi.fn(() => "127.0.0.1"),
    rateLimitResponse: vi.fn((rate: { retry_after_seconds: number }) =>
      NextResponse.json(
        { error: "Demasiadas solicitudes" },
        { status: 429, headers: { "Retry-After": String(rate.retry_after_seconds) } }
      )
    ),
  }
})
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))

import { POST } from "./route"
import { createServiceClient } from "@/lib/supabase/service"
import { resolveBumps } from "@/lib/order-bumps"
import { rateLimited, clientIp, rateLimitResponse } from "@/lib/rate-limit"
import { logger } from "@/lib/logger"

function mockService() {
  vi.mocked(createServiceClient).mockResolvedValue({ from: vi.fn() } as never)
}

function req(body: unknown, url = "/api/cart/bumps") {
  return new NextRequest(`http://localhost${url}`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  })
}

const validBody = { city_id: 1, items: [{ product_id: 7, quantity: 2 }] }

const BUMP = {
  ruleId: 12,
  trigger_type: "always",
  product_id: 99,
  name: "Totopos",
  price: 30,
}

describe("POST /api/cart/bumps", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockService()
  })

  it("200 con bumps aplicables para el carrito", async () => {
    vi.mocked(resolveBumps).mockResolvedValueOnce([BUMP] as never)

    const res = await POST(req(validBody))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.bumps).toEqual([BUMP])
    // El contrato normal no expone _debug
    expect(body).not.toHaveProperty("_debug")
    // Rate limit por IP antes de resolver reglas
    expect(clientIp).toHaveBeenCalled()
    expect(rateLimited).toHaveBeenCalledWith(expect.anything(), "bumps:127.0.0.1", 120, 60)
    // resolveBumps recibe solo IDs/cantidades (nunca precios del cliente)
    expect(resolveBumps).toHaveBeenCalledWith(
      { items: [{ product_id: 7, quantity: 2 }] },
      expect.anything()
    )
    expect(logger.info).toHaveBeenCalledWith(
      "[BUMPS] served",
      expect.objectContaining({ bumpCount: 1, items: [7] })
    )
  })

  it("200 con bumps vacíos cuando ninguna regla aplica", async () => {
    vi.mocked(resolveBumps).mockResolvedValueOnce([])

    const res = await POST(req(validBody))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.bumps).toEqual([])
  })

  it("429 cuando se excede el rate limit, sin resolver bumps", async () => {
    vi.mocked(rateLimited).mockResolvedValueOnce({
      allowed: false,
      remaining: 0,
      retry_after_seconds: 42,
    })

    const res = await POST(req(validBody))

    expect(res.status).toBe(429)
    expect(res.headers.get("retry-after")).toBe("42")
    expect(rateLimitResponse).toHaveBeenCalled()
    expect(resolveBumps).not.toHaveBeenCalled()
  })

  it("fail-open 200 con items vacíos (sin tocar la BD ni el rate limit)", async () => {
    const res = await POST(req({ items: [] }))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.bumps).toEqual([])
    expect(createServiceClient).not.toHaveBeenCalled()
    expect(resolveBumps).not.toHaveBeenCalled()
  })

  it("fail-open 200 con items inválidos tras el filtrado", async () => {
    const res = await POST(
      req({ items: [{ product_id: "x", quantity: 1 }, { product_id: 7, quantity: 0 }] })
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.bumps).toEqual([])
    expect(createServiceClient).not.toHaveBeenCalled()
    expect(resolveBumps).not.toHaveBeenCalled()
  })

  it("fail-open 200 cuando la BD o resolveBumps lanzan (nunca bloquea el checkout)", async () => {
    vi.mocked(resolveBumps).mockRejectedValueOnce(new Error("bd caída"))

    const res = await POST(req(validBody))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.bumps).toEqual([])
    expect(logger.warn).toHaveBeenCalledWith(
      "bumps error, fail-open",
      expect.objectContaining({ error: "bd caída" })
    )
  })

  it("?debug=1 agrega el motivo del rate limit con 429", async () => {
    vi.mocked(rateLimited).mockResolvedValueOnce({
      allowed: false,
      remaining: 0,
      retry_after_seconds: 42,
    })

    const res = await POST(req(validBody, "/api/cart/bumps?debug=1"))

    expect(res.status).toBe(429)
    const body = await res.json()
    expect(body._debug).toMatchObject({ reason: "rate_limit" })
    expect(res.headers.get("retry-after")).toBe("42")
  })
})
