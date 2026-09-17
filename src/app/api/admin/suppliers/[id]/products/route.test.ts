import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }))
vi.mock("@/lib/admin-auth", () => ({ requireAdmin: vi.fn() }))
vi.mock("@/lib/audit-log", () => ({ logAdminAction: vi.fn() }))
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))

import { POST } from "./route"
import { createServiceClient } from "@/lib/supabase/service"
import { requireAdmin } from "@/lib/admin-auth"
import { logAdminAction } from "@/lib/audit-log"

const URL = "http://localhost/api/admin/suppliers/4/products"

type Result = { data?: unknown; error?: unknown; count?: number | null }

const CHAIN_METHODS = [
  "select",
  "insert",
  "update",
  "delete",
  "upsert",
  "eq",
  "neq",
  "is",
  "ilike",
  "order",
  "limit",
  "range",
  "maybeSingle",
  "single",
  "head",
] as const

function makeQuery(result: Result, log: string[]) {
  const query: Record<string, unknown> = {
    then: (onFulfilled: unknown, onRejected: unknown) =>
      Promise.resolve(result).then(onFulfilled as never, onRejected as never),
    catch: (onRejected: unknown) => Promise.resolve(result).catch(onRejected as never),
    finally: (onFinally: unknown) => Promise.resolve(result).finally(onFinally as never),
  }
  for (const method of CHAIN_METHODS) {
    query[method] = (...args: unknown[]) => {
      log.push(`${method}(${JSON.stringify(args)})`)
      return query
    }
  }
  return query
}

function serviceWith(queues: Record<string, Result[]>, log: string[] = []) {
  const seen: Record<string, number> = {}
  const from = vi.fn((table: string) => {
    const index = seen[table] ?? 0
    seen[table] = index + 1
    return makeQuery((queues[table] ?? [])[index] ?? { data: null, error: null }, log)
  })
  vi.mocked(createServiceClient).mockResolvedValue({ from } as never)
  return { from, log }
}

function asAdmin() {
  vi.mocked(requireAdmin).mockResolvedValue({
    user: { id: "admin-1", email: "admin@resurte.me" },
    response: null,
  } as never)
}

function asDenied() {
  vi.mocked(requireAdmin).mockResolvedValue({
    user: null,
    response: new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }),
  } as never)
}

function postRequest(body: unknown) {
  return new NextRequest(URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}

function params(id = "4") {
  return { params: Promise.resolve({ id }) }
}

const VALID = { product_id: 11, supplier_sku: "H-100", cost: 120.5, is_primary: true }

/**
 * Cola de `product_suppliers` en el orden real de la ruta:
 * [0] duplicado, [1] degradar al principal anterior (solo si aplica), [2] insert.
 */
function withExists(productSuppliers: Result[] = [], log: string[] = []) {
  return serviceWith(
    {
      suppliers: [{ data: { id: 4 } }],
      products: [{ data: { id: 11, name: "Harina" } }],
      product_suppliers: productSuppliers,
    },
    log
  )
}

describe("POST /api/admin/suppliers/[id]/products", () => {
  beforeEach(() => vi.clearAllMocks())

  it("403 sin rol admin y no toca la base", async () => {
    asDenied()
    const res = await POST(postRequest(VALID), params())
    expect(res.status).toBe(403)
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it("400 con id de proveedor no numérico", async () => {
    asAdmin()
    const res = await POST(postRequest(VALID), params("abc"))
    expect(res.status).toBe(400)
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it("400 sin product_id y sin llamar a la base", async () => {
    asAdmin()
    const res = await POST(postRequest({ cost: 10 }), params())
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain("producto válido")
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it("400 con un costo negativo", async () => {
    asAdmin()
    const res = await POST(postRequest({ ...VALID, cost: -1 }), params())
    expect(res.status).toBe(400)
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it("404 si el proveedor no existe", async () => {
    asAdmin()
    serviceWith({ suppliers: [{ data: null }] })
    const res = await POST(postRequest(VALID), params())
    expect(res.status).toBe(404)
    expect(logAdminAction).not.toHaveBeenCalled()
  })

  it("404 si el producto no existe", async () => {
    asAdmin()
    serviceWith({ suppliers: [{ data: { id: 4 } }], products: [{ data: null }] })
    const res = await POST(postRequest(VALID), params())
    expect(res.status).toBe(404)
    expect((await res.json()).error).toContain("Producto")
    expect(logAdminAction).not.toHaveBeenCalled()
  })

  it("409 cuando el vínculo duplicado trae SKU nulo (el UNIQUE no lo atrapa)", async () => {
    asAdmin()
    withExists([{ data: [{ id: 9, supplier_sku: null }] }])
    const res = await POST(postRequest({ product_id: 11, cost: 50 }), params())
    expect(res.status).toBe(409)
    expect((await res.json()).error).toContain("ya está vinculado")
    expect(logAdminAction).not.toHaveBeenCalled()
  })

  it("permite el mismo producto con otro SKU", async () => {
    asAdmin()
    withExists([{ data: [{ id: 9, supplier_sku: "H-100" }] }, { data: null }, { data: { id: 40 } }])
    const res = await POST(postRequest({ ...VALID, supplier_sku: "H-200" }), params())
    expect(res.status).toBe(201)
  })

  it("crea el vínculo, desmarca al principal anterior y deja bitácora", async () => {
    asAdmin()
    const { log } = withExists([{ data: [] }, { data: null }, { data: { id: 33 } }])
    const res = await POST(postRequest(VALID), params())
    expect(res.status).toBe(201)
    expect((await res.json()).link.id).toBe(33)
    expect(log).toContain('update([{"is_primary":false}])')
    expect(logAdminAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "supplier_product_link",
        entityId: 33,
        detail: expect.objectContaining({ supplierId: 4, productId: 11, isPrimary: true }),
      })
    )
  })

  it("no desmarca a nadie cuando el vínculo no es principal", async () => {
    asAdmin()
    const { log } = withExists([{ data: [] }, { data: { id: 34 } }])
    const res = await POST(postRequest({ ...VALID, is_primary: false }), params())
    expect(res.status).toBe(201)
    expect(log).not.toContain('update([{"is_primary":false}])')
  })

  it("acepta is_primary como cadena \"true\"", async () => {
    asAdmin()
    const { log } = withExists([{ data: [] }, { data: null }, { data: { id: 35 } }])
    const res = await POST(postRequest({ ...VALID, is_primary: "true" }), params())
    expect(res.status).toBe(201)
    expect(
      log.some((entry) => entry.startsWith("insert(") && entry.includes('"is_primary":true'))
    ).toBe(true)
  })

  it("409 si el UNIQUE de Postgres rechaza el insert", async () => {
    asAdmin()
    withExists([{ data: [] }, { data: null }, { data: null, error: { code: "23505", message: "dup" } }])
    const res = await POST(postRequest(VALID), params())
    expect(res.status).toBe(409)
    expect(logAdminAction).not.toHaveBeenCalled()
  })

  it("500 en un error inesperado", async () => {
    asAdmin()
    withExists([{ data: [] }, { data: null }, { data: null, error: { code: "08006", message: "red" } }])
    const res = await POST(postRequest(VALID), params())
    expect(res.status).toBe(500)
  })

  it("500 si falla la degradación del principal anterior", async () => {
    asAdmin()
    withExists([{ data: [] }, { data: null, error: { code: "08006", message: "red" } }])
    const res = await POST(postRequest(VALID), params())
    expect(res.status).toBe(500)
    expect(logAdminAction).not.toHaveBeenCalled()
  })
})
