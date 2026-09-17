import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }))
vi.mock("@/lib/admin-auth", () => ({ requireAdmin: vi.fn() }))
vi.mock("@/lib/catalog-cache", () => ({ revalidateCatalogCache: vi.fn() }))
vi.mock("@/lib/catalog", () => ({ resetCatalogCache: vi.fn() }))
vi.mock("@/lib/audit-log", () => ({ logAdminAction: vi.fn() }))
vi.mock("@/lib/whatsapp-sync-queue", () => ({ enqueueProductsForWaSync: vi.fn() }))

import { POST } from "./route"
import { createServiceClient } from "@/lib/supabase/service"
import { requireAdmin } from "@/lib/admin-auth"
import { revalidateCatalogCache } from "@/lib/catalog-cache"
import { resetCatalogCache } from "@/lib/catalog"
import { logAdminAction } from "@/lib/audit-log"
import { enqueueProductsForWaSync } from "@/lib/whatsapp-sync-queue"

interface FakeResult {
  data?: unknown
  error?: unknown
}

function asAdmin() {
  vi.mocked(requireAdmin).mockResolvedValue({ user: { id: "admin-1" }, response: null } as never)
}

/**
 * Cliente Supabase falso. Cada `from(table)` entrega un builder encadenable y
 * "thenable" ligado a su propio resultado, en el orden en que el route los
 * consume, así que las dos lecturas del `Promise.all` no comparten filas.
 */
function serviceWith(byTable: Record<string, FakeResult | FakeResult[]>) {
  const cursors = new Map<string, number>()
  const selects: { table: string; columns: string }[] = []
  const inserts: { table: string; payload: unknown }[] = []
  const updates: { table: string; payload: Record<string, unknown>; id?: unknown }[] = []

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
      builder[op] = vi.fn(() => builder)
    }
    builder.insert = vi.fn((payload: unknown) => {
      inserts.push({ table, payload })
      return thenable({}, result)
    })
    builder.update = vi.fn((payload: Record<string, unknown>) => {
      const entry: { table: string; payload: Record<string, unknown>; id?: unknown } = {
        table,
        payload,
      }
      updates.push(entry)
      const sub: Record<string, unknown> = {}
      sub.eq = vi.fn((_column: string, id: unknown) => {
        entry.id = id
        return sub
      })
      return thenable(sub, result)
    })
    return thenable(builder, result)
  })

  vi.mocked(createServiceClient).mockResolvedValue({ from } as never)
  return { from, selects, inserts, updates }
}

const SOURCE = {
  id: 1,
  name: "Taco duplicado",
  image_url: null,
  images: ["a.jpg"],
}
const TARGET = {
  id: 2,
  name: "Taco al pastor",
  image_url: "principal.jpg",
  images: ["galeria.jpg", "a.jpg"],
}

function mergeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/admin/products/merge", {
    method: "POST",
    body: JSON.stringify(body),
  })
}

describe("/api/admin/products/merge", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("devuelve 403 y no toca Supabase si el admin es rechazado", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({
      user: null,
      response: new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }),
    } as never)

    const response = await POST(mergeRequest({ sourceId: 1, targetId: 2 }))

    expect(response.status).toBe(403)
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it("devuelve 400 cuando sourceId y targetId son iguales", async () => {
    asAdmin()

    const response = await POST(mergeRequest({ sourceId: 3, targetId: 3 }))
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.error).toContain("distintos")
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it("devuelve 400 cuando los ids no son números", async () => {
    asAdmin()

    const response = await POST(mergeRequest({ sourceId: "1", targetId: 2 }))

    expect(response.status).toBe(400)
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it("devuelve 404 si alguno de los productos no existe", async () => {
    asAdmin()
    serviceWith({
      products: [{ data: SOURCE, error: null }, { data: null, error: null }],
    })

    const response = await POST(mergeRequest({ sourceId: 1, targetId: 2 }))
    const json = await response.json()

    expect(response.status).toBe(404)
    expect(json.error).toBe("Producto no encontrado")
    expect(revalidateCatalogCache).not.toHaveBeenCalled()
  })

  it("fusiona galería y disponibilidad, manda el source a la papelera y audita ambos cambios", async () => {
    asAdmin()
    const supabase = serviceWith({
      products: [{ data: SOURCE, error: null }, { data: TARGET, error: null }],
      product_city_availability: [
        {
          data: [
            { city_id: 1, is_available: true },
            { city_id: 2, is_available: false },
          ],
          error: null,
        },
        { data: [{ city_id: 1 }], error: null },
      ],
    })

    const response = await POST(mergeRequest({ sourceId: 1, targetId: 2 }))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json).toEqual({ success: true, sourceId: 1, targetId: 2 })
    expect(supabase.selects).toEqual([
      { table: "products", columns: "id,name,image_url,images" },
      { table: "products", columns: "id,name,image_url,images" },
      { table: "product_city_availability", columns: "city_id,is_available" },
      { table: "product_city_availability", columns: "city_id" },
    ])
    expect(supabase.inserts).toEqual([
      {
        table: "product_city_availability",
        payload: [{ product_id: 2, city_id: 2, is_available: false }],
      },
    ])
    expect(supabase.updates[0]).toEqual({
      table: "products",
      payload: { images: ["galeria.jpg", "a.jpg"], image_url: "principal.jpg" },
      id: 2,
    })
    expect(supabase.updates[1]).toMatchObject({
      table: "products",
      payload: { is_visible: false },
      id: 1,
    })
    expect(supabase.updates[1]?.payload.deleted_at).toEqual(expect.any(String))
    expect(revalidateCatalogCache).toHaveBeenCalledTimes(1)
    expect(resetCatalogCache).toHaveBeenCalledTimes(1)
    expect(logAdminAction).toHaveBeenNthCalledWith(1, expect.anything(), {
      actorId: "admin-1",
      actorEmail: null,
      action: "product_update",
      entity: "products",
      entityId: 2,
      detail: { mergeFrom: 1 },
    })
    expect(logAdminAction).toHaveBeenNthCalledWith(2, expect.anything(), {
      actorId: "admin-1",
      actorEmail: null,
      action: "product_delete",
      entity: "products",
      entityId: 1,
      detail: { mergedInto: 2, name: "Taco duplicado" },
    })
    expect(enqueueProductsForWaSync).toHaveBeenCalledWith(expect.anything(), [2], "product_merge")
  })

  it("hereda la imagen principal del source y no inserta disponibilidad ya presente", async () => {
    asAdmin()
    const supabase = serviceWith({
      products: [
        { data: { ...SOURCE, image_url: "heredada.jpg" }, error: null },
        { data: TARGET, error: null },
      ],
      product_city_availability: [
        { data: [{ city_id: 1, is_available: true }], error: null },
        { data: [{ city_id: 1 }], error: null },
      ],
    })

    await POST(mergeRequest({ sourceId: 1, targetId: 2 }))

    expect(supabase.inserts).toHaveLength(0)
    expect(supabase.updates[0]?.payload.image_url).toBe("principal.jpg")
  })

  it("devuelve 500 cuando falla la actualización del target", async () => {
    asAdmin()
    serviceWith({
      products: [
        { data: SOURCE, error: null },
        { data: TARGET, error: null },
        { data: null, error: { message: "permission denied" } },
      ],
      product_city_availability: [{ data: [], error: null }, { data: [], error: null }],
    })

    const response = await POST(mergeRequest({ sourceId: 1, targetId: 2 }))
    const json = await response.json()

    expect(response.status).toBe(500)
    expect(json.error).toBe("permission denied")
    expect(revalidateCatalogCache).not.toHaveBeenCalled()
  })
})
