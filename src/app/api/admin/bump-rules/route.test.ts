import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }))
vi.mock("@/lib/admin-auth", () => ({ requireAdmin: vi.fn() }))
vi.mock("@/lib/audit-log", () => ({ logAdminAction: vi.fn() }))
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))

import { POST } from "./route"
import { createServiceClient } from "@/lib/supabase/service"
import { requireAdmin } from "@/lib/admin-auth"
import { logAdminAction } from "@/lib/audit-log"

const ADMIN = { id: "admin-1", email: "admin@resurte.me" }

const VALID = {
  trigger_type: "perishables",
  category_slugs: ["frutas-verduras"],
  product_id: 12,
  title: "Empaque térmico",
  description: "Mantiene la cadena de frío.",
  discount_pct: 0.1,
}

function req(body: unknown) {
  return new NextRequest("http://localhost/api/admin/bump-rules", {
    method: "POST",
    body: JSON.stringify(body),
  })
}

function setup(opts: { insertError?: unknown } = {}) {
  const single = vi.fn().mockResolvedValue({
    data: opts.insertError ? null : { id: 3 },
    error: opts.insertError ?? null,
  })
  const insert = vi.fn(() => ({ select: vi.fn(() => ({ single })) }))
  vi.mocked(requireAdmin).mockResolvedValue({ user: ADMIN, response: null } as never)
  vi.mocked(createServiceClient).mockResolvedValue({ from: vi.fn(() => ({ insert })) } as never)
  return { insert }
}

describe("POST /api/admin/bump-rules", () => {
  beforeEach(() => vi.clearAllMocks())

  it("403 si requireAdmin lo niega", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({
      user: null,
      response: new Response(null, { status: 403 }),
    } as never)
    const res = await POST(req(VALID))
    expect(res.status).toBe(403)
  })

  it("400 con descuento fuera de rango", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ user: ADMIN, response: null } as never)
    for (const discount_pct of [1.5, -0.1, "mucho"]) {
      const res = await POST(req({ ...VALID, discount_pct }))
      expect(res.status).toBe(400)
    }
  })

  it("crea la regla y registra el descuento en bitácora", async () => {
    const { insert } = setup()
    const res = await POST(req(VALID))
    expect(res.status).toBe(201)
    await expect(res.json()).resolves.toEqual({ id: 3 })
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ product_id: 12, discount_pct: 0.1 }))
    expect(logAdminAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "bump_rule_create",
        entity: "bump_rules",
        entityId: 3,
        detail: expect.objectContaining({ discount_pct: 0.1, product_id: 12 }),
      })
    )
  })

  it("500 si el insert falla y NO escribe bitácora", async () => {
    setup({ insertError: { message: "boom" } })
    const res = await POST(req(VALID))
    expect(res.status).toBe(500)
    expect(logAdminAction).not.toHaveBeenCalled()
  })
})
