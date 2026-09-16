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

/** Error real de PostgREST cuando el payload trae una columna inexistente. */
const MISSING_COLUMN_ERROR = {
  code: "PGRST204",
  message: "Could not find the 'low_stock_threshold' column of 'products' in the schema cache",
}

function asAdmin() {
  vi.mocked(requireAdmin).mockResolvedValue({ user: { id: "admin-1" }, response: null } as never)
}

/**
 * Cliente Supabase falso: `from("products")` sirve a la vez la búsqueda de slug
 * (`select(...).like(...)`) y el INSERT (`insert(...).select(...).single()`).
 */
function serviceWithInsert(results: { data: unknown; error: unknown }[]) {
  let insertCalls = 0
  const inserts: unknown[] = []
  const builder: Record<string, unknown> = {}
  builder.select = vi.fn(() => builder)
  builder.like = vi.fn(() => Promise.resolve({ data: [], error: null }))
  builder.insert = vi.fn((payload: unknown) => {
    inserts.push(payload)
    const result = results[Math.min(insertCalls, results.length - 1)]
    insertCalls++
    return { select: vi.fn(() => ({ single: vi.fn(() => Promise.resolve(result)) })) }
  })
  vi.mocked(createServiceClient).mockResolvedValue({ from: vi.fn(() => builder) } as never)
  return { builder, inserts }
}

function createRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/admin/products/create", {
    method: "POST",
    body: JSON.stringify(body),
  })
}

describe("/api/admin/products/create", () => {
  beforeEach(() => vi.clearAllMocks())

  it("403 sin rol admin", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({
      user: null,
      response: new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }),
    } as never)
    const res = await POST(createRequest({ name: "Taco" }))
    expect(res.status).toBe(403)
  })

  it("201 inserta con el umbral cuando la migración 00108 ya está aplicada", async () => {
    asAdmin()
    const { inserts } = serviceWithInsert([{ data: { id: 9, name: "Taco" }, error: null }])
    const res = await POST(createRequest({ name: "Taco", price: 20, low_stock_threshold: 3 }))
    expect(res.status).toBe(201)
    expect(inserts).toHaveLength(1)
    expect(inserts[0]).toMatchObject({ low_stock_threshold: 3 })
  })

  it("201 degrada sin el umbral si la columna no existe (PGRST204)", async () => {
    asAdmin()
    const { inserts } = serviceWithInsert([
      { data: null, error: MISSING_COLUMN_ERROR },
      { data: { id: 9, name: "Taco" }, error: null },
    ])
    const res = await POST(
      createRequest({ name: "Taco", price: 20, stock_quantity: 2, low_stock_threshold: 3 })
    )
    // Antes del arreglo esto devolvía 500 y el producto no se creaba.
    expect(res.status).toBe(201)
    expect(inserts).toHaveLength(2)
    expect(inserts[0]).toMatchObject({ low_stock_threshold: 3 })
    expect(inserts[1]).not.toHaveProperty("low_stock_threshold")
    // El resto del payload sobrevive intacto en el reintento.
    expect(inserts[1]).toMatchObject({ name: "Taco", price: 20, stock_quantity: 2 })
    // El stock se derivó contra el umbral pedido (3 ⇒ cantidad 2 = low_stock).
    expect(inserts[1]).toMatchObject({ stock_status: "low_stock" })
  })

  it("500 si el reintento sin el umbral vuelve a fallar", async () => {
    asAdmin()
    serviceWithInsert([
      { data: null, error: MISSING_COLUMN_ERROR },
      { data: null, error: { code: "23505", message: "duplicate key value" } },
    ])
    const res = await POST(createRequest({ name: "Taco", price: 20 }))
    expect(res.status).toBe(500)
    expect((await res.json()).error).toContain("duplicate key")
  })

  it("400 sin nombre", async () => {
    asAdmin()
    const res = await POST(createRequest({ name: "  " }))
    expect(res.status).toBe(400)
  })
})
