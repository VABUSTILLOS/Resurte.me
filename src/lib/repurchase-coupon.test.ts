import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))

import { getActivePersonalCoupon, issuePersonalCoupon } from "./repurchase-coupon"
import { logger } from "@/lib/logger"

type InsertResult = { data?: unknown; error?: { code?: string; message?: string } | null }

/** Mock del service client con cadena from().insert().select().single(). */
function supabaseWithInserts(results: InsertResult[]) {
  const single = vi.fn()
  for (const r of results) single.mockResolvedValueOnce(r)
  const insert = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single }) })
  return { client: { from: vi.fn(() => ({ insert })) }, insert, single }
}

const COUPON_ROW = {
  code: "VUELVE-ABC123",
  discount_type: "percentage",
  discount_value: 5,
  min_order: 500,
  expires_at: new Date(Date.now() + 14 * 86_400_000).toISOString(),
}

describe("issuePersonalCoupon", () => {
  beforeEach(() => vi.clearAllMocks())

  it("emite cupón VUELVE de 14 días para post_purchase", async () => {
    const { client, insert } = supabaseWithInserts([{ data: COUPON_ROW, error: null }])
    const before = Date.now()
    const coupon = await issuePersonalCoupon(client as never, "user-1", "post_purchase")

    expect(coupon).not.toBeNull()
    const inserted = insert.mock.calls[0]![0] as Record<string, unknown>
    expect(inserted.code).toMatch(/^VUELVE-[A-Z0-9]{6}$/)
    expect(inserted.discount_type).toBe("percentage")
    expect(inserted.discount_value).toBe(5)
    expect(inserted.min_order).toBe(500)
    expect(inserted.max_uses).toBe(1)
    expect(inserted.user_id).toBe("user-1")
    expect(inserted.origin).toBe("post_purchase")

    const expiresMs = new Date(inserted.expires_at as string).getTime() - before
    expect(expiresMs).toBeGreaterThan(13 * 86_400_000)
    expect(expiresMs).toBeLessThanOrEqual(14 * 86_400_000 + 1000)
  })

  it("usa prefijo EXTRA y 10 días para reactivation", async () => {
    const { client, insert } = supabaseWithInserts([{ data: COUPON_ROW, error: null }])
    const before = Date.now()
    await issuePersonalCoupon(client as never, "user-1", "reactivation")

    const inserted = insert.mock.calls[0]![0] as Record<string, unknown>
    expect(inserted.code).toMatch(/^EXTRA-/)
    const expiresMs = new Date(inserted.expires_at as string).getTime() - before
    expect(expiresMs).toBeGreaterThan(9 * 86_400_000)
    expect(expiresMs).toBeLessThanOrEqual(10 * 86_400_000 + 1000)
  })

  it("usa prefijo RECUPERA y 3 días para abandoned_cart", async () => {
    const { client, insert } = supabaseWithInserts([{ data: COUPON_ROW, error: null }])
    const before = Date.now()
    await issuePersonalCoupon(client as never, "user-1", "abandoned_cart")

    const inserted = insert.mock.calls[0]![0] as Record<string, unknown>
    expect(inserted.code).toMatch(/^RECUPERA-/)
    const expiresMs = new Date(inserted.expires_at as string).getTime() - before
    expect(expiresMs).toBeLessThanOrEqual(3 * 86_400_000 + 1000)
  })

  it("reintenta ante colisión UNIQUE (23505) y tiene éxito", async () => {
    const { client, insert } = supabaseWithInserts([
      { data: null, error: { code: "23505", message: "duplicate key" } },
      { data: COUPON_ROW, error: null },
    ])
    const coupon = await issuePersonalCoupon(client as never, "user-1", "post_purchase")
    expect(coupon?.code).toBe(COUPON_ROW.code)
    expect(insert).toHaveBeenCalledTimes(2)
    expect(logger.error).not.toHaveBeenCalled()
  })

  it("devuelve null tras 3 colisiones UNIQUE consecutivas", async () => {
    const collision = { data: null, error: { code: "23505", message: "duplicate key" } }
    const { client, insert } = supabaseWithInserts([collision, collision, collision])
    await expect(issuePersonalCoupon(client as never, "user-1", "post_purchase")).resolves.toBeNull()
    expect(insert).toHaveBeenCalledTimes(3)
  })

  it("devuelve null y loguea ante errores que no son colisión", async () => {
    const { client, insert } = supabaseWithInserts([
      { data: null, error: { code: "42501", message: "permission denied" } },
    ])
    await expect(issuePersonalCoupon(client as never, "user-1", "post_purchase")).resolves.toBeNull()
    expect(insert).toHaveBeenCalledTimes(1)
    expect(logger.error).toHaveBeenCalled()
  })
})

describe("getActivePersonalCoupon", () => {
  beforeEach(() => vi.clearAllMocks())

  function supabaseWithQuery(result: { data?: unknown; error?: unknown }) {
    const builder: Record<string, unknown> = {}
    for (const m of ["select", "eq", "gt", "order", "limit"]) {
      builder[m] = vi.fn().mockReturnValue(builder)
    }
    builder.maybeSingle = vi.fn().mockResolvedValue(result)
    return { client: { from: vi.fn(() => builder) }, builder }
  }

  it("devuelve el cupón vigente mapeado", async () => {
    const { client, builder } = supabaseWithQuery({ data: COUPON_ROW, error: null })
    const coupon = await getActivePersonalCoupon(client as never, "user-1")

    expect(coupon).toEqual({
      code: COUPON_ROW.code,
      discount_type: "percentage",
      discount_value: 5,
      min_order: 500,
      expires_at: COUPON_ROW.expires_at,
    })
    // Solo cupones sin usar del usuario
    expect(builder.eq).toHaveBeenCalledWith("user_id", "user-1")
    expect(builder.eq).toHaveBeenCalledWith("used_count", 0)
  })

  it("devuelve null cuando no hay cupón vigente", async () => {
    const { client } = supabaseWithQuery({ data: null, error: null })
    await expect(getActivePersonalCoupon(client as never, "user-1")).resolves.toBeNull()
  })

  it("devuelve null ante error de BD", async () => {
    const { client } = supabaseWithQuery({ data: null, error: { message: "boom" } })
    await expect(getActivePersonalCoupon(client as never, "user-1")).resolves.toBeNull()
  })
})
