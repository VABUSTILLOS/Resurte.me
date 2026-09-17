import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }))
vi.mock("@/lib/admin-auth", () => ({ requireAdmin: vi.fn() }))
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

import { POST } from "./route"
import { createServiceClient } from "@/lib/supabase/service"
import { requireAdmin } from "@/lib/admin-auth"
import { logger } from "@/lib/logger"
import { MAX_PROBE_IDS } from "@/lib/product-images"

interface FakeResult {
  data?: unknown
  error?: unknown
}

function asAdmin() {
  vi.mocked(requireAdmin).mockResolvedValue({ user: { id: "admin-1" }, response: null } as never)
}

/** Cliente Supabase falso: un único builder "thenable" con su propio resultado. */
function serviceWith(result: FakeResult) {
  const selects: { table: string; columns: string }[] = []
  const filters: { op: string; args: unknown[] }[] = []

  const builder: Record<string, unknown> = {}
  builder.select = vi.fn((columns?: string) => {
    selects.push({ table: "products", columns: columns ?? "" })
    return builder
  })
  for (const op of ["eq", "neq", "in", "is", "not", "order", "limit", "range", "gte", "lte"]) {
    builder[op] = vi.fn((...args: unknown[]) => {
      filters.push({ op, args })
      return builder
    })
  }
  builder.then = (
    onFulfilled: (value: FakeResult) => unknown,
    onRejected?: (reason: unknown) => unknown
  ) => Promise.resolve(result).then(onFulfilled, onRejected)

  const from = vi.fn(() => builder)
  vi.mocked(createServiceClient).mockResolvedValue({ from } as never)
  return { from, selects, filters }
}

/** Sustituye `fetch` global por un stub que responde según URL y método. */
function stubFetch(handler: (url: string, method: string) => number) {
  const calls: { url: string; method: string }[] = []
  vi.stubGlobal(
    "fetch",
    vi.fn((input: string, init?: RequestInit) => {
      const method = init?.method ?? "GET"
      calls.push({ url: input, method })
      return Promise.resolve(new Response(null, { status: handler(input, method) }))
    })
  )
  return calls
}

function stubFailingFetch() {
  const calls: { url: string; method: string }[] = []
  vi.stubGlobal(
    "fetch",
    vi.fn((input: string, init?: RequestInit) => {
      calls.push({ url: input, method: init?.method ?? "GET" })
      return Promise.reject(new Error("network down"))
    })
  )
  return calls
}

function checkRequest(body: unknown) {
  return new NextRequest("http://localhost/api/admin/products/check-images", {
    method: "POST",
    body: JSON.stringify(body),
  })
}

describe("/api/admin/products/check-images", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("devuelve 403 y no toca Supabase si el admin es rechazado", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({
      user: null,
      response: new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }),
    } as never)

    const response = await POST(checkRequest({ ids: [1] }))

    expect(response.status).toBe(403)
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it("devuelve 400 cuando se supera MAX_PROBE_IDS", async () => {
    asAdmin()

    const ids = Array.from({ length: MAX_PROBE_IDS + 1 }, (_, i) => i + 1)
    const response = await POST(checkRequest({ ids }))
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.error).toBe(`Máximo ${MAX_PROBE_IDS} productos por revisión`)
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it("reporta ok, roto y omitido por producto al revisar ids concretos", async () => {
    asAdmin()
    const supabase = serviceWith({
      data: [
        { id: 1, name: "Viva", image_url: "https://cdn.test/a.jpg" },
        { id: 2, name: "Rota", image_url: "https://cdn.test/b.jpg" },
        { id: 3, name: "Local", image_url: "/imagenes/c.jpg" },
      ],
      error: null,
    })
    const calls = stubFetch((url) => (url.includes("b.jpg") ? 404 : 200))

    const response = await POST(checkRequest({ ids: [1, 2, 3] }))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json).toEqual({
      checked: 2,
      ok: 1,
      skipped: 1,
      broken: [
        {
          id: 2,
          name: "Rota",
          image_url: "https://cdn.test/b.jpg",
          status: 404,
          reason: "404: la imagen ya no existe",
        },
      ],
      hasMore: false,
    })
    expect(supabase.selects).toEqual([{ table: "products", columns: "id,name,image_url" }])
    expect(supabase.filters).toEqual([
      { op: "is", args: ["deleted_at", null] },
      { op: "order", args: ["id", { ascending: true }] },
      { op: "in", args: ["id", [1, 2, 3]] },
    ])
    // Solo se sondean las URLs absolutas http(s).
    expect(calls.map((c) => c.url)).toEqual([
      "https://cdn.test/a.jpg",
      "https://cdn.test/b.jpg",
    ])
  })

  it("reintenta con GET cuando el servidor rechaza el HEAD", async () => {
    asAdmin()
    serviceWith({ data: [{ id: 1, name: "CDN", image_url: "https://cdn.test/c.jpg" }], error: null })
    const calls = stubFetch((_url, method) => (method === "HEAD" ? 405 : 200))

    const response = await POST(checkRequest({ ids: [1] }))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.ok).toBe(1)
    expect(json.broken).toEqual([])
    expect(calls).toEqual([
      { url: "https://cdn.test/c.jpg", method: "HEAD" },
      { url: "https://cdn.test/c.jpg", method: "GET" },
    ])
  })

  it("marca la imagen como rota cuando la red falla", async () => {
    asAdmin()
    serviceWith({ data: [{ id: 1, name: "Caída", image_url: "https://cdn.test/x.jpg" }], error: null })
    stubFailingFetch()

    const response = await POST(checkRequest({ ids: [1] }))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.broken).toEqual([
      {
        id: 1,
        name: "Caída",
        image_url: "https://cdn.test/x.jpg",
        status: null,
        reason: "sin respuesta (timeout o error de red)",
      },
    ])
  })

  it("pagina con limit/offset y señala hasMore cuando la página viene llena", async () => {
    asAdmin()
    const supabase = serviceWith({
      data: [
        { id: 1, name: "A", image_url: "https://cdn.test/a.jpg" },
        { id: 2, name: "B", image_url: "https://cdn.test/b.jpg" },
      ],
      error: null,
    })
    stubFetch(() => 200)

    const response = await POST(checkRequest({ limit: 2, offset: -5 }))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.hasMore).toBe(true)
    // limit se acota al rango 1..MAX_PROBE_IDS y un offset negativo cae a 0.
    expect(supabase.filters).toEqual([
      { op: "is", args: ["deleted_at", null] },
      { op: "order", args: ["id", { ascending: true }] },
      { op: "not", args: ["image_url", "is", null] },
      { op: "range", args: [0, 1] },
    ])
    expect(MAX_PROBE_IDS).toBeGreaterThan(2)
  })

  it("devuelve 500 y registra el error cuando falla la consulta", async () => {
    asAdmin()
    serviceWith({ data: null, error: { message: "relation does not exist" } })

    const response = await POST(checkRequest({ ids: [1] }))
    const json = await response.json()

    expect(response.status).toBe(500)
    expect(json.error).toBe("relation does not exist")
    expect(logger.error).toHaveBeenCalled()
  })
})
