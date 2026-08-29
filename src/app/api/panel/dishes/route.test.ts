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
function chainMock(result: { data?: unknown; error?: unknown }) {
  const builder: Record<string, unknown> = {}
  for (const method of ["select", "eq", "is", "order", "delete", "insert", "update"]) {
    builder[method] = vi.fn().mockReturnValue(builder)
  }
  builder.then = undefined
  return builder
}

function serviceWith(table: string, result: { data?: unknown; error?: unknown }) {
  const builder = chainMock(result)
  // select/order/delete/insert resuelven la promesa con el resultado final
  builder.select = vi.fn().mockReturnValue(builder)
  builder.eq = vi.fn().mockReturnValue(builder)
  builder.order = vi.fn().mockResolvedValue(result)
  builder.delete = vi.fn().mockReturnValue(builder)
  builder.insert = vi.fn().mockResolvedValue(result)
  vi.mocked(createServiceClient).mockResolvedValue({
    from: vi.fn((t: string) => (t === table ? builder : chainMock({}))),
  } as never)
  return builder
}

describe("/api/panel/dishes", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(rateLimited).mockResolvedValue({ allowed: true } as never)
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    } as never)
  })

  it("GET sin sesión ni guest_token responde 401", async () => {
    const res = await GET(new NextRequest("https://resurte.me/api/panel/dishes"))
    expect(res.status).toBe(401)
  })

  it("GET con guest_token inválido responde 401", async () => {
    const res = await GET(
      new NextRequest("https://resurte.me/api/panel/dishes", {
        headers: { "x-guest-token": "no-es-uuid" },
      }),
    )
    expect(res.status).toBe(401)
  })

  it("GET devuelve los platillos del guest filtrados por colección", async () => {
    const builder = serviceWith("panel_dishes", {
      data: [
        {
          client_id: "dish-1",
          name: "Tacos",
          ingredients: [],
          food_cost_percent: 30,
          selling_price: 90,
          modificadores: null,
        },
      ],
      error: null,
    })

    const res = await GET(guestReq("https://resurte.me/api/panel/dishes?collection=taqueria"))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.dishes).toEqual([
      { id: "dish-1", name: "Tacos", ingredients: [], foodCostPercent: 30, sellingPrice: 90 },
    ])
    expect(builder.eq).toHaveBeenCalledWith("guest_token", GUEST_TOKEN)
    expect(builder.eq).toHaveBeenCalledWith("collection_slug", "taqueria")
  })

  it("PUT reemplaza la lista: delete por dueño + colección e insert", async () => {
    const builder = serviceWith("panel_dishes", { error: null })
    const dish = {
      id: "dish-1",
      name: "Tacos",
      ingredients: [{ ingredientName: "Tortilla", quantity: 3, unit: "pza", unitPrice: 2 }],
      foodCostPercent: 30,
      sellingPrice: 90,
    }

    const res = await PUT(
      guestReq("https://resurte.me/api/panel/dishes", {
        method: "PUT",
        body: JSON.stringify({ collection_slug: "taqueria", dishes: [dish] }),
      }),
    )
    expect(res.status).toBe(200)
    expect(builder.delete).toHaveBeenCalled()
    expect(builder.insert).toHaveBeenCalledWith([
      expect.objectContaining({
        client_id: "dish-1",
        collection_slug: "taqueria",
        user_id: null,
        guest_token: GUEST_TOKEN,
        name: "Tacos",
        food_cost_percent: 30,
        selling_price: 90,
      }),
    ])
  })

  it("PUT con dishes inválido responde 400", async () => {
    const res = await PUT(
      guestReq("https://resurte.me/api/panel/dishes", {
        method: "PUT",
        body: JSON.stringify({ dishes: [{ id: 1 }] }),
      }),
    )
    expect(res.status).toBe(400)
  })

  it("PUT usa user_id cuando hay sesión", async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }) },
    } as never)
    const builder = serviceWith("panel_dishes", { error: null })

    const res = await PUT(
      guestReq("https://resurte.me/api/panel/dishes", {
        method: "PUT",
        body: JSON.stringify({ dishes: [] }),
      }),
    )
    expect(res.status).toBe(200)
    expect(builder.eq).toHaveBeenCalledWith("user_id", "user-1")
    expect(builder.insert).not.toHaveBeenCalled()
  })

  it("responde 429 cuando el rate limit está agotado", async () => {
    vi.mocked(rateLimited).mockResolvedValue({ allowed: false } as never)
    const res = await GET(guestReq("https://resurte.me/api/panel/dishes"))
    expect(res.status).toBe(429)
  })
})
