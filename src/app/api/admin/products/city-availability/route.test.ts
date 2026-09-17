import { beforeEach, describe, expect, it, vi, type Mock } from "vitest"
import { NextRequest, NextResponse } from "next/server"

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }))
vi.mock("@/lib/admin-auth", () => ({ requireAdmin: vi.fn() }))
vi.mock("@/lib/catalog-cache", () => ({ revalidateCatalogCache: vi.fn() }))
vi.mock("@/lib/catalog", () => ({ resetCatalogCache: vi.fn() }))
vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }))
vi.mock("@/lib/audit-log", () => ({ logAdminAction: vi.fn() }))
vi.mock("@/lib/whatsapp-sync-queue", () => ({ enqueueProductsForWaSync: vi.fn() }))

import { GET, PATCH } from "./route"
import { createServiceClient } from "@/lib/supabase/service"
import { requireAdmin } from "@/lib/admin-auth"
import { logAdminAction } from "@/lib/audit-log"

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

/**
 * Cliente falso para el PATCH: cubre `upsert`, `delete().in()` y
 * `select().eq()` (ciudades activas). Los espías permiten afirmar qué filas se
 * escribieron, que es donde vive la semántica "sin filas = global".
 */
function mockWriteClient(
  opts: { cities?: Array<{ id: number }>; error?: { message: string } | null } = {}
) {
  const { cities = [{ id: 2 }, { id: 3 }], error = null } = opts
  const upsert = vi.fn().mockResolvedValue({ error })
  const del = vi.fn()
  const eq = vi.fn().mockResolvedValue({ data: cities, error: null })
  const chain = {
    upsert,
    delete: del.mockReturnValue({ in: vi.fn().mockResolvedValue({ error }) }),
    select: vi.fn().mockReturnValue({ eq }),
  }
  vi.mocked(createServiceClient).mockResolvedValue({ from: vi.fn(() => chain) } as never)
  return { upsert, delete: del, eq }
}

function patchRequest(body: unknown) {
  return new NextRequest("http://localhost/api/admin/products/city-availability", {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  })
}

describe("PATCH /api/admin/products/city-availability", () => {
  it("registra en la bitácora el cambio de una celda", async () => {
    const { upsert } = mockWriteClient()

    const res = await PATCH(patchRequest({ productIds: [1, 2], cityId: 3, isAvailable: false }))

    expect(res.status).toBe(200)
    expect(upsert).toHaveBeenCalledTimes(1)
    const entry = vi.mocked(logAdminAction).mock.calls[0]![1]
    expect(entry).toMatchObject({
      action: "product_city_availability",
      entity: "product_city_availability",
      actorId: "admin-1",
    })
    expect(entry.detail).toEqual({
      ids: [1, 2],
      count: 2,
      mode: "cell",
      cityId: 3,
      isAvailable: false,
    })
  })

  it("registra el modo changes con las celdas aplicadas", async () => {
    mockWriteClient()

    await PATCH(
      patchRequest({
        productId: 7,
        changes: [
          { cityId: 2, isAvailable: true },
          { cityId: 3, isAvailable: false },
        ],
      })
    )

    const entry = vi.mocked(logAdminAction).mock.calls[0]![1]
    expect(entry.detail).toEqual({
      ids: [7],
      count: 1,
      mode: "changes",
      cells: [
        { cityId: 2, isAvailable: true },
        { cityId: 3, isAvailable: false },
      ],
    })
  })

  it("registra scope all: borra filas al reactivar el global y las crea al apagarlo", async () => {
    const on = mockWriteClient()
    await PATCH(patchRequest({ productId: 5, scope: "all", isAvailable: true }))
    expect(on.delete).toHaveBeenCalledTimes(1)
    expect(on.upsert).not.toHaveBeenCalled()
    expect(vi.mocked(logAdminAction).mock.calls[0]![1].detail).toMatchObject({
      mode: "all",
      isAvailable: true,
    })

    vi.clearAllMocks()
    const off = mockWriteClient()
    await PATCH(patchRequest({ productId: 5, scope: "all", isAvailable: false }))
    expect(off.upsert).toHaveBeenCalledWith(
      [
        { product_id: 5, city_id: 2, is_available: false, updated_at: expect.any(String) },
        { product_id: 5, city_id: 3, is_available: false, updated_at: expect.any(String) },
      ],
      { onConflict: "product_id,city_id" }
    )
    expect(vi.mocked(logAdminAction).mock.calls[0]![1].detail).toMatchObject({
      mode: "all",
      isAvailable: false,
      cities: 2,
    })
  })

  it("restore vuelve a global y reescribe exactamente las celdas capturadas", async () => {
    const { upsert, delete: del } = mockWriteClient()

    await PATCH(
      patchRequest({
        productIds: [1, 2],
        restore: [
          { productId: 1, cityId: 3, isAvailable: false },
          { productId: 1, cityId: 2, isAvailable: true },
          { productId: 9, cityId: 2, isAvailable: true },
          { productId: 2, cityId: 2, isAvailable: "sí" },
        ],
      })
    )

    // 1) se borran las filas de los ids seleccionados (vuelven a "global")
    expect(del).toHaveBeenCalledTimes(1)
    // 2) se reescriben solo las celdas válidas y de esos ids (se descarta el 9
    //    y el isAvailable no booleano)
    expect(upsert).toHaveBeenCalledTimes(1)
    expect(upsert).toHaveBeenCalledWith(
      [
        { product_id: 1, city_id: 3, is_available: false, updated_at: expect.any(String) },
        { product_id: 1, city_id: 2, is_available: true, updated_at: expect.any(String) },
      ],
      { onConflict: "product_id,city_id" }
    )
    expect(vi.mocked(logAdminAction).mock.calls[0]![1].detail).toEqual({
      ids: [1, 2],
      count: 2,
      mode: "restore",
      cells: 2,
    })
  })

  it("restore sin celdas solo devuelve a global (productos que no tenían filas)", async () => {
    const { upsert, delete: del } = mockWriteClient()

    await PATCH(patchRequest({ productIds: [4, 5], restore: [] }))

    expect(del).toHaveBeenCalledTimes(1)
    expect(upsert).not.toHaveBeenCalled()
    expect(vi.mocked(logAdminAction).mock.calls[0]![1].detail).toMatchObject({
      mode: "restore",
      cells: 0,
    })
  })

  it("no escribe ni registra si la validación falla", async () => {
    const { upsert } = mockWriteClient()

    const res = await PATCH(patchRequest({ productIds: [1], cityId: 3 }))

    expect(res.status).toBe(400)
    expect(upsert).not.toHaveBeenCalled()
    expect(logAdminAction).not.toHaveBeenCalled()
  })
})
