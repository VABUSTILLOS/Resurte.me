import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }))
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))
vi.mock("@/lib/wallet-actions", () => ({ redeemCredits: vi.fn() }))
vi.mock("@/lib/notifications", () => ({ notifyUser: vi.fn() }))
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
import { logger } from "@/lib/logger"

const USER = { id: "user-1", email: "a@b.com" }

/** Brief mínimo válido: el nombre del restaurante es obligatorio. */
const BRIEF = { restaurant_name: "Taquería El Buen Pastor" }

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

/**
 * Service client. El route lo usa para dos cosas: la consulta de dedupe
 * (`select`…`limit`) y el UPDATE del brief vía `attachRedemptionBrief`
 * (`update`…`select`…`maybeSingle`). El mismo builder cubre ambas.
 */
function serviceWith(existing: unknown[], briefUpdate?: { error?: unknown; rows?: unknown[] }) {
  const builder: Record<string, unknown> = {}
  for (const m of ["select", "eq", "gte", "order", "update"]) {
    builder[m] = vi.fn().mockReturnValue(builder)
  }
  builder.limit = vi.fn().mockResolvedValue({ data: existing, error: null })
  builder.maybeSingle = vi.fn().mockResolvedValue({
    data: briefUpdate?.rows?.[0] ?? null,
    error: briefUpdate?.error ?? null,
  })
  vi.mocked(createServiceClient).mockResolvedValue({ from: vi.fn(() => builder) } as never)
  return builder
}

describe("POST /api/redeem", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authed(USER)
    serviceWith([], { rows: [{ id: 1, status: "requested", due_at: "2026-01-15T00:00:00.000Z" }] })
    vi.mocked(rateLimited).mockResolvedValue({ allowed: true } as never)
    vi.mocked(redeemCredits).mockResolvedValue({
      success: true,
      newBalance: 800,
      redemptionId: "1",
    } as never)
  })

  it("400 sin service_id", async () => {
    const res = await POST(req({ brief: BRIEF }))
    expect(res.status).toBe(400)
    expect(redeemCredits).not.toHaveBeenCalled()
  })

  it("400 sin brief: se rechaza ANTES de debitar", async () => {
    const res = await POST(req({ service_id: "resenas-google" }))
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({
      error: "El nombre de tu restaurante es obligatorio",
    })
    // Lo que importa: no se cobró nada.
    expect(redeemCredits).not.toHaveBeenCalled()
  })

  it("400 con un maps_url que no es http(s)", async () => {
    const res = await POST(
      req({ service_id: "resenas-google", brief: { ...BRIEF, maps_url: "maps.google.com/x" } })
    )
    expect(res.status).toBe(400)
    expect(redeemCredits).not.toHaveBeenCalled()
  })

  it("404 para un servicio fuera del catálogo", async () => {
    const res = await POST(req({ service_id: "servicio-inventado", brief: BRIEF }))
    expect(res.status).toBe(404)
    expect(redeemCredits).not.toHaveBeenCalled()
  })

  it("401 sin sesión", async () => {
    authed(null)
    const res = await POST(req({ service_id: "resenas-google", brief: BRIEF }))
    expect(res.status).toBe(401)
    expect(redeemCredits).not.toHaveBeenCalled()
  })

  it("429 cuando el rate limit bloquea", async () => {
    vi.mocked(rateLimited).mockResolvedValue({ allowed: false } as never)
    const res = await POST(req({ service_id: "resenas-google", brief: BRIEF }))
    expect(res.status).toBe(429)
    expect(redeemCredits).not.toHaveBeenCalled()
  })

  it("idempotencia: canje reciente del mismo servicio → already_redeemed sin débito", async () => {
    serviceWith([
      {
        id: 9,
        service_id: "resenas-google",
        service_name: "Gestión de Reseñas Google",
        cost_credits: 2200,
        created_at: new Date().toISOString(),
        status: "in_progress",
        due_at: "2026-02-01T00:00:00.000Z",
      },
    ])
    const res = await POST(req({ service_id: "resenas-google", brief: BRIEF }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.already_redeemed).toBe(true)
    expect(body.redemption.id).toBe(9)
    expect(body.redemption.status).toBe("in_progress")
    expect(redeemCredits).not.toHaveBeenCalled()
  })

  it("happy path: débito con datos del catálogo y devuelve el estado real", async () => {
    const res = await POST(req({ service_id: "resenas-google", brief: BRIEF }))
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      success: true,
      newBalance: 800,
      redemption: {
        id: 1,
        service_id: "resenas-google",
        service_name: "Gestión de Reseñas Google",
        cost_credits: 2200,
        status: "requested",
        due_at: "2026-01-15T00:00:00.000Z",
      },
    })
    // Nunca confía en cost/name del cliente: usa el catálogo
    expect(redeemCredits).toHaveBeenCalledWith(USER.id, {
      id: "resenas-google",
      name: "Gestión de Reseñas Google",
      cost: 2200,
    })
  })

  it("el brief se normaliza antes de guardarse (strings vacíos → null)", async () => {
    const builder = serviceWith([], { rows: [{ id: 1, status: "requested", due_at: null }] })
    const res = await POST(
      req({
        service_id: "resenas-google",
        brief: { restaurant_name: "  El Buen Pastor  ", maps_url: "", notes: "   " },
      })
    )
    expect(res.status).toBe(200)
    expect(builder.update).toHaveBeenCalledWith({
      brief: {
        restaurant_name: "El Buen Pastor",
        maps_url: null,
        social_handle: null,
        notes: null,
      },
    })
  })

  it("si el brief no se puede guardar, el canje sigue siendo exitoso", async () => {
    // El débito ya ocurrió: convertir esto en error HTTP haría que el cliente
    // reintentara sobre créditos ya gastados.
    serviceWith([], { error: { message: "boom" } })
    const res = await POST(req({ service_id: "resenas-google", brief: BRIEF }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(logger.error).toHaveBeenCalled()
  })

  it("400 cuando el canje falla (p. ej. saldo insuficiente)", async () => {
    vi.mocked(redeemCredits).mockResolvedValue({
      success: false,
      error: "Saldo insuficiente",
    } as never)
    const res = await POST(req({ service_id: "resenas-google", brief: BRIEF }))
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: "Saldo insuficiente" })
  })
})
