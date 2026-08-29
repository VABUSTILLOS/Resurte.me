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

import { GET, POST, DELETE } from "./route"
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

type Result = { data?: unknown; error?: unknown }

/**
 * Builder thenable: todos los métodos devuelven el mismo builder y
 * `await` (en cualquier punto terminal) resuelve el siguiente resultado
 * encolado (FIFO; se repite el último).
 */
function tableMock(results: Result[]) {
  const builder: Record<string, unknown> = {}
  const methods = [
    "select", "eq", "is", "order", "delete", "update", "gte", "lte", "in",
    "limit", "range", "insert", "upsert",
  ]
  for (const m of methods) builder[m] = vi.fn().mockReturnValue(builder)
  builder.then = function (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
    const r = results.length > 1 ? results.shift()! : (results[0] ?? { data: [], error: null })
    return Promise.resolve(r).then(resolve, reject)
  }
  return builder
}

function serviceWith(tables: Record<string, Result[]>) {
  const builders: Record<string, ReturnType<typeof tableMock>> = {}
  for (const [table, results] of Object.entries(tables)) {
    builders[table] = tableMock(results)
  }
  vi.mocked(createServiceClient).mockResolvedValue({
    from: vi.fn((t: string) => builders[t] ?? tableMock([{ data: [], error: null }])),
  } as never)
  return builders
}

describe("/api/panel/rows", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(rateLimited).mockResolvedValue({ allowed: true } as never)
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    } as never)
  })

  it("GET sin sesión ni guest_token responde 401", async () => {
    const res = await GET(new NextRequest("https://resurte.me/api/panel/rows?tool=ventas-entries"))
    expect(res.status).toBe(401)
  })

  it("GET con tool o rango de fechas inválido responde 400", async () => {
    const bad = await GET(guestReq("https://resurte.me/api/panel/rows?tool=DROP TABLE"))
    expect(bad.status).toBe(400)
    const badDate = await GET(guestReq("https://resurte.me/api/panel/rows?tool=ventas-entries&from=hoy"))
    expect(badDate.status).toBe(400)
  })

  it("GET devuelve las filas e inyecta id cuando el payload no lo trae", async () => {
    serviceWith({
      panel_rows: [
        {
          data: [
            { payload: { id: "s-1", quantity: 2 }, client_id: "s-1" },
            { payload: { itemId: "i-1", delta: -1 }, client_id: "mig-3-abc" },
          ],
          error: null,
        },
      ],
      panel_entries: [{ data: [], error: null }],
    })
    const res = await GET(guestReq("https://resurte.me/api/panel/rows?tool=ventas-entries&collection=taqueria"))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      found: true,
      rows: [
        { id: "s-1", quantity: 2 },
        { itemId: "i-1", delta: -1, id: "mig-3-abc" },
      ],
    })
  })

  it("GET aplica filtro por rango de fechas", async () => {
    const builders = serviceWith({
      panel_rows: [{ data: [{ payload: { id: "s-1" }, client_id: "s-1" }], error: null }],
    })
    const res = await GET(
      guestReq("https://resurte.me/api/panel/rows?tool=ventas-entries&from=2025-01-01&to=2025-01-31"),
    )
    expect(res.status).toBe(200)
    expect(builders["panel_rows"]!["gte"]).toHaveBeenCalledWith("entry_date", "2025-01-01")
    expect(builders["panel_rows"]!["lte"]).toHaveBeenCalledWith("entry_date", "2025-01-31")
  })

  it("GET pagina con cursor cuando hay más filas que el límite", async () => {
    serviceWith({
      panel_rows: [
        {
          data: [
            { payload: { id: "s-1" }, client_id: "s-1" },
            { payload: { id: "s-2" }, client_id: "s-2" },
            { payload: { id: "s-3" }, client_id: "s-3" },
          ],
          error: null,
        },
      ],
    })
    const res = await GET(guestReq("https://resurte.me/api/panel/rows?tool=ventas-entries&limit=2"))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.rows).toEqual([{ id: "s-1" }, { id: "s-2" }])
    expect(body.nextCursor).toBe("2")
  })

  it("GET sin filas ni payload en panel_entries responde found=false", async () => {
    serviceWith({
      panel_rows: [{ data: [], error: null }],
      panel_entries: [{ data: [], error: null }],
    })
    const res = await GET(guestReq("https://resurte.me/api/panel/rows?tool=ventas-entries"))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ found: false, rows: [] })
  })

  it("GET migra el array de panel_entries al primer acceso vacío", async () => {
    const builders = serviceWith({
      // 1ª consulta: sin filas → migración; 2ª (requery): filas importadas.
      panel_rows: [
        { data: [], error: null },
        { error: null }, // insert de migración
        { data: [{ payload: { id: "s-1", quantity: 2 }, client_id: "s-1" }], error: null },
      ],
      panel_entries: [
        { data: [{ payload: { value: [{ id: "s-1", quantity: 2, date: "2025-01-02" }] } }], error: null },
      ],
    })
    const res = await GET(guestReq("https://resurte.me/api/panel/rows?tool=ventas-entries&collection=taqueria"))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ found: true, rows: [{ id: "s-1", quantity: 2 }], migrated: true })
    expect(builders["panel_rows"]!["insert"]).toHaveBeenCalledWith([
      expect.objectContaining({
        tool: "ventas-entries",
        collection_slug: "taqueria",
        guest_token: GUEST_TOKEN,
        client_id: "s-1",
        entry_date: "2025-01-02",
      }),
    ])
  })

  it("POST hace upsert idempotente por client_id con el constraint del dueño", async () => {
    const builders = serviceWith({ panel_rows: [{ error: null }] })
    const res = await POST(
      guestReq("https://resurte.me/api/panel/rows", {
        method: "POST",
        body: JSON.stringify({
          tool: "ventas-entries",
          collection_slug: "taqueria",
          rows: [
            { client_id: "s-1", entry_date: "2025-01-02", data: { id: "s-1", quantity: 2 } },
            { client_id: "s-2", entry_date: null, data: { id: "s-2", quantity: 1 } },
          ],
        }),
      }),
    )
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ saved: true, count: 2 })
    expect(builders["panel_rows"]!["upsert"]).toHaveBeenCalledWith(
      [
        expect.objectContaining({ client_id: "s-1", entry_date: "2025-01-02", guest_token: GUEST_TOKEN }),
        expect.objectContaining({ client_id: "s-2", entry_date: null }),
      ],
      { onConflict: "guest_token,tool,collection_slug,client_id" },
    )
  })

  it("POST con sesión usa el constraint de user_id", async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }) },
    } as never)
    const builders = serviceWith({ panel_rows: [{ error: null }] })
    const res = await POST(
      guestReq("https://resurte.me/api/panel/rows", {
        method: "POST",
        body: JSON.stringify({
          tool: "mermas-entries",
          rows: [{ client_id: "w-1", entry_date: "2025-02-01", data: { id: "w-1" } }],
        }),
      }),
    )
    expect(res.status).toBe(200)
    expect(builders["panel_rows"]!["upsert"]).toHaveBeenCalledWith(
      [expect.objectContaining({ user_id: "user-1", guest_token: null })],
      { onConflict: "user_id,tool,collection_slug,client_id" },
    )
  })

  it("POST valida rows y responde 400 con client_id inválido", async () => {
    const res = await POST(
      guestReq("https://resurte.me/api/panel/rows", {
        method: "POST",
        body: JSON.stringify({ tool: "ventas-entries", rows: [{ client_id: "", data: {} }] }),
      }),
    )
    expect(res.status).toBe(400)
  })

  it("POST con lote que excede 256 KB responde 413", async () => {
    const big = "x".repeat(300 * 1024)
    const res = await POST(
      guestReq("https://resurte.me/api/panel/rows", {
        method: "POST",
        body: JSON.stringify({
          tool: "ventas-entries",
          rows: [{ client_id: "s-1", entry_date: null, data: { id: "s-1", note: big } }],
        }),
      }),
    )
    expect(res.status).toBe(413)
  })

  it("DELETE borra por client_ids dentro del dueño + tool + colección", async () => {
    const builders = serviceWith({ panel_rows: [{ error: null }] })
    const res = await DELETE(
      guestReq("https://resurte.me/api/panel/rows", {
        method: "DELETE",
        body: JSON.stringify({
          tool: "ventas-entries",
          collection_slug: "taqueria",
          client_ids: ["s-1", "s-2"],
        }),
      }),
    )
    expect(res.status).toBe(200)
    const builder = builders["panel_rows"]!
    expect(builder["delete"]).toHaveBeenCalled()
    expect(builder["eq"]).toHaveBeenCalledWith("guest_token", GUEST_TOKEN)
    expect(builder["eq"]).toHaveBeenCalledWith("tool", "ventas-entries")
    expect(builder["in"]).toHaveBeenCalledWith("client_id", ["s-1", "s-2"])
  })

  it("DELETE sin client_ids borra todo el tool + colección del dueño", async () => {
    const builders = serviceWith({ panel_rows: [{ error: null }] })
    const res = await DELETE(
      guestReq("https://resurte.me/api/panel/rows", {
        method: "DELETE",
        body: JSON.stringify({ tool: "mermas-entries" }),
      }),
    )
    expect(res.status).toBe(200)
    expect(builders["panel_rows"]!["in"]).not.toHaveBeenCalled()
  })

  it("responde 429 cuando el rate limit está agotado", async () => {
    vi.mocked(rateLimited).mockResolvedValue({ allowed: false } as never)
    const res = await GET(guestReq("https://resurte.me/api/panel/rows?tool=ventas-entries"))
    expect(res.status).toBe(429)
  })
})
