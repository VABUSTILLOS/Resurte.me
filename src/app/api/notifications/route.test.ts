import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))

import { GET, POST } from "./route"
import { createClient } from "@/lib/supabase/server"

const USER = { id: "u-1", email: "a@b.com" }

function authed(user: unknown, table: ReturnType<typeof vi.fn>) {
  vi.mocked(createClient).mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }) },
    from: table,
  } as never)
}

describe("GET /api/notifications", () => {
  beforeEach(() => vi.clearAllMocks())

  it("401 sin sesión", async () => {
    authed(null, vi.fn())
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it("devuelve las notificaciones del usuario", async () => {
    const builder: Record<string, unknown> = {}
    for (const m of ["select", "eq", "order"]) builder[m] = vi.fn().mockReturnValue(builder)
    builder.limit = vi.fn().mockResolvedValue({
      data: [{ id: 1, type: "order_confirmation", title: "Pedido #1 recibido", read_at: null }],
      error: null,
    })
    authed(USER, vi.fn(() => builder))
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.notifications[0]).toMatchObject({ id: 1, type: "order_confirmation" })
  })
})

describe("POST /api/notifications", () => {
  beforeEach(() => vi.clearAllMocks())

  it("400 con ids inválidos", async () => {
    authed(USER, vi.fn())
    const res = await POST(
      new NextRequest("http://localhost/api/notifications", {
        method: "POST",
        body: JSON.stringify({ ids: "no-array" }),
      })
    )
    expect(res.status).toBe(400)
  })

  it("marca leídas solo las propias no leídas", async () => {
    const builder: Record<string, unknown> = {}
    const update = vi.fn().mockReturnValue(builder)
    builder.update = update
    for (const m of ["eq", "in"]) builder[m] = vi.fn().mockReturnValue(builder)
    builder.is = vi.fn().mockResolvedValue({ error: null })
    const from = vi.fn(() => builder)
    authed(USER, from)
    const res = await POST(
      new NextRequest("http://localhost/api/notifications", {
        method: "POST",
        body: JSON.stringify({ ids: [1, 2] }),
      })
    )
    expect(res.status).toBe(200)
    expect(from).toHaveBeenCalledWith("notifications")
    expect(update).toHaveBeenCalled()
  })
})
