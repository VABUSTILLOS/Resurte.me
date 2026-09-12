import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))

import { GET, PUT } from "./route"
import { createClient } from "@/lib/supabase/server"

interface TableResult {
  data?: unknown
  error?: unknown
}

/**
 * Builder PostgREST chainable y "awaitable" para user_carts: select/eq/upsert
 * devuelven el builder; maybeSingle/single y el await directo resuelven `result`.
 */
function cartsBuilder(result: TableResult = { data: null, error: null }) {
  const builder: Record<string, unknown> = {}
  for (const method of ["select", "eq", "upsert"]) {
    builder[method] = vi.fn().mockReturnValue(builder)
  }
  builder.maybeSingle = vi.fn().mockResolvedValue(result)
  builder.single = vi.fn().mockResolvedValue(result)
  builder.then = (resolve: (v: unknown) => void) => resolve(result)
  return builder as Record<string, ReturnType<typeof vi.fn>> & {
    single: ReturnType<typeof vi.fn>
    maybeSingle: ReturnType<typeof vi.fn>
    upsert: ReturnType<typeof vi.fn>
  }
}

/** Simula el client de sesión: usuario autenticado (o null) + builder de user_carts. */
function mockSession(user: { id: string } | null, builder = cartsBuilder()) {
  const from = vi.fn(() => builder)
  vi.mocked(createClient).mockResolvedValue({
    auth: { getUser: vi.fn(async () => ({ data: { user } })) },
    from,
  } as never)
  return { from, builder }
}

function putReq(body: unknown) {
  return new NextRequest("http://localhost/api/cart", {
    method: "PUT",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  })
}

const USER = { id: "user-1" }

describe("GET /api/cart", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("401 sin sesión", async () => {
    const { from } = mockSession(null)

    const res = await GET()

    expect(res.status).toBe(401)
    expect(from).not.toHaveBeenCalled()
  })

  it("200 devuelve items, coupon y updated_at con Cache-Control: no-store", async () => {
    mockSession(USER, cartsBuilder({
      data: {
        items: [{ product_id: 1, quantity: 2, name: "Aguacate" }],
        coupon: { code: "DIEZ" },
        updated_at: "2026-09-12T20:00:00Z",
      },
      error: null,
    }))

    const res = await GET()

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.items).toHaveLength(1)
    expect(body.coupon).toEqual({ code: "DIEZ" })
    expect(body.updated_at).toBe("2026-09-12T20:00:00Z")
    expect(res.headers.get("cache-control")).toBe("no-store")
  })

  it("200 sin fila previa devuelve carrito vacío", async () => {
    mockSession(USER, cartsBuilder({ data: null, error: null }))

    const res = await GET()

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ items: [], coupon: null, updated_at: null })
    expect(res.headers.get("cache-control")).toBe("no-store")
  })

  it("500 ante error de la consulta", async () => {
    mockSession(USER, cartsBuilder({ data: null, error: { message: "boom" } }))

    const res = await GET()

    expect(res.status).toBe(500)
  })
})

describe("PUT /api/cart", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("401 sin sesión", async () => {
    const { from } = mockSession(null)

    const res = await PUT(putReq({ items: [] }))

    expect(res.status).toBe(401)
    expect(from).not.toHaveBeenCalled()
  })

  it("400 cuando items no es un arreglo", async () => {
    mockSession(USER)

    const res = await PUT(putReq({ items: "no-array" }))

    expect(res.status).toBe(400)
  })

  it.each([
    ["quantity 0", 0],
    ["quantity negativa", -2],
    ["quantity no entera", 1.5],
    ["quantity mayor a 999", 1000],
  ])("400 con item inválido: %s", async (_label, quantity) => {
    mockSession(USER)

    const res = await PUT(putReq({ items: [{ product_id: 1, quantity }] }))

    expect(res.status).toBe(400)
  })

  it("400 con más de 200 items", async () => {
    mockSession(USER)
    const items = Array.from({ length: 201 }, () => ({ product_id: 1, quantity: 1 }))

    const res = await PUT(putReq({ items }))

    expect(res.status).toBe(400)
  })

  it("400 con cupón sin `code` string", async () => {
    mockSession(USER)

    const res = await PUT(putReq({ items: [], coupon: { discount: 10 } }))

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain("coupon")
  })

  it("400 con cupón cuyo code excede 64 caracteres", async () => {
    mockSession(USER)

    const res = await PUT(putReq({ items: [], coupon: { code: "X".repeat(65) } }))

    expect(res.status).toBe(400)
  })

  it("200 feliz: upsert replace-all con el user_id del usuario autenticado", async () => {
    const builder = cartsBuilder({ data: { updated_at: "2026-09-12T20:30:00Z" }, error: null })
    mockSession(USER, builder)
    const items = [
      { product_id: 1, quantity: 2, name: "Aguacate" },
      { product_id: 2, quantity: 1, name: "Limón" },
    ]
    const coupon = { code: "DIEZ", discount_type: "percentage", discount_value: 10 }

    const res = await PUT(putReq({ items, coupon }))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.updated_at).toBe("2026-09-12T20:30:00Z")
    // Replace-all con onConflict por usuario; updated_at lo pone el servidor
    expect(builder.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "user-1",
        items,
        coupon,
        updated_at: expect.any(String),
      }),
      { onConflict: "user_id" }
    )
  })

  it("500 ante error del upsert", async () => {
    mockSession(USER, cartsBuilder({ data: null, error: { message: "boom" } }))

    const res = await PUT(putReq({ items: [{ product_id: 1, quantity: 1 }] }))

    expect(res.status).toBe(500)
  })
})
