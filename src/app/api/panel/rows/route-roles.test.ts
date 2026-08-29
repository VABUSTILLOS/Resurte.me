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

import { GET, POST } from "./route"
import { createServiceClient } from "@/lib/supabase/service"
import { createClient } from "@/lib/supabase/server"
import { rateLimited } from "@/lib/rate-limit"

/**
 * Enforcement de roles (Fase 4.6) sobre /api/panel/rows: un miembro
 * activo opera sobre los datos del dueño, limitado por la matriz.
 */

const OWNER_ID = "aaaaaaaa-1111-2222-3333-444444444444"
const MEMBER_ID = "bbbbbbbb-1111-2222-3333-444444444444"

function req(url: string, init?: { method?: string; body?: unknown }) {
  return new NextRequest(url, {
    method: init?.method,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    headers: { "content-type": "application/json" },
  })
}

type Result = { data?: unknown; error?: unknown }

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

function sessionAsMember(role: string) {
  vi.mocked(createClient).mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: MEMBER_ID, email: "staff@fonda.mx" } },
      }),
    },
  } as never)
  serviceWith({
    panel_members: [{ data: [{ owner_user_id: OWNER_ID, role }], error: null }],
  })
}

describe("/api/panel/rows — enforcement por rol", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(rateLimited).mockResolvedValue({ allowed: true } as never)
  })

  it("mesero escribe ventas-entries sobre los datos del dueño", async () => {
    sessionAsMember("mesero")
    const res = await POST(req("https://resurte.me/api/panel/rows", {
      method: "POST",
      body: { tool: "ventas-entries", rows: [{ client_id: "v-1", data: { total: 100 } }] },
    }))
    expect(res.status).toBe(200)
  })

  it("mesero NO escribe mermas-entries (403)", async () => {
    sessionAsMember("mesero")
    const res = await POST(req("https://resurte.me/api/panel/rows", {
      method: "POST",
      body: { tool: "mermas-entries", rows: [{ client_id: "m-1", data: {} }] },
    }))
    expect(res.status).toBe(403)
  })

  it("cocina lee mermas-entries pero no ventas-entries (403)", async () => {
    sessionAsMember("cocina")
    const ok = await GET(req("https://resurte.me/api/panel/rows?tool=mermas-entries"))
    expect(ok.status).toBe(200)
    const denied = await GET(req("https://resurte.me/api/panel/rows?tool=ventas-entries"))
    expect(denied.status).toBe(403)
  })

  it("la consulta filtra por el dueño de la membresía, no por el miembro", async () => {
    sessionAsMember("cocina")
    const builders = serviceWith({
      panel_members: [{ data: [{ owner_user_id: OWNER_ID, role: "cocina" }], error: null }],
      panel_rows: [{ data: [{ payload: { id: "x-1" }, client_id: "x-1" }], error: null }],
    })
    const res = await GET(req("https://resurte.me/api/panel/rows?tool=mermas-entries"))
    expect(res.status).toBe(200)
    expect(builders.panel_rows?.eq).toHaveBeenCalledWith("user_id", OWNER_ID)
  })
})
