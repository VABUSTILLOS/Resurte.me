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

import { POST } from "./route"
import { createServiceClient } from "@/lib/supabase/service"
import { createClient } from "@/lib/supabase/server"
import { rateLimited } from "@/lib/rate-limit"

const OWNER_ID = "aaaaaaaa-1111-2222-3333-444444444444"
const MEMBER_ID = "bbbbbbbb-1111-2222-3333-444444444444"
const INVITE_ID = "cccccccc-1111-2222-3333-444444444444"
const TOKEN = "dddddddd-1111-2222-3333-444444444444"

function req(body: unknown) {
  return new NextRequest("https://resurte.me/api/panel/members/accept", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  })
}

type Result = { data?: unknown; error?: unknown }

function tableMock(results: Result[]) {
  const builder: Record<string, unknown> = {}
  const methods = ["select", "eq", "limit", "update", "insert", "delete"]
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

function sessionAs(userId: string | null, email?: string) {
  vi.mocked(createClient).mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: userId ? { id: userId, email } : null },
      }),
    },
  } as never)
}

describe("/api/panel/members/accept", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(rateLimited).mockResolvedValue({ allowed: true } as never)
  })

  it("sin sesión responde 401", async () => {
    sessionAs(null)
    const res = await POST(req({ token: TOKEN }))
    expect(res.status).toBe(401)
  })

  it("token mal formado responde 400", async () => {
    sessionAs(MEMBER_ID, "mes@fonda.mx")
    const res = await POST(req({ token: "abc" }))
    expect(res.status).toBe(400)
  })

  it("token desconocido responde 404", async () => {
    sessionAs(MEMBER_ID, "mes@fonda.mx")
    serviceWith({ panel_members: [{ data: [], error: null }] })
    const res = await POST(req({ token: TOKEN }))
    expect(res.status).toBe(404)
  })

  it("correo distinto al invitado responde 403", async () => {
    sessionAs(MEMBER_ID, "otro@fonda.mx")
    serviceWith({
      panel_members: [{ data: [{ id: INVITE_ID, owner_user_id: OWNER_ID, member_email: "mes@fonda.mx", status: "pendiente" }], error: null }],
    })
    const res = await POST(req({ token: TOKEN }))
    expect(res.status).toBe(403)
  })

  it("el dueño no puede aceptar su propia invitación (400)", async () => {
    sessionAs(OWNER_ID, "dueno@fonda.mx")
    serviceWith({
      panel_members: [{ data: [{ id: INVITE_ID, owner_user_id: OWNER_ID, member_email: "dueno@fonda.mx", status: "pendiente" }], error: null }],
    })
    const res = await POST(req({ token: TOKEN }))
    expect(res.status).toBe(400)
  })

  it("miembro activo de otro panel responde 409", async () => {
    sessionAs(MEMBER_ID, "mes@fonda.mx")
    serviceWith({
      panel_members: [
        { data: [{ id: INVITE_ID, owner_user_id: OWNER_ID, member_email: "mes@fonda.mx", status: "pendiente" }], error: null },
        { data: [{ id: "eeeeeeee-1111-2222-3333-444444444444" }], error: null }, // ya activo en otro
      ],
    })
    const res = await POST(req({ token: TOKEN }))
    expect(res.status).toBe(409)
  })

  it("activa la membresía con el usuario autenticado", async () => {
    sessionAs(MEMBER_ID, "mes@fonda.mx")
    const builders = serviceWith({
      panel_members: [
        { data: [{ id: INVITE_ID, owner_user_id: OWNER_ID, member_email: "mes@fonda.mx", status: "pendiente" }], error: null },
        { data: [], error: null }, // no activo en otro panel
        { data: null, error: null }, // update
      ],
    })
    const res = await POST(req({ token: TOKEN }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ accepted: true })
    expect(builders.panel_members?.update).toHaveBeenCalledWith(
      expect.objectContaining({ member_user_id: MEMBER_ID, status: "activo" }),
    )
  })
})
