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
const OWNER_ID = "99999999-8888-7777-6666-555555555555"
const BASE = "2026-01-01T10:00:00.123456+00:00"
const NEXT = "2026-01-01T10:00:05.654321+00:00"

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

/** El PUT ya no toca la tabla: pasa por el RPC atómico `panel_entry_put`. */
function serviceWithRpc(result: { data?: unknown; error?: unknown }) {
  const rpc = vi.fn().mockResolvedValue(result)
  const from = vi.fn(() => chainMock())
  vi.mocked(createServiceClient).mockResolvedValue({ from, rpc } as never)
  return { rpc, from }
}

/** Sesión con membresía: el dueño es otro y el rol del miembro decide el 403. */
function sessionAsMember(role: string) {
  vi.mocked(createClient).mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "member-1" } } }) },
  } as never)
  const memberBuilder = chainMock()
  memberBuilder.limit = vi
    .fn()
    .mockResolvedValue({ data: [{ owner_user_id: OWNER_ID, role }], error: null })
  vi.mocked(createServiceClient).mockResolvedValue({
    from: vi.fn(() => memberBuilder),
    rpc: vi.fn(),
  } as never)
}

function asGuestSession() {
  vi.mocked(createClient).mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
  } as never)
}

describe("/api/panel/entries — autorización y validación", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(rateLimited).mockResolvedValue({ allowed: true } as never)
    asGuestSession()
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

  it("PUT rechaza una base que no es fecha: compararla devolvería un 409 perpetuo", async () => {
    serviceWithRpc({ data: [{ applied: true }], error: null })
    const res = await PUT(
      guestReq("https://resurte.me/api/panel/entries", {
        method: "PUT",
        body: JSON.stringify({ tool: "ventas-entries", value: 1, base_updated_at: "ayer" }),
      }),
    )
    expect(res.status).toBe(400)
  })

  it("PUT rechaza una base que no es cadena", async () => {
    serviceWithRpc({ data: [{ applied: true }], error: null })
    const res = await PUT(
      guestReq("https://resurte.me/api/panel/entries", {
        method: "PUT",
        body: JSON.stringify({ tool: "ventas-entries", value: 1, base_updated_at: 12345 }),
      }),
    )
    expect(res.status).toBe(400)
  })

  it("PUT responde 403 cuando el rol no puede escribir la clave", async () => {
    sessionAsMember("mesero")
    const res = await PUT(
      guestReq("https://resurte.me/api/panel/entries", {
        method: "PUT",
        body: JSON.stringify({ tool: "costeo-dishes", value: [] }),
      }),
    )
    expect(res.status).toBe(403)
  })

  it("responde 429 cuando el rate limit está agotado", async () => {
    vi.mocked(rateLimited).mockResolvedValue({ allowed: false } as never)
    const res = await GET(guestReq("https://resurte.me/api/panel/entries?tool=ventas-entries"))
    expect(res.status).toBe(429)
  })
})

describe("/api/panel/entries GET", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(rateLimited).mockResolvedValue({ allowed: true } as never)
    asGuestSession()
  })

  it("devuelve found=false cuando el dueño no tiene la clave", async () => {
    serviceWith("panel_entries", { data: [], error: null })
    const res = await GET(guestReq("https://resurte.me/api/panel/entries?tool=ventas-entries&collection=taqueria"))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ found: false })
  })

  it("devuelve el valor y su versión, filtrado por dueño, tool y colección", async () => {
    const builder = serviceWith("panel_entries", {
      data: [{ payload: { value: [{ id: "sale-1", quantity: 2 }] }, updated_at: BASE }],
      error: null,
    })
    const res = await GET(guestReq("https://resurte.me/api/panel/entries?tool=ventas-entries&collection=taqueria"))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      found: true,
      value: [{ id: "sale-1", quantity: 2 }],
      updated_at: BASE,
    })
    expect(builder.eq).toHaveBeenCalledWith("guest_token", GUEST_TOKEN)
    expect(builder.eq).toHaveBeenCalledWith("tool", "ventas-entries")
    expect(builder.eq).toHaveBeenCalledWith("collection_slug", "taqueria")
  })

  it("no ordena por created_at: se reinicia en cada escritura y ya hay una sola fila", async () => {
    const builder = serviceWith("panel_entries", { data: [], error: null })
    await GET(guestReq("https://resurte.me/api/panel/entries?tool=ventas-entries"))
    expect(builder.order).not.toHaveBeenCalled()
  })

  it("un payload sin la clave 'value' se trata como ausente, no como valor null", async () => {
    serviceWith("panel_entries", { data: [{ payload: { otro: 1 }, updated_at: BASE }], error: null })
    const res = await GET(guestReq("https://resurte.me/api/panel/entries?tool=ventas-entries"))
    expect(await res.json()).toEqual({ found: false })
  })

  it("un payload que no es objeto se trata como ausente", async () => {
    serviceWith("panel_entries", { data: [{ payload: 42, updated_at: BASE }], error: null })
    const res = await GET(guestReq("https://resurte.me/api/panel/entries?tool=ventas-entries"))
    expect(await res.json()).toEqual({ found: false })
  })

  it("sin updated_at devuelve null en vez de undefined", async () => {
    serviceWith("panel_entries", { data: [{ payload: { value: 1 } }], error: null })
    const res = await GET(guestReq("https://resurte.me/api/panel/entries?tool=ventas-entries"))
    expect(await res.json()).toEqual({ found: true, value: 1, updated_at: null })
  })

  it("responde 500 cuando la lectura falla", async () => {
    serviceWith("panel_entries", { data: null, error: { message: "boom" } })
    const res = await GET(guestReq("https://resurte.me/api/panel/entries?tool=ventas-entries"))
    expect(res.status).toBe(500)
  })
})

describe("/api/panel/entries PUT — escritura atómica y conflicto", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(rateLimited).mockResolvedValue({ allowed: true } as never)
    asGuestSession()
  })

  it("guarda vía el RPC con el dueño, tool, colección y payload", async () => {
    const { rpc } = serviceWithRpc({
      data: [{ applied: true, value: { value: [{ id: "w-1" }] }, updated_at: NEXT }],
      error: null,
    })
    const res = await PUT(
      guestReq("https://resurte.me/api/panel/entries", {
        method: "PUT",
        body: JSON.stringify({
          tool: "mermas-entries",
          collection_slug: "taqueria",
          value: [{ id: "w-1" }],
        }),
      }),
    )
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ saved: true, updated_at: NEXT })
    expect(rpc).toHaveBeenCalledWith("panel_entry_put", {
      p_user_id: null,
      p_guest_token: GUEST_TOKEN,
      p_tool: "mermas-entries",
      p_collection: "taqueria",
      p_payload: { value: [{ id: "w-1" }] },
      p_base_updated_at: null,
    })
  })

  it("no usa delete+insert: dos viajes permitían perder una fila en carrera", async () => {
    const { from } = serviceWithRpc({ data: [{ applied: true, updated_at: NEXT }], error: null })
    await PUT(
      guestReq("https://resurte.me/api/panel/entries", {
        method: "PUT",
        body: JSON.stringify({ tool: "ventas-meta-dia", value: 5000 }),
      }),
    )
    expect(from).not.toHaveBeenCalled()
  })

  it("manda la base cuando el cliente la conoce", async () => {
    const { rpc } = serviceWithRpc({ data: [{ applied: true, updated_at: NEXT }], error: null })
    await PUT(
      guestReq("https://resurte.me/api/panel/entries", {
        method: "PUT",
        body: JSON.stringify({ tool: "ventas-meta-dia", value: 5000, base_updated_at: BASE }),
      }),
    )
    expect(rpc).toHaveBeenCalledWith(
      "panel_entry_put",
      expect.objectContaining({ p_base_updated_at: BASE }),
    )
  })

  it("una base vacía se trata como 'sin base', no como error", async () => {
    const { rpc } = serviceWithRpc({ data: [{ applied: true, updated_at: NEXT }], error: null })
    const res = await PUT(
      guestReq("https://resurte.me/api/panel/entries", {
        method: "PUT",
        body: JSON.stringify({ tool: "ventas-meta-dia", value: 5000, base_updated_at: "" }),
      }),
    )
    expect(res.status).toBe(200)
    expect(rpc).toHaveBeenCalledWith(
      "panel_entry_put",
      expect.objectContaining({ p_base_updated_at: null }),
    )
  })

  it("responde 409 con el valor vigente cuando la base es obsoleta", async () => {
    serviceWithRpc({
      data: [{ applied: false, value: { value: [{ id: "a" }, { id: "c" }] }, updated_at: NEXT }],
      error: null,
    })
    const res = await PUT(
      guestReq("https://resurte.me/api/panel/entries", {
        method: "PUT",
        body: JSON.stringify({
          tool: "inventario-items",
          value: [{ id: "a" }, { id: "b" }],
          base_updated_at: BASE,
        }),
      }),
    )
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({
      conflict: true,
      value: [{ id: "a" }, { id: "c" }],
      updated_at: NEXT,
    })
  })

  it("el 409 trae la versión nueva para que el reintento no vuelva a chocar", async () => {
    serviceWithRpc({
      data: [{ applied: false, value: { value: 1 }, updated_at: NEXT }],
      error: null,
    })
    const res = await PUT(
      guestReq("https://resurte.me/api/panel/entries", {
        method: "PUT",
        body: JSON.stringify({ tool: "ventas-meta-dia", value: 2, base_updated_at: BASE }),
      }),
    )
    const body = (await res.json()) as { updated_at: string }
    expect(body.updated_at).toBe(NEXT)
    expect(body.updated_at).not.toBe(BASE)
  })

  it("409 con value null cuando la fila desapareció en la carrera", async () => {
    serviceWithRpc({ data: [{ applied: false, value: null, updated_at: null }], error: null })
    const res = await PUT(
      guestReq("https://resurte.me/api/panel/entries", {
        method: "PUT",
        body: JSON.stringify({ tool: "ventas-meta-dia", value: 2, base_updated_at: BASE }),
      }),
    )
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ conflict: true, value: null, updated_at: null })
  })

  it("un payload del servidor sin la clave 'value' no filtra el envoltorio interno", async () => {
    serviceWithRpc({
      data: [{ applied: false, value: { otro: "interno" }, updated_at: NEXT }],
      error: null,
    })
    const res = await PUT(
      guestReq("https://resurte.me/api/panel/entries", {
        method: "PUT",
        body: JSON.stringify({ tool: "ventas-meta-dia", value: 2, base_updated_at: BASE }),
      }),
    )
    const body = (await res.json()) as { value: unknown }
    expect(body.value).toBeNull()
  })

  it("responde 500 cuando el RPC falla, sin afirmar que guardó", async () => {
    serviceWithRpc({ data: null, error: { message: "boom" } })
    const res = await PUT(
      guestReq("https://resurte.me/api/panel/entries", {
        method: "PUT",
        body: JSON.stringify({ tool: "ventas-meta-dia", value: 2 }),
      }),
    )
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: "Error al guardar los datos" })
  })

  it("responde 500 cuando el RPC devuelve una respuesta vacía", async () => {
    serviceWithRpc({ data: [], error: null })
    const res = await PUT(
      guestReq("https://resurte.me/api/panel/entries", {
        method: "PUT",
        body: JSON.stringify({ tool: "ventas-meta-dia", value: 2 }),
      }),
    )
    expect(res.status).toBe(500)
  })

  it("usa user_id y guest_token null cuando hay sesión", async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }) },
    } as never)
    const { rpc } = serviceWithRpc({ data: [{ applied: true, updated_at: NEXT }], error: null })

    const res = await PUT(
      guestReq("https://resurte.me/api/panel/entries", {
        method: "PUT",
        body: JSON.stringify({ tool: "ventas-meta-dia", value: 5000 }),
      }),
    )
    expect(res.status).toBe(200)
    expect(rpc).toHaveBeenCalledWith(
      "panel_entry_put",
      expect.objectContaining({ p_user_id: "user-1", p_guest_token: null }),
    )
  })
})
