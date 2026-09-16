import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))

import { POST } from "./route"
import { createClient } from "@/lib/supabase/server"

interface TableResult {
  data?: unknown
  error?: unknown
}

/**
 * Builder PostgREST chainable y "awaitable" para user_carts: la lectura
 * (select/eq/maybeSingle) resuelve `read`; tras `upsert` la cadena resuelve
 * `write`, para poder fallar la escritura sin fallar la lectura.
 */
function tableBuilder({ read, write }: { read?: TableResult; write?: TableResult } = {}) {
  const builder: Record<string, unknown> = {}
  const readResult = read ?? { data: null, error: null }
  const writeResult = write ?? { data: null, error: null }
  let mode: "read" | "write" = "read"
  builder.select = vi.fn(() => builder)
  builder.eq = vi.fn(() => builder)
  builder.upsert = vi.fn(() => {
    mode = "write"
    return builder
  })
  builder.maybeSingle = vi.fn(async () => readResult)
  builder.single = vi.fn(async () => (mode === "write" ? writeResult : readResult))
  builder.then = (resolve: (v: unknown) => void) =>
    resolve(mode === "write" ? writeResult : readResult)
  return builder as Record<string, ReturnType<typeof vi.fn>> & {
    upsert: ReturnType<typeof vi.fn>
  }
}

function mockSession(user: { id: string } | null, builder = tableBuilder()) {
  const from = vi.fn(() => builder)
  vi.mocked(createClient).mockResolvedValue({
    auth: { getUser: vi.fn(async () => ({ data: { user } })) },
    from,
  } as never)
  return { from, builder }
}

function postReq(body: unknown) {
  return new NextRequest("http://localhost/api/cart/bumps/hydrate", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "content-type": "application/json" },
  })
}

const USER = { id: "user-1" }

const BUMP = { ruleId: 12, productId: 99, quantity: 1, unitPrice: 30, name: "Totopos" }
const OTHER_BUMP = { ruleId: 7, productId: 55, quantity: 2, unitPrice: 12, name: "Salsa" }

const LOCAL_TS = Date.parse("2026-09-12T20:00:00Z")
const OLDER = new Date(LOCAL_TS - 60_000).toISOString()
const NEWER = new Date(LOCAL_TS + 60_000).toISOString()

describe("POST /api/cart/bumps/hydrate", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("401 sin sesión (no toca la BD)", async () => {
    const { from } = mockSession(null)

    const res = await POST(postReq({ bumps: [BUMP], updatedAt: LOCAL_TS }))

    expect(res.status).toBe(401)
    expect(from).not.toHaveBeenCalled()
  })

  it("400 cuando el snapshot local es inválido", async () => {
    const { builder } = mockSession(USER)

    const res = await POST(postReq({ bumps: [{ ruleId: 12 }], updatedAt: LOCAL_TS }))

    expect(res.status).toBe(400)
    expect(builder.upsert).not.toHaveBeenCalled()
  })

  it("source 'none' cuando ambos lados están vacíos", async () => {
    mockSession(USER, tableBuilder({ read: { data: null, error: null } }))

    const res = await POST(postReq({ bumps: [], updatedAt: null }))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ bumps: [], updated_at: null, source: "none" })
    expect(res.headers.get("cache-control")).toBe("no-store")
  })

  it("source 'server' cuando el servidor es más reciente (adopta sus bumps)", async () => {
    const { builder } = mockSession(
      USER,
      tableBuilder({
        read: { data: { bumps: [OTHER_BUMP], bumps_updated_at: NEWER }, error: null },
      })
    )

    const res = await POST(postReq({ bumps: [BUMP], updatedAt: LOCAL_TS }))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ bumps: [OTHER_BUMP], updated_at: NEWER, source: "server" })
    expect(res.headers.get("cache-control")).toBe("no-store")
    expect(builder.upsert).not.toHaveBeenCalled()
  })

  it("source 'server' cuando no hay snapshot local (body vacío) y el servidor tiene bumps", async () => {
    mockSession(
      USER,
      tableBuilder({
        read: { data: { bumps: [OTHER_BUMP], bumps_updated_at: NEWER }, error: null },
      })
    )

    const res = await POST(postReq({}))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.source).toBe("server")
    expect(body.bumps).toEqual([OTHER_BUMP])
  })

  it("source 'local' cuando el local es más reciente: lo sube y devuelve el timestamp nuevo", async () => {
    const { builder } = mockSession(
      USER,
      tableBuilder({
        read: { data: { bumps: [OTHER_BUMP], bumps_updated_at: OLDER }, error: null },
      })
    )

    const res = await POST(postReq({ bumps: [BUMP], updatedAt: LOCAL_TS }))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.source).toBe("local")
    expect(body.bumps).toEqual([BUMP])
    expect(body.updated_at).toEqual(expect.any(String))
    expect(builder.upsert).toHaveBeenCalledWith(
      { user_id: "user-1", bumps: [BUMP], bumps_updated_at: expect.any(String) },
      { onConflict: "user_id" }
    )
  })

  it("source 'local' cuando no existe fila previa", async () => {
    const { builder } = mockSession(USER, tableBuilder({ read: { data: null, error: null } }))

    const res = await POST(postReq({ bumps: [BUMP], updatedAt: LOCAL_TS }))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.source).toBe("local")
    expect(body.bumps).toEqual([BUMP])
    expect(builder.upsert).toHaveBeenCalled()
  })

  it("una limpieza local ([]) con timestamp reciente se sube en vez de resucitar el servidor", async () => {
    const { builder } = mockSession(
      USER,
      tableBuilder({
        read: { data: { bumps: [OTHER_BUMP], bumps_updated_at: OLDER }, error: null },
      })
    )

    const res = await POST(postReq({ bumps: [], updatedAt: LOCAL_TS }))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({
      bumps: [],
      updated_at: expect.any(String),
      source: "local",
    })
    expect(builder.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ bumps: [] }),
      { onConflict: "user_id" }
    )
  })

  it("snapshot legacy sin timestamp y con contenido gana al servidor", async () => {
    mockSession(
      USER,
      tableBuilder({
        read: { data: { bumps: [OTHER_BUMP], bumps_updated_at: NEWER }, error: null },
      })
    )

    const res = await POST(postReq({ bumps: [BUMP], updatedAt: "ayer" }))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.source).toBe("local")
    expect(body.bumps).toEqual([BUMP])
  })

  it("200 con source 'local' y updated_at null si el upsert falla (no bloquea el checkout)", async () => {
    mockSession(
      USER,
      tableBuilder({
        read: { data: { bumps: [OTHER_BUMP], bumps_updated_at: OLDER }, error: null },
        write: { data: null, error: { message: "boom" } },
      })
    )

    const res = await POST(postReq({ bumps: [BUMP], updatedAt: LOCAL_TS }))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ bumps: [BUMP], updated_at: null, source: "local" })
  })

  it("500 si la lectura falla", async () => {
    mockSession(USER, tableBuilder({ read: { data: null, error: { message: "boom" } } }))

    const res = await POST(postReq({ bumps: [BUMP], updatedAt: LOCAL_TS }))

    expect(res.status).toBe(500)
  })

  it("bumps corruptos en la BD no se propagan (se tratan como selección vacía)", async () => {
    const { builder } = mockSession(
      USER,
      tableBuilder({
        read: { data: { bumps: "no-array", bumps_updated_at: NEWER }, error: null },
      })
    )

    const res = await POST(postReq({}))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ bumps: [], updated_at: NEWER, source: "none" })
    expect(builder.upsert).not.toHaveBeenCalled()
  })
})
