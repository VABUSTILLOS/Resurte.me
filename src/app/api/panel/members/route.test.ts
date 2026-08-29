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

import { GET, POST, PATCH, DELETE } from "./route"
import { createServiceClient } from "@/lib/supabase/service"
import { createClient } from "@/lib/supabase/server"
import { rateLimited } from "@/lib/rate-limit"

const OWNER_ID = "aaaaaaaa-1111-2222-3333-444444444444"
const MEMBER_ID = "bbbbbbbb-1111-2222-3333-444444444444"
const MEMBER_ROW_ID = "cccccccc-1111-2222-3333-444444444444"

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
    "limit", "range", "insert", "upsert", "ilike",
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

function sessionAs(userId: string | null, email = "dueno@fonda.mx") {
  vi.mocked(createClient).mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: userId ? { id: userId, email } : null },
      }),
    },
  } as never)
}

describe("/api/panel/members", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(rateLimited).mockResolvedValue({ allowed: true } as never)
  })

  it("GET sin sesión responde 401", async () => {
    sessionAs(null)
    const res = await GET(req("https://resurte.me/api/panel/members"))
    expect(res.status).toBe(401)
  })

  it("GET ?mine=1 devuelve dueno cuando no hay membresía activa", async () => {
    sessionAs(OWNER_ID)
    serviceWith({ panel_members: [{ data: [], error: null }] })
    const res = await GET(req("https://resurte.me/api/panel/members?mine=1"))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ role: "dueno", viaMember: false })
  })

  it("GET ?mine=1 devuelve el rol del miembro activo", async () => {
    sessionAs(MEMBER_ID, "cocinero@fonda.mx")
    serviceWith({
      panel_members: [{ data: [{ owner_user_id: OWNER_ID, role: "cocina" }], error: null }],
    })
    const res = await GET(req("https://resurte.me/api/panel/members?mine=1"))
    expect(await res.json()).toEqual({ role: "cocina", viaMember: true, owner_user_id: OWNER_ID })
  })

  it("GET lista los miembros del dueño", async () => {
    sessionAs(OWNER_ID)
    const builders = serviceWith({
      panel_members: [
        { data: [{ id: MEMBER_ROW_ID, member_email: "mes@fonda.mx", role: "mesero", status: "activo" }], error: null },
      ],
    })
    const res = await GET(req("https://resurte.me/api/panel/members"))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.members).toHaveLength(1)
    expect(builders.panel_members?.eq).toHaveBeenCalledWith("owner_user_id", OWNER_ID)
  })

  it("POST invita con email y rol válidos", async () => {
    sessionAs(OWNER_ID)
    serviceWith({
      panel_members: [
        { data: [], error: null }, // requireOwnerUser
        { data: [], error: null }, // búsqueda de existente
        { data: [{ id: MEMBER_ROW_ID, member_email: "chef@fonda.mx", role: "cocina", status: "pendiente", invite_token: "t" }], error: null },
      ],
    })
    const res = await POST(req("https://resurte.me/api/panel/members", {
      method: "POST",
      body: { email: "Chef@Fonda.mx", role: "cocina" },
    }))
    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.member.role).toBe("cocina")
  })

  it("POST rechaza email o rol inválidos y auto-invitación", async () => {
    sessionAs(OWNER_ID)
    serviceWith({ panel_members: [{ data: [], error: null }] })
    const badEmail = await POST(req("https://resurte.me/api/panel/members", {
      method: "POST", body: { email: "no-es-email", role: "cocina" },
    }))
    expect(badEmail.status).toBe(400)
    const badRole = await POST(req("https://resurte.me/api/panel/members", {
      method: "POST", body: { email: "a@b.com", role: "dueno" },
    }))
    expect(badRole.status).toBe(400)
    const self = await POST(req("https://resurte.me/api/panel/members", {
      method: "POST", body: { email: "dueno@fonda.mx", role: "gerente" },
    }))
    expect(self.status).toBe(400)
  })

  it("POST como miembro activo de otro panel responde 403", async () => {
    sessionAs(MEMBER_ID, "cocinero@fonda.mx")
    serviceWith({ panel_members: [{ data: [{ id: MEMBER_ROW_ID }], error: null }] })
    const res = await POST(req("https://resurte.me/api/panel/members", {
      method: "POST", body: { email: "otro@fonda.mx", role: "mesero" },
    }))
    expect(res.status).toBe(403)
  })

  it("PATCH cambia el rol de un miembro propio", async () => {
    sessionAs(OWNER_ID)
    const builders = serviceWith({ panel_members: [{ data: [], error: null }, { data: null, error: null }] })
    const res = await PATCH(req("https://resurte.me/api/panel/members", {
      method: "PATCH", body: { id: MEMBER_ROW_ID, role: "gerente" },
    }))
    expect(res.status).toBe(200)
    expect(builders.panel_members?.update).toHaveBeenCalled()
  })

  it("DELETE revoca un miembro propio; id inválido da 400", async () => {
    sessionAs(OWNER_ID)
    serviceWith({ panel_members: [{ data: [], error: null }, { data: null, error: null }] })
    const bad = await DELETE(req("https://resurte.me/api/panel/members", {
      method: "DELETE", body: { id: "no-uuid" },
    }))
    expect(bad.status).toBe(400)
    const ok = await DELETE(req("https://resurte.me/api/panel/members", {
      method: "DELETE", body: { id: MEMBER_ROW_ID },
    }))
    expect(ok.status).toBe(200)
  })
})
