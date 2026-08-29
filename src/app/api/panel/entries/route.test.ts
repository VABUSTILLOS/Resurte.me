import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }))
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))
vi.mock("@/lib/rate-limit", () => ({
  rateLimited: vi.fn(),
  clientIp: vi.fn(() => "1.2.3.4"),
  rateLimitResponse: vi.fn(() => new Response(JSON.stringify({ error: "Rate limit" }), { status: 429 })),
}))
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))

import { GET, PUT } from "./route"
import { createServiceClient } from "@/lib/supabase/service"
import { createClient } from "@/lib/supabase/server"
import { rateLimited } from "@/lib/rate-limit"

const GUEST_TOKEN = "11111111-2222-3333-4444-555555555555"

function guestReq(url: string, init?: { method?: string; body?: string; headers?: Record<string, string> }) {
  return new NextRequest(url, {
    method: init?.method,
    body: init?.body,
    headers: { "x-guest-token": GUEST_TOKEN, "content-type": "application/json", ...init?.headers },
  })
}

/** Chainable mock de PostgREST: cualquier método devuelve el mismo builder. */
function chainMock() {
  const builder: Record<string, unknown> = {}
  for (const method of ["select", "eq", "is", "order", "delete", "insert", "update", "limit"]) {
    builder[method] = vi.fn().mockReturnValue(builder)
  }
  builder.then = undefined
  return builder
}

function serviceWith(table: string, result: { data?: unknown; error?: unknown }) {
  const builder = chainMock()
  builder.select = vi.fn().mockReturnValue(builder)
  builder.eq = vi.fn().mockReturnValue(builder)
  builder.order = vi.fn().mockReturnValue(builder)
  builder.limit = vi.fn().mockResolvedValue(result)
  builder.delete = vi.fn().mockReturnValue(builder)
  builder.insert = vi.fn().mockResolvedValue(result)
  vi.mocked(createServiceClient).mockResolvedValue({
    from: vi.fn((t: string) => (t === table ? builder : chainMock())),
  } as never)
  return builder
}

describe("/api/panel/entries", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(rateLimited).mockResolvedValue({ allowed: true } as never)
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    } as never)
  })

  it("GET sin sesión ni guest_token responde 401", async () => {
    const res = await GET(new NextRequest("https://resurte.me/api/panel/entries?tool=ventas-entries"))
    expect(res.status).toBe(401)
  })

  it("GET con guest_token inválido responde 401", async () => {
    const res = await GET(
      new NextRequest("https://resurte.me/api/panel/entries?tool=ventas-entries", {
        headers: { "x-guest-token": "no-es-uuid" },
      }),
    )
    expect(res.status).toBe(401)
  })

  it("GET sin tool responde 400", async () => {
    const res = await GET(guestReq("https://resurte.me/api/panel/entries"))
    expect(res.status).toBe(400)
  })

  it("GET con tool inválido responde 400", async () => {
    const res = await GET(guestReq("https://resurte.me/api/panel/entries?tool=DROP TABLE"))
    expect(res.status).toBe(400)
  })

  it("GET devuelve found=false cuando el dueño no tiene la clave", async () => {
    serviceWith("panel_entries", { data: [], error: null })
    const res = await GET(guestReq("https://resurte.me/api/panel/entries?tool=ventas-entries&collection=taqueria"))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ found: false })
  })

  it("GET devuelve el valor filtrado por dueño, tool y colección", async () => {
    const builder = serviceWith("panel_entries", {
      data: [{ payload: { value: [{ id: "sale-1", quantity: 2 }] } }],
      error: null,
    })
    const res = await GET(guestReq("https://resurte.me/api/panel/entries?tool=ventas-entries&collection=taqueria"))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ found: true, value: [{ id: "sale-1", quantity: 2 }] })
    expect(builder.eq).toHaveBeenCalledWith("guest_token", GUEST_TOKEN)
    expect(builder.eq).toHaveBeenCalledWith("tool", "ventas-entries")
    expect(builder.eq).toHaveBeenCalledWith("collection_slug", "taqueria")
  })

  it("PUT reemplaza el valor: delete por dueño + tool + colección e insert", async () => {
    const builder = serviceWith("panel_entries", { error: null })
    const res = await PUT(
      guestReq("https://resurte.me/api/panel/entries", {
        method: "PUT",
        body: JSON.stringify({
          tool: "mermas-entries",
          collection_slug: "taqueria",
          value: [{ id: "w-1", amountKg: 0.5 }],
        }),
      }),
    )
    expect(res.status).toBe(200)
    expect(builder.delete).toHaveBeenCalled()
    expect(builder.eq).toHaveBeenCalledWith("guest_token", GUEST_TOKEN)
    expect(builder.eq).toHaveBeenCalledWith("tool", "mermas-entries")
    expect(builder.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        tool: "mermas-entries",
        collection_slug: "taqueria",
        user_id: null,
        guest_token: GUEST_TOKEN,
        payload: { value: [{ id: "w-1", amountKg: 0.5 }] },
      }),
    )
  })

  it("PUT sin value responde 400", async () => {
    const res = await PUT(
      guestReq("https://resurte.me/api/panel/entries", {
        method: "PUT",
        body: JSON.stringify({ tool: "ventas-entries" }),
      }),
    )
    expect(res.status).toBe(400)
  })

  it("PUT con value que excede 256 KB responde 413", async () => {
    const big = "x".repeat(300 * 1024)
    const res = await PUT(
      guestReq("https://resurte.me/api/panel/entries", {
        method: "PUT",
        body: JSON.stringify({ tool: "ventas-entries", value: big }),
      }),
    )
    expect(res.status).toBe(413)
  })

  it("PUT usa user_id cuando hay sesión", async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }) },
    } as never)
    const builder = serviceWith("panel_entries", { error: null })

    const res = await PUT(
      guestReq("https://resurte.me/api/panel/entries", {
        method: "PUT",
        body: JSON.stringify({ tool: "ventas-meta-dia", value: 5000 }),
      }),
    )
    expect(res.status).toBe(200)
    expect(builder.eq).toHaveBeenCalledWith("user_id", "user-1")
    expect(builder.insert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: "user-1", guest_token: null, payload: { value: 5000 } }),
    )
  })

  it("responde 429 cuando el rate limit está agotado", async () => {
    vi.mocked(rateLimited).mockResolvedValue({ allowed: false } as never)
    const res = await GET(guestReq("https://resurte.me/api/panel/entries?tool=ventas-entries"))
    expect(res.status).toBe(429)
  })
})
