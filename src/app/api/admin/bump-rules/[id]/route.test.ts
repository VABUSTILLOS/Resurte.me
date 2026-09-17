import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }))
vi.mock("@/lib/admin-auth", () => ({ requireAdmin: vi.fn() }))
vi.mock("@/lib/audit-log", () => ({ logAdminAction: vi.fn() }))
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))

import { PATCH, DELETE } from "./route"
import { createServiceClient } from "@/lib/supabase/service"
import { requireAdmin } from "@/lib/admin-auth"
import { logAdminAction } from "@/lib/audit-log"

const ADMIN = { id: "admin-1", email: "admin@resurte.me" }
const ctx = (id: string) => ({ params: Promise.resolve({ id }) })

function req(body: unknown) {
  return new NextRequest("http://localhost/api/admin/bump-rules/3", {
    method: "PATCH",
    body: JSON.stringify(body),
  })
}

/** `from()` sirve `bump_rules` (lectura previa / update / delete) y `admin_audit_log`. */
function setup(opts: { previous?: unknown; error?: unknown } = {}) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: opts.previous ?? null, error: null })
  const eqUpdate = vi.fn().mockResolvedValue({ error: opts.error ?? null })
  const eqDelete = vi.fn().mockResolvedValue({ error: opts.error ?? null })
  const update = vi.fn(() => ({ eq: eqUpdate }))
  const del = vi.fn(() => ({ eq: eqDelete }))
  const builder = {
    select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle })) })),
    update,
    delete: del,
  }
  vi.mocked(requireAdmin).mockResolvedValue({ user: ADMIN, response: null } as never)
  vi.mocked(createServiceClient).mockResolvedValue({ from: vi.fn(() => builder) } as never)
  return { update, del, eqUpdate, eqDelete }
}

describe("/api/admin/bump-rules/[id]", () => {
  beforeEach(() => vi.clearAllMocks())

  it("PATCH 403 si requireAdmin lo niega", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({
      user: null,
      response: new Response(null, { status: 403 }),
    } as never)
    const res = await PATCH(req({ is_active: false }), ctx("3"))
    expect(res.status).toBe(403)
  })

  it("PATCH 400 con id no numérico", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ user: ADMIN, response: null } as never)
    const res = await PATCH(req({ is_active: false }), ctx("abc"))
    expect(res.status).toBe(400)
  })

  it("PATCH 400 sin campos editables", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ user: ADMIN, response: null } as never)
    const res = await PATCH(req({ inventado: 1 }), ctx("3"))
    expect(res.status).toBe(400)
  })

  it("PATCH 400 con discount_pct fuera de rango", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ user: ADMIN, response: null } as never)
    const res = await PATCH(req({ discount_pct: 2 }), ctx("3"))
    expect(res.status).toBe(400)
  })

  it("PATCH ignora campos no editables y registra el descuento anterior", async () => {
    const { update } = setup({ previous: { discount_pct: 0.05, is_active: true } })
    const res = await PATCH(req({ discount_pct: 0.2, id: 999, product_id: 12 }), ctx("3"))
    expect(res.status).toBe(200)
    // `id` y `product_id` no están en EDITABLE_FIELDS salvo product_id: sí lo está.
    expect(update).toHaveBeenCalledWith({ discount_pct: 0.2, product_id: 12 })
    expect(logAdminAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "bump_rule_update",
        entityId: 3,
        detail: expect.objectContaining({ previous_discount_pct: 0.05, discount_pct: 0.2 }),
      })
    )
  })

  it("PATCH 500 si el update falla y NO escribe bitácora", async () => {
    setup({ error: { message: "boom" } })
    const res = await PATCH(req({ is_active: false }), ctx("3"))
    expect(res.status).toBe(500)
    expect(logAdminAction).not.toHaveBeenCalled()
  })

  it("DELETE elimina la regla y lo deja en bitácora", async () => {
    const { del } = setup()
    const res = await DELETE(
      new NextRequest("http://localhost/api/admin/bump-rules/3", { method: "DELETE" }),
      ctx("3")
    )
    expect(res.status).toBe(200)
    expect(del).toHaveBeenCalled()
    expect(logAdminAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "bump_rule_delete", entityId: 3 })
    )
  })

  it("DELETE 400 con id no numérico", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ user: ADMIN, response: null } as never)
    const res = await DELETE(
      new NextRequest("http://localhost/api/admin/bump-rules/x", { method: "DELETE" }),
      ctx("x")
    )
    expect(res.status).toBe(400)
  })
})
