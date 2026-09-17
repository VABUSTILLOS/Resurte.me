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

function req(body: unknown) {
  return new NextRequest("http://localhost/api/admin/reward-services", {
    method: "POST",
    body: JSON.stringify(body),
  })
}

/**
 * `from()` sirve dos tablas distintas: `reward_services` (lectura previa +
 * upsert) y `admin_audit_log` (insert de la bitácora).
 */
function setup(opts: { previous?: unknown; upsertError?: unknown } = {}) {
  const maybeSingle = vi
    .fn()
    .mockResolvedValue({ data: opts.previous ?? null, error: null })
  const upsert = vi.fn().mockResolvedValue({ error: opts.upsertError ?? null })
  const builder = {
    select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle })) })),
    upsert,
  }
  vi.mocked(requireAdmin).mockResolvedValue({ user: ADMIN, response: null } as never)
  vi.mocked(createServiceClient).mockResolvedValue({ from: vi.fn(() => builder) } as never)
  return { upsert, maybeSingle }
}

const VALID = { id: "foto-producto", name: "Fotografía", cost: 300, tier: "plata" }

describe("POST /api/admin/reward-services", () => {
  beforeEach(() => vi.clearAllMocks())

  it("403 si requireAdmin lo niega", async () => {
    const denied = new Response(null, { status: 403 })
    vi.mocked(requireAdmin).mockResolvedValue({ user: null, response: denied } as never)
    const res = await POST(req(VALID))
    expect(res.status).toBe(403)
  })

  it("400 con id inválido (mayúsculas o demasiado corto)", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ user: ADMIN, response: null } as never)
    for (const id of ["A", "FOTO", "con espacio", "a"]) {
      const res = await POST(req({ ...VALID, id }))
      expect(res.status).toBe(400)
    }
  })

  it("400 sin nombre", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ user: ADMIN, response: null } as never)
    const res = await POST(req({ ...VALID, name: "   " }))
    expect(res.status).toBe(400)
  })

  it("400 con costo no positivo", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ user: ADMIN, response: null } as never)
    for (const cost of [0, -10, "gratis", null]) {
      const res = await POST(req({ ...VALID, cost }))
      expect(res.status).toBe(400)
    }
  })

  it("crea el servicio y registra el costo en bitácora", async () => {
    const { upsert } = setup({ previous: null })
    const res = await POST(req(VALID))
    expect(res.status).toBe(200)
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ id: "foto-producto", cost: 300, tier: "plata" }),
      { onConflict: "id" }
    )
    expect(logAdminAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "reward_service_upsert",
        entity: "reward_services",
        entityId: "foto-producto",
        detail: expect.objectContaining({ created: true, cost: 300, previous_cost: null }),
      })
    )
  })

  it("registra el costo anterior al cambiar el precio de un servicio existente", async () => {
    setup({ previous: { cost: 500, name: "Fotografía", is_active: true } })
    await POST(req(VALID))
    expect(logAdminAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        detail: expect.objectContaining({ created: false, cost: 300, previous_cost: 500 }),
      })
    )
  })

  it("500 si el upsert falla y NO escribe bitácora", async () => {
    setup({ upsertError: { message: "boom" } })
    const res = await POST(req(VALID))
    expect(res.status).toBe(500)
    expect(logAdminAction).not.toHaveBeenCalled()
  })
})
