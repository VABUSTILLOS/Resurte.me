import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { MAX_STORED_BUMPS } from "@/lib/checkout-config"

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))

import { PUT } from "./route"
import { createClient } from "@/lib/supabase/server"

interface TableResult {
  data?: unknown
  error?: unknown
}

/**
 * Builder PostgREST chainable y "awaitable" para user_carts: la lectura
 * (select/eq) resuelve `read`; tras `upsert` la cadena resuelve `write`.
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
    single: ReturnType<typeof vi.fn>
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

function putReq(body: unknown) {
  return new NextRequest("http://localhost/api/cart/bumps/selection", {
    method: "PUT",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "content-type": "application/json" },
  })
}

const USER = { id: "user-1" }

const BUMP = { ruleId: 12, productId: 99, quantity: 1, unitPrice: 30, name: "Totopos" }

describe("PUT /api/cart/bumps/selection", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("401 sin sesión (no toca la BD)", async () => {
    const { from } = mockSession(null)

    const res = await PUT(putReq({ bumps: [BUMP] }))

    expect(res.status).toBe(401)
    expect(from).not.toHaveBeenCalled()
  })

  it.each([
    ["bumps ausente", {}],
    ["bumps no es arreglo", { bumps: "no-array" }],
    ["entrada inválida", { bumps: [{ ruleId: 12 }] }],
    ["quantity negativa", { bumps: [{ ...BUMP, quantity: -1 }] }],
    ["ruleId inválido", { bumps: [{ ...BUMP, ruleId: 0 }] }],
    ["JSON malformado", "{no-json"],
  ])("400 con %s", async (_label, body) => {
    const { builder } = mockSession(USER)

    const res = await PUT(putReq(body))

    expect(res.status).toBe(400)
    expect(builder.upsert).not.toHaveBeenCalled()
  })

  it(`400 con más de ${MAX_STORED_BUMPS} ofertas`, async () => {
    mockSession(USER)
    const bumps = Array.from({ length: MAX_STORED_BUMPS + 1 }, (_, i) => ({
      ...BUMP,
      ruleId: i + 1,
      productId: i + 1,
    }))

    const res = await PUT(putReq({ bumps }))

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain(String(MAX_STORED_BUMPS))
  })

  it("200 feliz: upsert replace-all con bumps_updated_at propio del servidor", async () => {
    const { builder } = mockSession(
      USER,
      tableBuilder({ write: { data: { bumps_updated_at: "2026-09-12T20:30:00Z" }, error: null } })
    )

    const res = await PUT(putReq({ bumps: [BUMP] }))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ ok: true, updated_at: "2026-09-12T20:30:00Z" })
    // El timestamp de los bumps es independiente del `updated_at` del carrito:
    // si lo moviera, el merge last-write-wins del carrito pisaría cambios locales.
    expect(builder.upsert).toHaveBeenCalledWith(
      { user_id: "user-1", bumps: [BUMP], bumps_updated_at: expect.any(String) },
      { onConflict: "user_id" }
    )
    const payload = builder.upsert.mock.calls[0]![0] as Record<string, unknown>
    expect(payload).not.toHaveProperty("updated_at")
    expect(payload).not.toHaveProperty("items")
  })

  it("200 con [] (el usuario quitó todas las ofertas): limpia la selección", async () => {
    const { builder } = mockSession(
      USER,
      tableBuilder({ write: { data: { bumps_updated_at: "2026-09-12T21:00:00Z" }, error: null } })
    )

    const res = await PUT(putReq({ bumps: [] }))

    expect(res.status).toBe(200)
    expect(builder.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ bumps: [] }),
      { onConflict: "user_id" }
    )
  })

  it("500 ante error del upsert", async () => {
    mockSession(USER, tableBuilder({ write: { data: null, error: { message: "boom" } } }))

    const res = await PUT(putReq({ bumps: [BUMP] }))

    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toContain("artículos especiales")
  })

  it("500 si la sesión no se puede resolver (throw inesperado)", async () => {
    vi.mocked(createClient).mockRejectedValueOnce(new Error("sin cliente"))

    const res = await PUT(putReq({ bumps: [BUMP] }))

    expect(res.status).toBe(500)
  })
})
