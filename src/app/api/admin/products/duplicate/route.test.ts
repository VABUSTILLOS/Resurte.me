import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }))
vi.mock("@/lib/admin-auth", () => ({ requireAdmin: vi.fn() }))
vi.mock("@/lib/catalog-cache", () => ({ revalidateCatalogCache: vi.fn() }))
vi.mock("@/lib/catalog", () => ({ resetCatalogCache: vi.fn() }))
vi.mock("@/lib/audit-log", () => ({ logAdminAction: vi.fn() }))

import { POST } from "./route"
import { createServiceClient } from "@/lib/supabase/service"
import { requireAdmin } from "@/lib/admin-auth"
import { revalidateCatalogCache } from "@/lib/catalog-cache"
import { resetCatalogCache } from "@/lib/catalog"
import { logAdminAction } from "@/lib/audit-log"

interface FakeResult {
  data?: unknown
  error?: unknown
}

/** Fila de origen tal como la devuelve `select("*")`. */
const SOURCE = {
  id: 7,
  name: "Taco al pastor",
  slug: "taco-al-pastor",
  brand: "Doña Tere",
  category_id: 3,
  description: "Con piña",
  price: 20,
  stock_quantity: 5,
  images: ["a.jpg"],
  image_url: "a.jpg",
  is_visible: true,
  show_in_whatsapp: true,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-02T00:00:00.000Z",
  whatsapp_product_id: "wamid.ABC",
}

function asAdmin() {
  vi.mocked(requireAdmin).mockResolvedValue({ user: { id: "admin-1" }, response: null } as never)
}

/**
 * Cliente Supabase falso con despacho por tabla: cada consulta recibe su propio
 * builder y su propio resultado, en el orden en que el route las ejecuta.
 */
function serviceWith(byTable: Record<string, FakeResult | FakeResult[]>) {
  const cursors = new Map<string, number>()
  const selects: { table: string; columns: string }[] = []
  const inserts: { table: string; payload: unknown }[] = []
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
      const sub: Record<string, unknown> = {}
      sub.select = vi.fn(() => sub)
      sub.single = vi.fn(() => sub)
      return thenable(sub, result)
    })
    return thenable(builder, result)
  })

  vi.mocked(createServiceClient).mockResolvedValue({ from } as never)
  return { from, selects, inserts, filters }
}

function duplicateRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/admin/products/duplicate", {
    method: "POST",
    body: JSON.stringify(body),
  })
}

describe("/api/admin/products/duplicate", () => {
  beforeEach(() => vi.clearAllMocks())

  it("403 sin rol admin", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({
      user: null,
      response: new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }),
    } as never)
    const res = await POST(duplicateRequest({ productId: 7 }))
    expect(res.status).toBe(403)
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it("400 sin productId", async () => {
    asAdmin()
    const res = await POST(duplicateRequest({}))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain("productId")
  })

  it("404 si el producto de origen no existe", async () => {
    asAdmin()
    serviceWith({ products: [{ data: null, error: { code: "PGRST116", message: "no rows" } }] })
    const res = await POST(duplicateRequest({ productId: 7 }))
    expect(res.status).toBe(404)
    expect((await res.json()).error).toBe("Producto no encontrado")
  })

  it("201 duplica despublicada, sin ids heredados y copia la disponibilidad", async () => {
    asAdmin()
    const { inserts, selects, filters } = serviceWith({
      products: [
        { data: SOURCE, error: null },
        { data: [{ slug: "taco-al-pastor-copia" }], error: null },
        { data: { id: 99, name: "Taco al pastor (copia)", slug: "taco-al-pastor-copia-2" }, error: null },
      ],
      product_city_availability: [
        { data: [{ city_id: 1, is_available: true }, { city_id: 2, is_available: false }], error: null },
        { data: null, error: null },
      ],
    })

    const res = await POST(duplicateRequest({ productId: 7 }))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body).toMatchObject({
      success: true,
      product: { id: 99, slug: "taco-al-pastor-copia-2" },
    })

    expect(selects[0]).toEqual({ table: "products", columns: "*" })
    // El slug libre se calcula contra los slugs ya tomados (`like root%`).
    expect(filters).toContainEqual({
      table: "products",
      op: "like",
      args: ["slug", "taco-al-pastor-copia%"],
    })

    const productInsert = inserts.find((i) => i.table === "products")
    const payload = productInsert?.payload as Record<string, unknown>
    expect(payload).toMatchObject({
      name: "Taco al pastor (copia)",
      slug: "taco-al-pastor-copia-2",
      is_visible: false,
      show_in_whatsapp: false,
      price: 20,
      stock_quantity: 5,
      category_id: 3,
    })
    for (const derived of ["id", "created_at", "updated_at", "whatsapp_product_id"]) {
      expect(payload).not.toHaveProperty(derived)
    }

    const availabilityInsert = inserts.find((i) => i.table === "product_city_availability")
    expect(availabilityInsert?.payload).toEqual([
      { product_id: 99, city_id: 1, is_available: true },
      { product_id: 99, city_id: 2, is_available: false },
    ])

    expect(vi.mocked(revalidateCatalogCache)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(resetCatalogCache)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(logAdminAction)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "product_duplicate",
        entityId: 99,
        detail: { sourceId: 7, name: "Taco al pastor (copia)" },
      })
    )
  })

  it("usa el nombre y la categoría indicados por el panel", async () => {
    asAdmin()
    const { inserts } = serviceWith({
      products: [
        { data: SOURCE, error: null },
        { data: [], error: null },
        { data: { id: 100 }, error: null },
      ],
      product_city_availability: [{ data: [], error: null }],
    })

    const res = await POST(
      duplicateRequest({ productId: 7, name: "  Taco vegetariano  ", category_id: 9 })
    )
    expect(res.status).toBe(201)
    const payload = inserts.find((i) => i.table === "products")?.payload as Record<string, unknown>
    expect(payload).toMatchObject({
      name: "Taco vegetariano",
      slug: "taco-vegetariano",
      category_id: 9,
    })
  })

  it("no inserta disponibilidad cuando el origen es global", async () => {
    asAdmin()
    const { inserts } = serviceWith({
      products: [
        { data: SOURCE, error: null },
        { data: [], error: null },
        { data: { id: 101 }, error: null },
      ],
      product_city_availability: [{ data: [], error: null }],
    })

    const res = await POST(duplicateRequest({ productId: 7 }))
    expect(res.status).toBe(201)
    expect(inserts.filter((i) => i.table === "product_city_availability")).toHaveLength(0)
  })

  it("500 si el INSERT de la copia falla", async () => {
    asAdmin()
    serviceWith({
      products: [
        { data: SOURCE, error: null },
        { data: [], error: null },
        { data: null, error: { code: "23505", message: "duplicate key value" } },
      ],
      product_city_availability: [{ data: [], error: null }],
    })

    const res = await POST(duplicateRequest({ productId: 7 }))
    expect(res.status).toBe(500)
    expect((await res.json()).error).toContain("duplicate key")
    expect(revalidateCatalogCache).not.toHaveBeenCalled()
    expect(logAdminAction).not.toHaveBeenCalled()
  })
})
