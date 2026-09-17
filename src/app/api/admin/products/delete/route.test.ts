import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }))
vi.mock("@/lib/admin-auth", () => ({ requireAdmin: vi.fn() }))
vi.mock("@/lib/catalog-cache", () => ({ revalidateCatalogCache: vi.fn() }))
vi.mock("@/lib/catalog", () => ({ resetCatalogCache: vi.fn() }))
vi.mock("@/lib/audit-log", () => ({ logAdminAction: vi.fn() }))
vi.mock("@/lib/whatsapp-sync-queue", () => ({ enqueueProductsForWaSync: vi.fn() }))

import { DELETE, POST } from "./route"
import { MALFORMED_BODY } from "@/lib/api-body"
import { createServiceClient } from "@/lib/supabase/service"
import { requireAdmin } from "@/lib/admin-auth"
import { revalidateCatalogCache } from "@/lib/catalog-cache"
import { resetCatalogCache } from "@/lib/catalog"
import { logAdminAction } from "@/lib/audit-log"
import { enqueueProductsForWaSync } from "@/lib/whatsapp-sync-queue"

/** Error real de PostgREST cuando el payload trae una columna inexistente. */
const MISSING_DELETED_AT = {
  code: "PGRST204",
  message: "Could not find the 'deleted_at' column of 'products' in the schema cache",
}

interface FakeResult {
  data?: unknown
  error?: unknown
}

function asAdmin() {
  vi.mocked(requireAdmin).mockResolvedValue({ user: { id: "admin-1" }, response: null } as never)
}

/**
 * Cliente Supabase falso. Cada `from(table)` entrega un builder encadenable y
 * "thenable" ligado a su propio resultado (en el orden en que el route los
 * consume), así que una lectura y su escritura nunca comparten filas.
 */
function serviceWith(byTable: Record<string, FakeResult | FakeResult[]>) {
  const cursors = new Map<string, number>()
  const selects: { table: string; columns: string }[] = []
  const inserts: { table: string; payload: unknown }[] = []
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
  return { from, selects, inserts, updates, filters }
}

const SOURCE_ROW = { name: "Taco al pastor", slug: "taco-al-pastor" }

function deleteRequest(body: unknown) {
  return new NextRequest("http://localhost/api/admin/products/delete", {
    method: "DELETE",
    body: JSON.stringify(body),
  })
}

function restoreRequest(body: unknown) {
  return new NextRequest("http://localhost/api/admin/products/delete", {
    method: "POST",
    body: JSON.stringify(body),
  })
}

describe("/api/admin/products/delete", () => {
  beforeEach(() => vi.clearAllMocks())

  it("403 sin rol admin", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({
      user: null,
      response: new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }),
    } as never)
    const res = await DELETE(deleteRequest({ productId: 7 }))
    expect(res.status).toBe(403)
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it("400 sin productId", async () => {
    asAdmin()
    const res = await DELETE(deleteRequest({}))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain("productId")
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it("400 si productId no es numérico", async () => {
    asAdmin()
    const res = await DELETE(deleteRequest({ productId: "7" }))
    expect(res.status).toBe(400)
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it("400 si el cuerpo no es JSON válido (B30: es fallo del cliente, no 500)", async () => {
    asAdmin()
    const res = await DELETE(
      new NextRequest("http://localhost/api/admin/products/delete", {
        method: "DELETE",
        body: "{no-es-json",
      })
    )
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(json.error).toBe(MALFORMED_BODY)
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it("marca deleted_at, despublica y deja bitácora de la baja", async () => {
    asAdmin()
    const { updates, selects, filters } = serviceWith({
      products: [{ data: SOURCE_ROW, error: null }, { data: null, error: null }],
    })
    const res = await DELETE(deleteRequest({ productId: 7 }))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true, productId: 7 })
    expect(selects[0]).toEqual({ table: "products", columns: "name, slug" })
    expect(filters[0]).toEqual({ table: "products", op: "eq", args: ["id", 7] })
    expect(updates).toHaveLength(1)
    expect(updates[0]?.payload).toMatchObject({ is_visible: false })
    expect(updates[0]?.payload.deleted_at).toEqual(expect.any(String))
    expect(updates[0]?.id).toBe(7)

    expect(vi.mocked(revalidateCatalogCache)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(resetCatalogCache)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(logAdminAction)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "product_delete",
        entity: "products",
        entityId: 7,
        detail: { name: "Taco al pastor", slug: "taco-al-pastor" },
      })
    )
    expect(vi.mocked(enqueueProductsForWaSync)).toHaveBeenCalledWith(
      expect.anything(),
      [7],
      "product_delete"
    )
  })

  it("500 si PostgREST rechaza la baja y no invalida caché", async () => {
    asAdmin()
    serviceWith({
      products: [{ data: SOURCE_ROW, error: null }, { data: null, error: MISSING_DELETED_AT }],
    })
    const res = await DELETE(deleteRequest({ productId: 7 }))

    // Comportamiento actual: sin la migración 00099 (columna deleted_at) la
    // ruta responde 500; no hay degradación a borrado físico ni a 200.
    expect(res.status).toBe(500)
    expect((await res.json()).error).toContain("deleted_at")
    expect(revalidateCatalogCache).not.toHaveBeenCalled()
    expect(logAdminAction).not.toHaveBeenCalled()
  })

  it("400 en POST si falta restore: true", async () => {
    asAdmin()
    const res = await POST(restoreRequest({ productId: 7 }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain("restore")
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it("POST restaura limpiando deleted_at y deja bitácora", async () => {
    asAdmin()
    const { updates, selects } = serviceWith({
      products: [{ data: null, error: null }],
    })
    const res = await POST(restoreRequest({ productId: 7, restore: true }))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true, productId: 7 })
    // Restaurar no vuelve a publicar: la fila queda visible=false.
    expect(updates[0]?.payload).toEqual({ deleted_at: null, is_visible: false })
    expect(updates[0]?.id).toBe(7)
    expect(selects).toHaveLength(0)
    expect(vi.mocked(logAdminAction)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "product_restore", entityId: 7 })
    )
    expect(revalidateCatalogCache).toHaveBeenCalledTimes(1)
  })

  it("403 en POST sin rol admin", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({
      user: null,
      response: new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }),
    } as never)
    const res = await POST(restoreRequest({ productId: 7, restore: true }))
    expect(res.status).toBe(403)
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it("500 en POST si falla la restauración", async () => {
    asAdmin()
    serviceWith({ products: [{ data: null, error: { message: "connection reset" } }] })
    const res = await POST(restoreRequest({ productId: 7, restore: true }))
    expect(res.status).toBe(500)
    expect((await res.json()).error).toContain("connection reset")
    expect(revalidateCatalogCache).not.toHaveBeenCalled()
  })
})
