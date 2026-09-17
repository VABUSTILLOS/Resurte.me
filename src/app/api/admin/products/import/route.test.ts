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
import { logAdminAction } from "@/lib/audit-log"
import { PRODUCT_IMPORT_HEADER, type ProductImportRow } from "@/lib/product-import"

function asAdmin() {
  vi.mocked(requireAdmin).mockResolvedValue({ user: { id: "admin-1" }, response: null } as never)
}

/** Cliente falso: `from(table)` responde según la tabla y acumula escrituras. */
function serviceWith(tables: Record<string, { data?: unknown; error?: unknown }>) {
  const writes: { table: string; payload: unknown; id?: number }[] = []
  const from = vi.fn((table: string) => {
    const result = tables[table] ?? { data: [], error: null }
    const builder: Record<string, unknown> = {}
    const chain = () => builder
    builder.select = vi.fn(chain)
    builder.in = vi.fn(() => Promise.resolve(result))
    builder.update = vi.fn((payload: unknown) => {
      const updateBuilder: Record<string, unknown> = {}
      updateBuilder.eq = vi.fn((_col: string, id: number) => {
        writes.push({ table, payload, id })
        return Promise.resolve({ data: null, error: result.error ?? null })
      })
      return updateBuilder
    })
    builder.insert = vi.fn((payload: unknown) => {
      writes.push({ table, payload })
      return Promise.resolve({ data: null, error: result.error ?? null })
    })
    return builder
  })
  vi.mocked(createServiceClient).mockResolvedValue({ from } as never)
  return { writes, from }
}

function row(overrides: Partial<ProductImportRow> = {}): ProductImportRow {
  return {
    name: "Agua 600ml",
    slug: "agua-600ml",
    price: 18.5,
    sale_price: null,
    sale_starts_at: null,
    sale_ends_at: null,
    brand: null,
    category_slug: null,
    unit: null,
    stock_status: "in_stock",
    stock_quantity: null,
    low_stock_threshold: null,
    sku: null,
    barcode: null,
    tags: [],
    tags_provided: false,
    is_visible: true,
    image_url: null,
    ...overrides,
  }
}

function importRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/admin/products/import", {
    method: "POST",
    body: JSON.stringify(body),
  })
}

describe("/api/admin/products/import", () => {
  beforeEach(() => vi.clearAllMocks())

  it("403 sin rol admin", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({
      user: null,
      response: new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }),
    } as never)
    const res = await POST(importRequest({ rows: [row()] }))
    expect(res.status).toBe(403)
  })

  it("400 sin filas", async () => {
    asAdmin()
    const res = await POST(importRequest({ rows: [] }))
    expect(res.status).toBe(400)
  })

  it("400 si supera el máximo de filas", async () => {
    asAdmin()
    const res = await POST(importRequest({ rows: Array.from({ length: 501 }, () => row()) }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain("Máximo 500")
  })

  it("400 si el encabezado declarado trae columnas desconocidas", async () => {
    asAdmin()
    const res = await POST(
      importRequest({
        rows: [row()],
        columns: [...PRODUCT_IMPORT_HEADER, "precio_venta"],
      })
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain("precio_venta")
    // No se tocó la base de datos.
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it("400 si el encabezado declarado no trae las obligatorias", async () => {
    asAdmin()
    const res = await POST(importRequest({ rows: [row()], columns: ["slug", "marca"] }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain("obligatorias")
  })

  it("acepta la plantilla completa y no valida si el cliente no declara columnas", async () => {
    asAdmin()
    serviceWith({})
    const ok = await POST(
      importRequest({ rows: [row()], columns: [...PRODUCT_IMPORT_HEADER], dryRun: true })
    )
    expect(ok.status).toBe(200)

    const legacy = await POST(importRequest({ rows: [row()], dryRun: true }))
    expect(legacy.status).toBe(200)
  })

  it("400 si hay SKUs repetidos en el archivo", async () => {
    asAdmin()
    serviceWith({})
    const res = await POST(
      importRequest({ rows: [row({ sku: "A1" }), row({ slug: "otro", sku: "A1" })] })
    )
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain("SKU repetido")
  })

  it("crea productos nuevos y registra bitácora", async () => {
    asAdmin()
    const { writes } = serviceWith({
      categories: { data: [{ id: 4, slug: "bebidas" }], error: null },
      products: { data: [], error: null },
    })
    const res = await POST(
      importRequest({
        rows: [row({ category_slug: "bebidas" })],
        columns: [...PRODUCT_IMPORT_HEADER],
      })
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({ created: 1, updated: 0, mode: "upsert" })
    const insert = writes.find((w) => w.table === "products")
    expect(insert?.payload).toMatchObject({ slug: "agua-600ml", category_id: 4 })
    expect(vi.mocked(logAdminAction)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "product_update", detail: expect.objectContaining({ created: 1 }) })
    )
  })

  it("actualiza el producto existente y respeta el modo create_only", async () => {
    asAdmin()
    const { writes } = serviceWith({
      products: { data: [{ id: 7, slug: "agua-600ml", sku: null }], error: null },
    })
    const updated = await POST(importRequest({ rows: [row()], mode: "update_only" }))
    expect((await updated.json()).updated).toBe(1)
    expect(writes.find((w) => w.id === 7)?.payload).toMatchObject({ name: "Agua 600ml" })

    const skipped = await POST(importRequest({ rows: [row()], mode: "create_only" }))
    expect(await skipped.json()).toMatchObject({ created: 0, updated: 0, skipped: 1 })
  })

  it("reporta el error de Postgres por fila sin abortar el lote", async () => {
    asAdmin()
    serviceWith({
      products: { data: [], error: { message: "duplicate key value violates unique constraint" } },
    })
    const res = await POST(importRequest({ rows: [row()] }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.created).toBe(0)
    expect(body.errors[0]).toMatchObject({ slug: "agua-600ml", line: 2 })
  })
})
