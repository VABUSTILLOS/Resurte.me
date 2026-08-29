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

import { GET, POST, parseBackup } from "./route"
import { createServiceClient } from "@/lib/supabase/service"
import { createClient } from "@/lib/supabase/server"
import { rateLimited } from "@/lib/rate-limit"

const GUEST_TOKEN = "11111111-2222-3333-4444-555555555555"

function guestReq(url: string, init?: { method?: string; body?: string }) {
  return new NextRequest(url, {
    method: init?.method,
    body: init?.body,
    headers: { "x-guest-token": GUEST_TOKEN, "content-type": "application/json" },
  })
}

/** Builder chainable y "await-able": los métodos devuelven el builder y
 *  `await builder` resuelve con `result` (la ruta hace await de la cadena). */
function chainMock(result: { data?: unknown; error?: unknown } = { data: [] }) {
  const builder: Record<string, unknown> = {}
  for (const m of ["select", "eq", "is", "order", "delete", "update"]) {
    builder[m] = vi.fn().mockReturnValue(builder)
  }
  builder.limit = vi.fn().mockResolvedValue(result)
  builder.insert = vi.fn().mockResolvedValue(result)
  builder.then = (resolve: (v: unknown) => unknown) => resolve(result)
  return builder
}

function serviceWithTables(results: Record<string, { data?: unknown; error?: unknown }>) {
  const builders: Record<string, ReturnType<typeof chainMock>> = {}
  vi.mocked(createServiceClient).mockResolvedValue({
    from: vi.fn((t: string) => {
      if (!builders[t]) builders[t] = chainMock(results[t] ?? { data: [] })
      return builders[t]
    }),
  } as never)
  return builders
}

const VALID_BACKUP = {
  app: "resurte-me",
  version: 2,
  exportedAt: "2026-01-01T00:00:00.000Z",
  entries: [{ tool: "config-metas", collection_slug: "default", value: { meta: 1000 } }],
  rows: [
    {
      tool: "ventas-entries",
      collection_slug: "tacos",
      client_id: "v1",
      entry_date: "2026-01-01",
      data: { id: "v1", total: 100 },
    },
  ],
  dishes: [
    {
      id: "d1",
      name: "Taco",
      collection_slug: "tacos",
      ingredients: [],
      foodCostPercent: 30,
      sellingPrice: 50,
    },
  ],
}

describe("parseBackup", () => {
  it("acepta un respaldo v2 válido", () => {
    const parsed = parseBackup(VALID_BACKUP)
    expect(parsed).not.toBeNull()
    expect(parsed!.entries).toHaveLength(1)
    expect(parsed!.rows).toHaveLength(1)
    expect(parsed!.dishes).toHaveLength(1)
  })

  it("rechaza app o version incorrectos", () => {
    expect(parseBackup({ ...VALID_BACKUP, app: "otra" })).toBeNull()
    expect(parseBackup({ ...VALID_BACKUP, version: 1 })).toBeNull()
    expect(parseBackup(null)).toBeNull()
    expect(parseBackup("texto")).toBeNull()
  })

  it("rechaza entries con tool inválido", () => {
    const bad = { ...VALID_BACKUP, entries: [{ tool: "TOOL MALO!", collection_slug: "default", value: 1 }] }
    expect(parseBackup(bad)).toBeNull()
  })

  it("rechaza rows sin client_id válido", () => {
    const bad = {
      ...VALID_BACKUP,
      rows: [{ tool: "ventas-entries", collection_slug: "tacos", client_id: "", data: {} }],
    }
    expect(parseBackup(bad)).toBeNull()
  })

  it("rechaza rows con entry_date malformada", () => {
    const bad = {
      ...VALID_BACKUP,
      rows: [{ ...VALID_BACKUP.rows[0], entry_date: "01/01/2026" }],
    }
    expect(parseBackup(bad)).toBeNull()
  })

  it("rechaza dishes sin campos numéricos", () => {
    const bad = {
      ...VALID_BACKUP,
      dishes: [{ id: "d1", name: "X", collection_slug: "tacos", foodCostPercent: "30", sellingPrice: 50 }],
    }
    expect(parseBackup(bad)).toBeNull()
  })

  it("rechaza dishes sin collection_slug", () => {
    const bad = {
      ...VALID_BACKUP,
      dishes: [{ id: "d1", name: "X", ingredients: [], foodCostPercent: 30, sellingPrice: 50 }],
    }
    expect(parseBackup(bad)).toBeNull()
  })

  it("acepta secciones vacías u omitidas", () => {
    expect(parseBackup({ app: "resurte-me", version: 2 })).toEqual({ entries: [], rows: [], dishes: [] })
  })
})

describe("/api/panel/backup", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(rateLimited).mockResolvedValue({ allowed: true } as never)
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    } as never)
  })

  it("GET sin sesión ni guest_token responde 401", async () => {
    const res = await GET(new NextRequest("https://resurte.me/api/panel/backup"))
    expect(res.status).toBe(401)
  })

  it("GET exporta las 3 secciones con cabecera de descarga", async () => {
    serviceWithTables({
      panel_entries: { data: [{ tool: "config-metas", collection_slug: "default", payload: { value: 42 } }] },
      panel_rows: {
        data: [{
          tool: "ventas-entries", collection_slug: "tacos",
          client_id: "v1", entry_date: "2026-01-01", payload: { id: "v1" },
        }],
      },
      panel_dishes: {
        data: [{
          client_id: "d1", name: "Taco", ingredients: [], food_cost_percent: 30,
          selling_price: 50, modificadores: null, collection_slug: "tacos",
        }],
      },
    })
    const res = await GET(guestReq("https://resurte.me/api/panel/backup"))
    expect(res.status).toBe(200)
    expect(res.headers.get("Content-Disposition")).toContain("resurte-panel-respaldo-")
    const body = await res.json()
    expect(body.app).toBe("resurte-me")
    expect(body.version).toBe(2)
    expect(body.entries).toHaveLength(1)
    expect(body.entries[0].value).toBe(42)
    expect(body.rows).toHaveLength(1)
    expect(body.rows[0].data).toEqual({ id: "v1" })
    expect(body.dishes).toHaveLength(1)
    expect(body.dishes[0].foodCostPercent).toBe(30)
    expect(body.dishes[0].collection_slug).toBe("tacos")
  })

  it("GET respeta el rate limit", async () => {
    vi.mocked(rateLimited).mockResolvedValue({ allowed: false, retryAfter: 30 } as never)
    const res = await GET(guestReq("https://resurte.me/api/panel/backup"))
    expect(res.status).toBe(429)
  })

  it("POST sin auth responde 401", async () => {
    const res = await POST(new NextRequest("https://resurte.me/api/panel/backup", { method: "POST", body: "{}" }))
    expect(res.status).toBe(401)
  })

  it("POST con JSON inválido responde 400", async () => {
    const res = await POST(guestReq("https://resurte.me/api/panel/backup", { method: "POST", body: "{no-json" }))
    expect(res.status).toBe(400)
  })

  it("POST con respaldo no válido responde 400 sin escribir", async () => {
    const tables = serviceWithTables({})
    const res = await POST(guestReq("https://resurte.me/api/panel/backup", {
      method: "POST",
      body: JSON.stringify({ app: "resurte-me", version: 1, data: {} }),
    }))
    expect(res.status).toBe(400)
    expect(Object.keys(tables)).toHaveLength(0) // ni siquiera tocó la BD
  })

  it("POST válido borra e inserta en las 3 tablas y devuelve conteos", async () => {
    const tables = serviceWithTables({})
    const res = await POST(guestReq("https://resurte.me/api/panel/backup", {
      method: "POST",
      body: JSON.stringify(VALID_BACKUP),
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.imported).toBe(true)
    expect(body.counts).toEqual({ entries: 1, rows: 1, dishes: 1 })
    for (const t of ["panel_entries", "panel_rows", "panel_dishes"]) {
      const builder = tables[t]!
      expect(builder.delete).toHaveBeenCalled()
      expect(builder.insert).toHaveBeenCalled()
    }
  })

  it("POST con secciones vacías solo borra (no inserta)", async () => {
    const tables = serviceWithTables({})
    const res = await POST(guestReq("https://resurte.me/api/panel/backup", {
      method: "POST",
      body: JSON.stringify({ app: "resurte-me", version: 2, entries: [], rows: [], dishes: [] }),
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.counts).toEqual({ entries: 0, rows: 0, dishes: 0 })
    expect(tables.panel_entries!.insert).not.toHaveBeenCalled()
    expect(tables.panel_rows!.insert).not.toHaveBeenCalled()
    expect(tables.panel_dishes!.insert).not.toHaveBeenCalled()
  })
})
