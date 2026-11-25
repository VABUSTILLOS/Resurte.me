import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }))
vi.mock("@/lib/admin-auth", () => ({ requireAdmin: vi.fn() }))
vi.mock("@/lib/audit-log", () => ({ logAdminAction: vi.fn() }))
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

import { GET, PUT } from "./route"
import { createServiceClient } from "@/lib/supabase/service"
import { requireAdmin } from "@/lib/admin-auth"
import { logAdminAction } from "@/lib/audit-log"

function asAdmin() {
  vi.mocked(requireAdmin).mockResolvedValue({
    user: { id: "admin-1", email: "admin@resurte.me" },
    response: null,
  } as never)
}

function asDenied() {
  vi.mocked(requireAdmin).mockResolvedValue({
    user: null,
    response: new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }),
  } as never)
}

/** Cadena falsa de Supabase para la fila única de configuración. */
function serviceWithConfig(row: { config: unknown } | null, upsertError: unknown = null) {
  const builder: Record<string, unknown> = {}
  builder.select = vi.fn().mockReturnValue(builder)
  builder.eq = vi.fn().mockReturnValue(builder)
  builder.maybeSingle = vi.fn().mockResolvedValue({ data: row, error: null })
  builder.upsert = vi.fn().mockResolvedValue({ error: upsertError })
  vi.mocked(createServiceClient).mockResolvedValue({ from: vi.fn(() => builder) } as never)
  return builder
}

const MISSING_TABLE = { code: "42P01", message: "relation \"delivery_slots_config\" does not exist" }

describe("/api/admin/delivery-slots", () => {
  beforeEach(() => vi.clearAllMocks())

  it("GET 403 sin permiso", async () => {
    asDenied()
    const res = await GET()
    expect(res.status).toBe(403)
  })

  it("GET sin fila devuelve la configuración histórica como default", async () => {
    asAdmin()
    serviceWithConfig(null)
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.available).toBe(true)
    expect(body.isDefault).toBe(true)
    expect(body.config.cutoffTime).toBeNull()
    expect(body.config.week).toHaveLength(7)
  })

  it("GET sin la tabla (42P01) declara available: false sin romper", async () => {
    asAdmin()
    const builder: Record<string, unknown> = {}
    builder.select = vi.fn().mockReturnValue(builder)
    builder.eq = vi.fn().mockReturnValue(builder)
    builder.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: MISSING_TABLE })
    vi.mocked(createServiceClient).mockResolvedValue({ from: vi.fn(() => builder) } as never)
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.available).toBe(false)
    expect(body.isDefault).toBe(true)
  })

  it("PUT guarda la configuración normalizada y deja bitácora", async () => {
    asAdmin()
    const builder = serviceWithConfig(null)
    const res = await PUT(
      new NextRequest("http://localhost/api/admin/delivery-slots", {
        method: "PUT",
        body: JSON.stringify({
          config: {
            cutoffTime: "14:00",
            capacityPerSlot: 4,
            week: [[], ["08-10"], [], [], [], [], []],
          },
        }),
      })
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.config.cutoffTime).toBe("14:00")
    expect(body.config.capacityPerSlot).toBe(4)
    expect(body.config.week[0]).toEqual([])
    expect(body.config.week[1]).toEqual(["08-10"])
    expect(body.isDefault).toBe(false)
    expect(builder.upsert).toHaveBeenCalled()
    expect(logAdminAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "delivery_slots_config_update" })
    )
  })

  it("PUT sin la tabla responde 409 con el aviso de la migración", async () => {
    asAdmin()
    serviceWithConfig(null, MISSING_TABLE)
    const res = await PUT(
      new NextRequest("http://localhost/api/admin/delivery-slots", {
        method: "PUT",
        body: JSON.stringify({ config: { cutoffTime: "14:00" } }),
      })
    )
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.code).toBe("delivery_slots_unavailable")
  })
})
