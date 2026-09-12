import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }))
vi.mock("@/lib/admin-auth", () => ({ requireAdmin: vi.fn() }))
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))

import { GET, POST, PATCH } from "./route"
import { createServiceClient } from "@/lib/supabase/service"
import { requireAdmin } from "@/lib/admin-auth"

function asAdmin() {
  vi.mocked(requireAdmin).mockResolvedValue({ user: { id: "admin-1" }, response: null } as never)
}

function asDenied() {
  vi.mocked(requireAdmin).mockResolvedValue({
    user: null,
    response: new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }),
  } as never)
}

function serviceWith(table: Record<string, unknown>) {
  vi.mocked(createServiceClient).mockResolvedValue({ from: vi.fn(() => table) } as never)
}

describe("/api/admin/drivers", () => {
  beforeEach(() => vi.clearAllMocks())

  it("GET 403 sin rol admin", async () => {
    asDenied()
    const res = await GET()
    expect(res.status).toBe(403)
  })

  it("GET lista repartidores", async () => {
    asAdmin()
    const builder: Record<string, unknown> = {}
    builder.select = vi.fn().mockReturnValue(builder)
    builder.order = vi.fn().mockReturnValue(builder)
    // Segundo .order() resuelve
    let orderCalls = 0
    builder.order = vi.fn().mockImplementation(() =>
      ++orderCalls >= 2
        ? Promise.resolve({ data: [{ id: 1, name: "Luis", is_active: true }], error: null })
        : builder
    )
    serviceWith(builder)
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.drivers[0]).toMatchObject({ name: "Luis" })
  })

  it("POST 400 sin nombre", async () => {
    asAdmin()
    const res = await POST(
      new NextRequest("http://localhost/api/admin/drivers", {
        method: "POST",
        body: JSON.stringify({ name: "  " }),
      })
    )
    expect(res.status).toBe(400)
  })

  it("POST 201 crea repartidor", async () => {
    asAdmin()
    const single = vi.fn().mockResolvedValue({ data: { id: 5, name: "Ana" }, error: null })
    const builder = {
      insert: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single }) }),
    }
    serviceWith(builder)
    const res = await POST(
      new NextRequest("http://localhost/api/admin/drivers", {
        method: "POST",
        body: JSON.stringify({ name: "Ana", phone: "6141234567" }),
      })
    )
    expect(res.status).toBe(201)
    expect(builder.insert).toHaveBeenCalledWith({ name: "Ana", phone: "6141234567" })
  })

  it("PATCH 400 con payload inválido", async () => {
    asAdmin()
    const res = await PATCH(
      new NextRequest("http://localhost/api/admin/drivers", {
        method: "PATCH",
        body: JSON.stringify({ id: "x" }),
      })
    )
    expect(res.status).toBe(400)
  })
})
