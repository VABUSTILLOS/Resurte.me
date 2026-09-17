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

function asAdmin() {
  vi.mocked(requireAdmin).mockResolvedValue({ user: { id: "admin-1" }, response: null } as never)
}

/**
 * Cliente Supabase falso. Cada `from(table)` entrega un builder encadenable y
 * "thenable" ligado a su propio resultado, así que la lectura inicial y las
 * escrituras posteriores nunca comparten filas.
 */
function serviceWith(byTable: Record<string, FakeResult | FakeResult[]>) {
  const cursors = new Map<string, number>()
  const selects: { table: string; columns: string }[] = []
  const updates: { table: string; payload: Record<string, unknown>; id?: unknown }[] = []
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
  return { from, selects, updates, filters }
}

function reorderRequest(body: unknown) {
  return new NextRequest("http://localhost/api/admin/products/reorder", {
    method: "POST",
    body: JSON.stringify(body),
  })
}

describe("/api/admin/products/reorder", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("devuelve 403 y no toca Supabase si el admin es rechazado", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({
      user: null,
      response: new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }),
    } as never)

    const response = await POST(reorderRequest({ productId: 1, direction: "up" }))

    expect(response.status).toBe(403)
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it("devuelve 400 con direction inválida", async () => {
    asAdmin()

    const response = await POST(reorderRequest({ productId: 1, direction: "left" }))
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.error).toContain("direction")
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it("devuelve 400 cuando falta productId", async () => {
    asAdmin()

    const response = await POST(reorderRequest({ direction: "down" }))

    expect(response.status).toBe(400)
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it("no mueve nada si el producto ya está en el extremo", async () => {
    asAdmin()
    const supabase = serviceWith({
      products: {
        data: [
          { id: 1, sort_order: 0 },
          { id: 2, sort_order: 10 },
        ],
        error: null,
      },
    })

    const response = await POST(reorderRequest({ productId: 1, direction: "up" }))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json).toEqual({ success: true, productId: 1, moved: false })
    expect(supabase.updates).toHaveLength(0)
    expect(revalidateCatalogCache).not.toHaveBeenCalled()
    expect(logAdminAction).not.toHaveBeenCalled()
  })

  it("intercambia sort_order con el vecino cuando no hay empate", async () => {
    asAdmin()
    const supabase = serviceWith({
      products: {
        data: [
          { id: 1, sort_order: 10 },
          { id: 2, sort_order: 30 },
        ],
        error: null,
      },
    })

    const response = await POST(reorderRequest({ productId: 2, direction: "up" }))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json).toEqual({ success: true, productId: 2, moved: true })
    expect(supabase.updates).toEqual([
      { table: "products", payload: { sort_order: 10 }, id: 2 },
      { table: "products", payload: { sort_order: 30 }, id: 1 },
    ])
    expect(revalidateCatalogCache).toHaveBeenCalledTimes(1)
    expect(resetCatalogCache).toHaveBeenCalledTimes(1)
    expect(logAdminAction).toHaveBeenCalledWith(expect.anything(), {
      actorId: "admin-1",
      actorEmail: null,
      action: "product_update",
      entity: "products",
      entityId: 2,
      detail: { reorder: "up" },
    })
  })

  it("normaliza toda la lista a pasos de 10 antes de intercambiar cuando hay empate", async () => {
    asAdmin()
    const supabase = serviceWith({
      products: {
        data: [
          { id: 1, sort_order: 0 },
          { id: 2, sort_order: 0 },
          { id: 3, sort_order: 0 },
        ],
        error: null,
      },
    })

    const response = await POST(reorderRequest({ productId: 2, direction: "up" }))

    expect(response.status).toBe(200)
    expect(supabase.updates).toEqual([
      { table: "products", payload: { sort_order: 0 }, id: 1 },
      { table: "products", payload: { sort_order: 10 }, id: 2 },
      { table: "products", payload: { sort_order: 20 }, id: 3 },
      { table: "products", payload: { sort_order: 0 }, id: 2 },
      { table: "products", payload: { sort_order: 10 }, id: 1 },
    ])
  })

  it("devuelve 500 cuando la lectura de productos falla", async () => {
    asAdmin()
    serviceWith({
      products: { data: null, error: { message: "relation does not exist" } },
    })

    const response = await POST(reorderRequest({ productId: 1, direction: "up" }))
    const json = await response.json()

    expect(response.status).toBe(500)
    expect(json.error).toBe("relation does not exist")
    expect(revalidateCatalogCache).not.toHaveBeenCalled()
  })
})
