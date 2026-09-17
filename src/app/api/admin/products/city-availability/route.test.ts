import { beforeEach, describe, expect, it, vi, type Mock } from "vitest"
import { NextRequest, NextResponse } from "next/server"

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }))
vi.mock("@/lib/admin-auth", () => ({ requireAdmin: vi.fn() }))
vi.mock("@/lib/catalog-cache", () => ({ revalidateCatalogCache: vi.fn() }))
vi.mock("@/lib/catalog", () => ({ resetCatalogCache: vi.fn() }))

import { GET } from "./route"
import { createServiceClient } from "@/lib/supabase/service"
import { requireAdmin } from "@/lib/admin-auth"

const ROWS = [
  { product_id: 1, city_id: 2, is_available: true },
  { product_id: 1, city_id: 3, is_available: false },
]

/**
 * Cliente falso mínimo para el GET: `select().in()` es toda la consulta.
 * Devuelve los espías para afirmar qué ids se pidieron a la base.
 */
function mockClient(result: { data: unknown; error: unknown } = { data: ROWS, error: null }) {
  const select = vi.fn()
  const inSpy = vi.fn()
  const chain = { select: select.mockReturnValue({ in: inSpy.mockResolvedValue(result) }) }
  vi.mocked(createServiceClient).mockResolvedValue({
    from: vi.fn(() => chain),
  } as never)
  return { select, in: inSpy as Mock }
}

function request(ids?: string) {
  const query = ids === undefined ? "" : `?ids=${ids}`
  return new NextRequest(`http://localhost/api/admin/products/city-availability${query}`)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(requireAdmin).mockResolvedValue({ user: { id: "admin-1" }, response: null } as never)
})

describe("GET /api/admin/products/city-availability", () => {
  it("devuelve las filas de los ids pedidos, deduplicados", async () => {
    const { select, in: inSpy } = mockClient()

    const res = await GET(request("1,1,2"))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(select).toHaveBeenCalledWith("product_id,city_id,is_available")
    expect(inSpy).toHaveBeenCalledWith("product_id", [1, 2])
    expect(body.rows).toEqual(ROWS)
    expect(body.truncated).toBe(false)
  })

  it("ignora valores no numéricos y responde 400 si no queda ningún id", async () => {
    const { in: inSpy } = mockClient()

    const res = await GET(request("abc,0,-3,,"))
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toBeDefined()
    // Sin ids válidos no se toca la base.
    expect(inSpy).not.toHaveBeenCalled()
  })

  it("responde 400 si falta el parámetro ids", async () => {
    mockClient()

    const res = await GET(request())

    expect(res.status).toBe(400)
  })

  it("acota la consulta a 1000 ids y marca truncated", async () => {
    const { in: inSpy } = mockClient()
    const ids = Array.from({ length: 1200 }, (_, i) => i + 1)

    const res = await GET(request(ids.join(",")))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(inSpy).toHaveBeenCalledTimes(1)
    expect((inSpy.mock.calls[0]?.[1] as unknown[]).length).toBe(1000)
    expect(body.truncated).toBe(true)
  })

  it("propaga el error de la consulta como 500", async () => {
    mockClient({ data: null, error: { message: "boom" } })

    const res = await GET(request("1"))
    const body = await res.json()

    expect(res.status).toBe(500)
    expect(body.error).toBe("boom")
  })

  it("no consulta nada si el usuario no es admin", async () => {
    const denied = NextResponse.json({ error: "No autorizado" }, { status: 401 })
    vi.mocked(requireAdmin).mockResolvedValue({ user: null, response: denied } as never)
    const { in: inSpy } = mockClient()

    const res = await GET(request("1"))

    expect(res.status).toBe(401)
    expect(inSpy).not.toHaveBeenCalled()
  })
})
