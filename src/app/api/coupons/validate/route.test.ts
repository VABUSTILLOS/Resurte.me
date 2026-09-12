import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }))
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))
vi.mock("@/lib/rate-limit", () => ({
  rateLimited: vi.fn(),
  clientIp: vi.fn(() => "1.2.3.4"),
  rateLimitResponse: vi.fn(
    () => new Response(JSON.stringify({ error: "Rate limit" }), { status: 429 })
  ),
}))
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))

import { POST } from "./route"
import { createServiceClient } from "@/lib/supabase/service"
import { createClient } from "@/lib/supabase/server"
import { rateLimited } from "@/lib/rate-limit"

function req(body: unknown) {
  return new NextRequest("http://localhost/api/coupons/validate", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  })
}

function couponsTable(result: { data?: unknown; error?: unknown }) {
  const builder: Record<string, unknown> = {}
  builder.select = vi.fn().mockReturnValue(builder)
  builder.ilike = vi.fn().mockReturnValue(builder)
  builder.maybeSingle = vi.fn().mockResolvedValue(result)
  vi.mocked(createServiceClient).mockResolvedValue({
    from: vi.fn(() => builder),
  } as never)
  return builder
}

const VALID_COUPON = {
  id: "c1",
  code: "BIENVENIDO",
  discount_type: "percentage",
  discount_value: 10,
  min_order: 300,
  max_uses: 100,
  used_count: 5,
  expires_at: new Date(Date.now() + 86_400_000).toISOString(),
  user_id: null,
}

describe("POST /api/coupons/validate", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(rateLimited).mockResolvedValue({ allowed: true } as never)
    couponsTable({ data: VALID_COUPON, error: null })
  })

  it("429 cuando el rate limit bloquea", async () => {
    vi.mocked(rateLimited).mockResolvedValue({ allowed: false } as never)
    const res = await POST(req({ code: "BIENVENIDO", subtotal: 500 }))
    expect(res.status).toBe(429)
  })

  it("400 sin código", async () => {
    const res = await POST(req({ subtotal: 500 }))
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: "Escribe un código de cupón" })
  })

  it("400 con subtotal inválido", async () => {
    // Nota: NaN/Infinity viajan como null en JSON → Number(null ?? 0) = 0 (válido)
    for (const subtotal of [-1, "mucho"]) {
      const res = await POST(req({ code: "X", subtotal }))
      expect(res.status).toBe(400)
      await expect(res.json()).resolves.toEqual({ error: "Subtotal inválido" })
    }
  })

  it("busca el código case-insensitive y recortado", async () => {
    const builder = couponsTable({ data: VALID_COUPON, error: null })
    const res = await POST(req({ code: "  bienvenido ", subtotal: 500 }))
    expect(res.status).toBe(200)
    expect(builder.ilike).toHaveBeenCalledWith("code", "bienvenido")
  })

  it("500 ante error de BD", async () => {
    couponsTable({ data: null, error: { message: "boom" } })
    const res = await POST(req({ code: "X", subtotal: 500 }))
    expect(res.status).toBe(500)
  })

  it("400 si el cupón no existe", async () => {
    couponsTable({ data: null, error: null })
    const res = await POST(req({ code: "NOEXISTE", subtotal: 500 }))
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: "El cupón no existe" })
  })

  it("400 si el cupón expiró", async () => {
    couponsTable({
      data: { ...VALID_COUPON, expires_at: new Date(Date.now() - 86_400_000).toISOString() },
      error: null,
    })
    const res = await POST(req({ code: "BIENVENIDO", subtotal: 500 }))
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: "El cupón ha expirado" })
  })

  it("400 si el subtotal no alcanza el pedido mínimo", async () => {
    const res = await POST(req({ code: "BIENVENIDO", subtotal: 299.99 }))
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({
      error: "Este cupón requiere un pedido mínimo de $300.00",
    })
  })

  it("400 si el cupón agotó sus usos", async () => {
    couponsTable({ data: { ...VALID_COUPON, used_count: 100 }, error: null })
    const res = await POST(req({ code: "BIENVENIDO", subtotal: 500 }))
    expect(res.status).toBe(400)
  })

  it("cupón personal: 400 si no hay sesión o no es el dueño", async () => {
    couponsTable({ data: { ...VALID_COUPON, user_id: "owner-1" }, error: null })
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    } as never)
    const res = await POST(req({ code: "BIENVENIDO", subtotal: 500 }))
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({
      error: "Este cupón es personal y no pertenece a tu cuenta",
    })

    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "otro" } } }) },
    } as never)
    expect((await POST(req({ code: "BIENVENIDO", subtotal: 500 }))).status).toBe(400)
  })

  it("cupón personal: 200 para su dueño", async () => {
    couponsTable({ data: { ...VALID_COUPON, user_id: "owner-1" }, error: null })
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "owner-1" } } }) },
    } as never)
    const res = await POST(req({ code: "BIENVENIDO", subtotal: 500 }))
    expect(res.status).toBe(200)
  })

  it("200 con cupón de monto fijo (fixed_amount)", async () => {
    couponsTable({
      data: { ...VALID_COUPON, discount_type: "fixed_amount", discount_value: 50, min_order: 0 },
      error: null,
    })
    const res = await POST(req({ code: "BIENVENIDO", subtotal: 100 }))
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      code: "BIENVENIDO",
      discount_type: "fixed_amount",
      discount_value: 50,
      min_order: 0,
    })
  })

  it("happy path devuelve el AppliedCoupon sin consumir el cupón", async () => {
    const builder = couponsTable({ data: VALID_COUPON, error: null })
    const res = await POST(req({ code: "BIENVENIDO", subtotal: 500 }))
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      code: "BIENVENIDO",
      discount_type: "percentage",
      discount_value: 10,
      min_order: 300,
    })
    // Solo lectura: nunca incrementa used_count aquí
    expect(builder.from).toBeUndefined()
  })
})
