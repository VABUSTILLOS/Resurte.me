import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }))
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))
vi.mock("@/lib/wallet-actions", () => ({ redeemCredits: vi.fn() }))
vi.mock("@/lib/rate-limit", () => ({
  rateLimited: vi.fn(),
  rateLimitResponse: vi.fn(
    () => new Response(JSON.stringify({ error: "Rate limit" }), { status: 429 })
  ),
}))
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))

import { POST } from "./route"
import { createServiceClient } from "@/lib/supabase/service"
import { createClient } from "@/lib/supabase/server"
import { redeemCredits } from "@/lib/wallet-actions"
import { rateLimited } from "@/lib/rate-limit"

const USER = { id: "user-1", email: "a@b.com" }

function req(body: unknown) {
  return new NextRequest("http://localhost/api/redeem", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  })
}

function authed(user: unknown) {
  vi.mocked(createClient).mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }) },
  } as never)
}

/** Service client: la consulta de dedupe en `redemptions` resuelve `existing`. */
function serviceWith(existing: unknown[]) {
  const builder: Record<string, unknown> = {}
  for (const m of ["select", "eq", "gte", "order"]) builder[m] = vi.fn().mockReturnValue(builder)
  builder.limit = vi.fn().mockResolvedValue({ data: existing, error: null })
  vi.mocked(createServiceClient).mockResolvedValue({ from: vi.fn(() => builder) } as never)
  return builder
}

describe("POST /api/redeem", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authed(USER)
    serviceWith([])
    vi.mocked(rateLimited).mockResolvedValue({ allowed: true } as never)
    vi.mocked(redeemCredits).mockResolvedValue({
      success: true,
      newBalance: 800,
      redemptionId: "r1",
    } as never)
  })

  it("400 sin service_id", async () => {
    const res = await POST(req({}))
    expect(res.status).toBe(400)
    expect(redeemCredits).not.toHaveBeenCalled()
  })

  it("404 para un servicio fuera del catálogo", async () => {
    const res = await POST(req({ service_id: "servicio-inventado" }))
    expect(res.status).toBe(404)
    expect(redeemCredits).not.toHaveBeenCalled()
  })

  it("401 sin sesión", async () => {
    authed(null)
    const res = await POST(req({ service_id: "resenas-google" }))
    expect(res.status).toBe(401)
    expect(redeemCredits).not.toHaveBeenCalled()
  })

  it("429 cuando el rate limit bloquea", async () => {
    vi.mocked(rateLimited).mockResolvedValue({ allowed: false } as never)
    const res = await POST(req({ service_id: "resenas-google" }))
    expect(res.status).toBe(429)
    expect(redeemCredits).not.toHaveBeenCalled()
  })

  it("idempotencia: canje reciente del mismo servicio → already_redeemed sin débito", async () => {
    serviceWith([
      {
        id: "r-prev",
        service_id: "resenas-google",
        service_name: "Gestión de Reseñas Google",
        cost_credits: 2200,
        created_at: new Date().toISOString(),
      },
    ])
    const res = await POST(req({ service_id: "resenas-google" }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.already_redeemed).toBe(true)
    expect(body.redemption.id).toBe("r-prev")
    expect(redeemCredits).not.toHaveBeenCalled()
  })

  it("happy path: débito atómico vía redeemCredits con datos del catálogo", async () => {
    const res = await POST(req({ service_id: "resenas-google" }))
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      success: true,
      newBalance: 800,
      redemption: {
        id: "r1",
        service_id: "resenas-google",
        service_name: "Gestión de Reseñas Google",
        cost_credits: 2200,
      },
    })
    // Nunca confía en cost/name del cliente: usa el catálogo
    expect(redeemCredits).toHaveBeenCalledWith(USER.id, {
      id: "resenas-google",
      name: "Gestión de Reseñas Google",
      cost: 2200,
    })
  })

  it("400 cuando el canje falla (p. ej. saldo insuficiente)", async () => {
    vi.mocked(redeemCredits).mockResolvedValue({
      success: false,
      error: "Saldo insuficiente",
    } as never)
    const res = await POST(req({ service_id: "resenas-google" }))
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: "Saldo insuficiente" })
  })
})
