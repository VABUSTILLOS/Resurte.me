import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }))
vi.mock("@/lib/admin-auth", () => ({ requireAdmin: vi.fn() }))
vi.mock("@/lib/audit-log", () => ({ logAdminAction: vi.fn() }))
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))

import { DELETE, PATCH } from "./route"
import { createServiceClient } from "@/lib/supabase/service"
import { requireAdmin } from "@/lib/admin-auth"
import { logAdminAction } from "@/lib/audit-log"

const URL = "http://localhost/api/admin/suppliers/4/products/9"

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

/**
 * Cola de `product_suppliers` en el orden real de la ruta:
 * PATCH: [0] vínculo actual, [1] hermanos (solo si cambia el SKU),
 * [2] degradar al principal anterior (solo si `is_primary: true`), [3] update final.
 * DELETE: [0] vínculo, [1] delete.
 */
function serviceWith(queues: Result[], log: string[] = []) {
  let index = 0
  const from = vi.fn((table: string) => {
    if (table !== "product_suppliers") {
      return makeQuery({ data: null, error: null }, log)
    }
    const current = index
    index += 1
    return makeQuery(queues[current] ?? { data: null, error: null }, log)
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

function patchRequest(body: unknown) {
  return new NextRequest(URL, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}

function params(id = "4", linkId = "9") {
  return { params: Promise.resolve({ id, linkId }) }
}

const CURRENT = { id: 9, product_id: 11, supplier_sku: "H-100" }

describe("PATCH /api/admin/suppliers/[id]/products/[linkId]", () => {
  beforeEach(() => vi.clearAllMocks())

  it("403 sin rol admin y no toca la base", async () => {
    asDenied()
    const res = await PATCH(patchRequest({ cost: 10 }), params())
    expect(res.status).toBe(403)
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it("400 con id de proveedor no numérico", async () => {
    asAdmin()
    const res = await PATCH(patchRequest({ cost: 10 }), params("abc", "9"))
    expect(res.status).toBe(400)
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it("400 con linkId no numérico", async () => {
    asAdmin()
    const res = await PATCH(patchRequest({ cost: 10 }), params("4", "0"))
    expect(res.status).toBe(400)
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it("400 si no hay ningún campo editable", async () => {
    asAdmin()
    const res = await PATCH(patchRequest({}), params())
    expect(res.status).toBe(400)
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it("400 si intentan mover el vínculo a otro producto", async () => {
    asAdmin()
    const res = await PATCH(patchRequest({ product_id: 99 }), params())
    expect(res.status).toBe(400)
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it("404 si el vínculo no pertenece a ese proveedor", async () => {
    asAdmin()
    serviceWith([{ data: null }])
    const res = await PATCH(patchRequest({ cost: 10 }), params())
    expect(res.status).toBe(404)
    expect(logAdminAction).not.toHaveBeenCalled()
  })

  it("edita el costo sin consultar hermanos ni degradar a nadie", async () => {
    asAdmin()
    const { log } = serviceWith([{ data: CURRENT }, { data: { id: 9, cost: 150 } }])
    const res = await PATCH(patchRequest({ cost: 150 }), params())
    expect(res.status).toBe(200)
    expect((await res.json()).link.cost).toBe(150)
    expect(log.some((entry) => entry.startsWith("neq("))).toBe(false)
    expect(log).not.toContain('update([{"is_primary":false}])')
    expect(logAdminAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "supplier_product_update",
        entityId: 9,
        detail: { supplierId: 4, productId: 11, fields: ["cost"] },
      })
    )
  })

  it("409 si el nuevo SKU choca con un hermano del mismo producto", async () => {
    asAdmin()
    serviceWith([
      { data: CURRENT },
      { data: [{ id: 12, supplier_sku: "H-200" }] },
    ])
    const res = await PATCH(patchRequest({ supplier_sku: "H-200" }), params())
    expect(res.status).toBe(409)
    expect((await res.json()).error).toContain("ya está vinculado")
    expect(logAdminAction).not.toHaveBeenCalled()
  })

  it("permite pasar el SKU a NULL si ningún hermano lo tiene en NULL", async () => {
    asAdmin()
    const { log } = serviceWith([
      { data: CURRENT },
      { data: [{ id: 12, supplier_sku: "H-200" }] },
      { data: { id: 9, supplier_sku: null } },
    ])
    const res = await PATCH(patchRequest({ supplier_sku: null }), params())
    expect(res.status).toBe(200)
    expect(log.some((entry) => entry.startsWith("update(") && entry.includes('"supplier_sku":null'))).toBe(true)
  })

  it("409 si el SKU a NULL ya lo tiene un hermano (NULL no colisiona en SQL)", async () => {
    asAdmin()
    serviceWith([
      { data: CURRENT },
      { data: [{ id: 12, supplier_sku: null }] },
    ])
    const res = await PATCH(patchRequest({ supplier_sku: null }), params())
    expect(res.status).toBe(409)
  })

  it("no consulta hermanos cuando el SKU no cambia", async () => {
    asAdmin()
    const { log } = serviceWith([{ data: CURRENT }, { data: { id: 9 } }])
    const res = await PATCH(patchRequest({ supplier_sku: "H-100", cost: 20 }), params())
    expect(res.status).toBe(200)
    expect(log.some((entry) => entry.startsWith("neq("))).toBe(false)
  })

  it("al marcar principal degrada a los demás del mismo producto, excluyéndose", async () => {
    asAdmin()
    const { log } = serviceWith([
      { data: CURRENT },
      { data: null },
      { data: { id: 9, is_primary: true } },
    ])
    const res = await PATCH(patchRequest({ is_primary: true }), params())
    expect(res.status).toBe(200)
    expect(log.filter((entry) => entry.startsWith("update("))).toEqual([
      'update([{"is_primary":false}])',
      'update([{"is_primary":true}])',
    ])
    expect(log).toContain('neq(["id",9])')
  })

  it("no degrada a nadie cuando el vínculo deja de ser principal", async () => {
    asAdmin()
    const { log } = serviceWith([{ data: CURRENT }, { data: { id: 9, is_primary: false } }])
    const res = await PATCH(patchRequest({ is_primary: false }), params())
    expect(res.status).toBe(200)
    expect(log.filter((entry) => entry.startsWith("update("))).toEqual([
      'update([{"is_primary":false}])',
    ])
  })

  it("409 si el UNIQUE de Postgres rechaza el update", async () => {
    asAdmin()
    serviceWith([{ data: CURRENT }, { data: null, error: { code: "23505", message: "dup" } }])
    const res = await PATCH(patchRequest({ cost: 10 }), params())
    expect(res.status).toBe(409)
    expect(logAdminAction).not.toHaveBeenCalled()
  })

  it("500 en un error inesperado y sin bitácora", async () => {
    asAdmin()
    serviceWith([{ data: CURRENT }, { data: null, error: { code: "08006", message: "red" } }])
    const res = await PATCH(patchRequest({ cost: 10 }), params())
    expect(res.status).toBe(500)
    expect(logAdminAction).not.toHaveBeenCalled()
  })
})

describe("DELETE /api/admin/suppliers/[id]/products/[linkId]", () => {
  beforeEach(() => vi.clearAllMocks())

  it("403 sin rol admin", async () => {
    asDenied()
    const res = await DELETE(new NextRequest(URL, { method: "DELETE" }), params())
    expect(res.status).toBe(403)
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it("400 con ids inválidos", async () => {
    asAdmin()
    const res = await DELETE(new NextRequest(URL, { method: "DELETE" }), params("abc", "9"))
    expect(res.status).toBe(400)
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it("404 si el vínculo es de otro proveedor", async () => {
    asAdmin()
    serviceWith([{ data: null }])
    const res = await DELETE(new NextRequest(URL, { method: "DELETE" }), params())
    expect(res.status).toBe(404)
    expect(logAdminAction).not.toHaveBeenCalled()
  })

  it("desvincula y registra el costo que se perdió", async () => {
    asAdmin()
    serviceWith([{ data: { ...CURRENT, cost: 120.5 } }, { data: null }])
    const res = await DELETE(new NextRequest(URL, { method: "DELETE" }), params())
    expect(res.status).toBe(200)
    expect((await res.json()).deleted).toBe(true)
    expect(logAdminAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "supplier_product_unlink",
        entityId: 9,
        detail: { supplierId: 4, productId: 11, supplierSku: "H-100", cost: 120.5 },
      })
    )
  })

  it("500 si falla el delete y no deja bitácora", async () => {
    asAdmin()
    serviceWith([{ data: CURRENT }, { data: null, error: { message: "fk" } }])
    const res = await DELETE(new NextRequest(URL, { method: "DELETE" }), params())
    expect(res.status).toBe(500)
    expect(logAdminAction).not.toHaveBeenCalled()
  })
})
