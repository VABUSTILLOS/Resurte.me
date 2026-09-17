import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }))
vi.mock("@/lib/admin-auth", () => ({ requireAdmin: vi.fn() }))
vi.mock("@/lib/catalog-cache", () => ({ revalidateCatalogCache: vi.fn() }))
vi.mock("@/lib/catalog", () => ({ resetCatalogCache: vi.fn() }))
vi.mock("@/lib/audit-log", () => ({ logAdminAction: vi.fn() }))

import { GET, PUT } from "./route"
import { createServiceClient } from "@/lib/supabase/service"
import { requireAdmin } from "@/lib/admin-auth"
import { revalidateCatalogCache } from "@/lib/catalog-cache"
import { resetCatalogCache } from "@/lib/catalog"
import { logAdminAction } from "@/lib/audit-log"

interface FakeResult {
  data?: unknown
  error?: unknown
}

function asAdmin() {
  vi.mocked(requireAdmin).mockResolvedValue({ user: { id: "admin-1" }, response: null } as never)
}

function denyAdmin() {
  vi.mocked(requireAdmin).mockResolvedValue({
    user: null,
    response: new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }),
  } as never)
}

/**
 * Cliente Supabase falso. Cada `from(table)` entrega un builder encadenable y
 * "thenable" ligado a su propio resultado, en el orden en que el route los
 * consume (las dos lecturas del GET no comparten filas).
 */
function serviceWith(byTable: Record<string, FakeResult | FakeResult[]>) {
  const cursors = new Map<string, number>()
  const selects: { table: string; columns: string }[] = []
  const inserts: { table: string; payload: unknown }[] = []
  const deletes: { table: string; id?: unknown }[] = []
  const filters: { table: string; op: string; args: unknown[] }[] = []

  function thenable(builder: Record<string, unknown>, result: FakeResult) {
    builder.then = (
      onFulfilled: (value: FakeResult) => unknown,
      onRejected?: (reason: unknown) => unknown
    ) => Promise.resolve(result).then(onFulfilled, onRejected)
    return builder
  }

  const from = vi.fn((table: string) => {
    const configured = byTable[table] ?? { data: [], error: null }
    const list = Array.isArray(configured) ? configured : [configured]
    const cursor = cursors.get(table) ?? 0
    cursors.set(table, cursor + 1)
    const result = list[Math.min(cursor, list.length - 1)] ?? { data: [], error: null }

    const builder: Record<string, unknown> = {}
    builder.select = vi.fn((columns?: string) => {
      selects.push({ table, columns: columns ?? "" })
      return builder
    })
    for (const op of [
      "eq",
      "neq",
      "in",
      "is",
      "not",
      "like",
      "gte",
      "lte",
      "order",
      "limit",
      "range",
      "single",
      "maybeSingle",
    ]) {
      builder[op] = vi.fn((...args: unknown[]) => {
        filters.push({ table, op, args })
        return builder
      })
    }
    builder.insert = vi.fn((payload: unknown) => {
      inserts.push({ table, payload })
      return thenable({}, result)
    })
    builder.delete = vi.fn(() => {
      const entry: { table: string; id?: unknown } = { table }
      deletes.push(entry)
      const sub: Record<string, unknown> = {}
      sub.eq = vi.fn((_column: string, id: unknown) => {
        entry.id = id
        return thenable(sub, result)
      })
      return sub
    })
    return thenable(builder, result)
  })

  vi.mocked(createServiceClient).mockResolvedValue({ from } as never)
  return { from, selects, inserts, deletes, filters }
}

function getRequest(query = "") {
  return new NextRequest(`http://localhost/api/admin/products/store-prices${query}`)
}

function putRequest(body: unknown) {
  return new NextRequest("http://localhost/api/admin/products/store-prices", {
    method: "PUT",
    body: JSON.stringify(body),
  })
}

describe("/api/admin/products/store-prices", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("GET devuelve 403 y no toca Supabase si el admin es rechazado", async () => {
    denyAdmin()

    const response = await GET(getRequest("?productId=7"))

    expect(response.status).toBe(403)
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it("GET devuelve 400 cuando productId falta o no es válido", async () => {
    asAdmin()

    const sinParam = await GET(getRequest())
    const noNumerico = await GET(getRequest("?productId=abc"))

    expect(sinParam.status).toBe(400)
    expect(noNumerico.status).toBe(400)
    expect((await sinParam.json()).error).toBe("Se requiere productId")
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it("GET devuelve las tiendas activas y los overrides del producto", async () => {
    asAdmin()
    const supabase = serviceWith({
      stores: { data: [{ id: 1, name: "Centro" }], error: null },
      product_stores: {
        data: [{ store_id: 1, price: 12000, sale_price: 9900 }],
        error: null,
      },
    })

    const response = await GET(getRequest("?productId=7"))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json).toEqual({
      stores: [{ id: 1, name: "Centro" }],
      prices: [{ store_id: 1, price: 12000, sale_price: 9900 }],
    })
    expect(supabase.selects).toEqual([
      { table: "stores", columns: "id,name" },
      { table: "product_stores", columns: "store_id,price,sale_price" },
    ])
    expect(supabase.filters).toContainEqual({ table: "stores", op: "eq", args: ["is_active", true] })
    expect(supabase.filters).toContainEqual({
      table: "product_stores",
      op: "eq",
      args: ["product_id", 7],
    })
  })

  it("PUT devuelve 403 y no toca Supabase si el admin es rechazado", async () => {
    denyAdmin()

    const response = await PUT(putRequest({ productId: 7, prices: [] }))

    expect(response.status).toBe(403)
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it("PUT devuelve 400 cuando faltan productId o prices", async () => {
    asAdmin()

    const response = await PUT(putRequest({ prices: [] }))
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.error).toBe("Se requieren productId y prices")
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it("PUT devuelve 400 cuando price no es mayor a 0", async () => {
    asAdmin()

    const response = await PUT(putRequest({ productId: 7, prices: [{ store_id: 1, price: 0 }] }))
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.error).toBe("price debe ser mayor a 0")
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it("PUT devuelve 400 cuando sale_price es negativo", async () => {
    asAdmin()

    const response = await PUT(
      putRequest({ productId: 7, prices: [{ store_id: 1, price: 100, sale_price: -1 }] })
    )
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.error).toBe("sale_price inválido")
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it("PUT reemplaza los overrides: borra, reinserta y audita", async () => {
    asAdmin()
    const supabase = serviceWith({
      product_stores: { data: null, error: null },
    })

    const response = await PUT(
      putRequest({
        productId: 7,
        prices: [
          { store_id: 1, price: "12000", sale_price: "9900" },
          { store_id: 2, price: 8000 },
          { store_id: 3 },
        ],
      })
    )
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json).toEqual({ success: true, productId: 7, overrides: 2 })
    expect(supabase.deletes).toEqual([{ table: "product_stores", id: 7 }])
    expect(supabase.inserts).toEqual([
      {
        table: "product_stores",
        payload: [
          { product_id: 7, store_id: 1, price: 12000, sale_price: 9900 },
          { product_id: 7, store_id: 2, price: 8000, sale_price: null },
        ],
      },
    ])
    expect(revalidateCatalogCache).toHaveBeenCalledTimes(1)
    expect(resetCatalogCache).toHaveBeenCalledTimes(1)
    expect(logAdminAction).toHaveBeenCalledWith(expect.anything(), {
      actorId: "admin-1",
      actorEmail: null,
      action: "product_update",
      entity: "products",
      entityId: 7,
      detail: { storePrices: 2 },
    })
  })

  it("PUT elimina los overrides y no inserta cuando ninguna fila trae price", async () => {
    asAdmin()
    const supabase = serviceWith({ product_stores: { data: null, error: null } })

    const response = await PUT(putRequest({ productId: 7, prices: [{ store_id: 1 }, { store_id: 2 }] }))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.overrides).toBe(0)
    expect(supabase.inserts).toHaveLength(0)
    expect(supabase.deletes).toHaveLength(1)
    expect(revalidateCatalogCache).toHaveBeenCalledTimes(1)
  })

  it("PUT devuelve 500 cuando falla el insert de overrides", async () => {
    asAdmin()
    serviceWith({
      product_stores: [
        { data: null, error: null },
        { data: null, error: { message: "permission denied" } },
      ],
    })

    const response = await PUT(putRequest({ productId: 7, prices: [{ store_id: 1, price: 100 }] }))
    const json = await response.json()

    expect(response.status).toBe(500)
    expect(json.error).toBe("permission denied")
    expect(revalidateCatalogCache).not.toHaveBeenCalled()
  })
})
