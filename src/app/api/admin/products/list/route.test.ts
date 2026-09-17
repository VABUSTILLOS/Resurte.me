import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }))
vi.mock("@/lib/admin-auth", () => ({ requireAdmin: vi.fn() }))

import { GET } from "./route"
import { createServiceClient } from "@/lib/supabase/service"
import { requireAdmin } from "@/lib/admin-auth"

const ROWS = [
  { id: 1, name: "Aceite", brand: "Marca", tags: ["oferta"] },
  { id: 2, name: "Arroz", brand: null, tags: null },
]

/**
 * Builder falso que imita al de PostgREST: encadena devolviendo el mismo
 * objeto y, como es "thenable", al `await`-lo resuelve al resultado ya
 * ejecutado (`{ data, error, count }`) en vez de al propio builder.
 */
function fakeBuilder() {
  const order = vi.fn(() => builder)
  const range = vi.fn(() => builder)
  const builder: Record<string, unknown> = {
    select: vi.fn(() => builder),
    is: vi.fn(() => builder),
    not: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    in: vi.fn(() => builder),
    ilike: vi.fn(() => builder),
    or: vi.fn(() => builder),
    contains: vi.fn(() => builder),
    lt: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    order,
    range,
    then: (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
      Promise.resolve({ data: ROWS, error: null, count: ROWS.length }).then(onFulfilled, onRejected),
  }
  return { builder, order, range }
}

function mockClient() {
  const { builder, order, range } = fakeBuilder()
  vi.mocked(createServiceClient).mockResolvedValue({ from: vi.fn(() => builder) } as never)
  return { order, range }
}

function listRequest(query = "page=1&pageSize=2") {
  return new NextRequest(`http://localhost/api/admin/products/list?${query}`)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(requireAdmin).mockResolvedValue({ user: { id: "admin-1" }, response: null } as never)
})

describe("GET /api/admin/products/list", () => {
  it("ordena y pagina sobre el builder sin perder el encadenado", async () => {
    const { order, range } = mockClient()

    const res = await GET(listRequest())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.error).toBeUndefined()
    expect(body.rows).toHaveLength(2)
    // El orden se aplica al builder (no a un resultado ya ejecutado).
    expect(order).toHaveBeenCalledWith("name", { ascending: true, nullsFirst: false })
    expect(range).toHaveBeenCalledWith(0, 1)
  })

  it("aplica el orden por severidad de stock con dos llamadas encadenadas", async () => {
    const { order } = mockClient()

    const res = await GET(listRequest("sort=stock&dir=desc&page=1&pageSize=2"))

    expect(res.status).toBe(200)
    expect(order).toHaveBeenNthCalledWith(1, "stock_status", { ascending: false })
    expect(order).toHaveBeenNthCalledWith(2, "name", { ascending: true })
  })

  it("devuelve solo ids en modo idsOnly", async () => {
    mockClient()

    const res = await GET(listRequest("idsOnly=1&page=1&pageSize=2"))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.ids).toEqual([1, 2])
    expect(body.total).toBe(2)
  })
})
