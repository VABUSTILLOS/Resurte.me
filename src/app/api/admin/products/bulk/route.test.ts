import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }))
vi.mock("@/lib/admin-auth", () => ({ requireAdmin: vi.fn() }))
vi.mock("@/lib/catalog-cache", () => ({ revalidateCatalogCache: vi.fn() }))
vi.mock("@/lib/catalog", () => ({ resetCatalogCache: vi.fn() }))
vi.mock("@/lib/audit-log", () => ({ logAdminAction: vi.fn() }))
vi.mock("@/lib/whatsapp-sync-queue", () => ({ enqueueProductsForWaSync: vi.fn() }))

import { POST } from "./route"
import { MAX_BULK_IDS } from "@/lib/product-bulk"
import { createServiceClient } from "@/lib/supabase/service"
import { requireAdmin } from "@/lib/admin-auth"
import { logAdminAction } from "@/lib/audit-log"

/** Lectura: Postgres rechaza el SELECT de una columna inexistente. */
const READ_MISSING_COLUMN = {
  code: "42703",
  message: "column products.low_stock_threshold does not exist",
}
/** Escritura: PostgREST rechaza el payload antes de llegar a Postgres. */
const WRITE_MISSING_COLUMN = {
  code: "PGRST204",
  message: "Could not find the 'low_stock_threshold' column of 'products' in the schema cache",
}

type WriteResult = { data?: unknown; error: unknown }

function asAdmin() {
  vi.mocked(requireAdmin).mockResolvedValue({ user: { id: "admin-1" }, response: null } as never)
}

/**
 * Cliente Supabase falso. Las lecturas (`select().in()`) sirven la lista de
 * `reads`; las escrituras (`update().in().select()`) la de `writes`, y por
 * defecto **ecoan los ids** recibidos, que es lo que PostgREST devuelve con
 * `.select("id")` (los productos inexistentes no aparecen).
 */
function serviceWith(opts: { reads?: unknown[]; writes?: (WriteResult | ((ids: number[]) => WriteResult))[] }) {
  let readCalls = 0
  let writeCalls = 0
  const readCols: string[] = []
  const writePayloads: Record<string, unknown>[] = []
  const writeChunks: number[][] = []

  const builder = {
    select: vi.fn((cols: string) => {
      readCols.push(cols)
      const reads = opts.reads ?? []
      const result = reads[Math.min(readCalls, reads.length - 1)] ?? { data: [], error: null }
      readCalls++
      return { in: vi.fn(() => Promise.resolve(result)) }
    }),
    update: vi.fn((payload: Record<string, unknown>) => {
      writePayloads.push(payload)
      return {
        in: vi.fn((_col: string, ids: number[]) => {
          writeChunks.push(ids)
          return {
            select: vi.fn(() => {
              const writes = opts.writes ?? []
              const configured = writes[Math.min(writeCalls, writes.length - 1)]
              writeCalls++
              if (typeof configured === "function") return Promise.resolve(configured(ids))
              if (configured) return Promise.resolve(configured)
              return Promise.resolve({ data: ids.map((id) => ({ id })), error: null })
            }),
          }
        }),
      }
    }),
  }
  vi.mocked(createServiceClient).mockResolvedValue({ from: vi.fn(() => builder) } as never)
  return { builder, readCols, writePayloads, writeChunks }
}

function bulkRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/admin/products/bulk", {
    method: "POST",
    body: JSON.stringify(body),
  })
}

describe("/api/admin/products/bulk", () => {
  beforeEach(() => vi.clearAllMocks())

  it("403 sin rol admin y sin tocar la base de datos", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({
      user: null,
      response: new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }),
    } as never)
    const res = await POST(bulkRequest({ ids: [1], patch: { is_visible: false } }))
    expect(res.status).toBe(403)
    expect(createServiceClient).not.toHaveBeenCalled()
    expect(logAdminAction).not.toHaveBeenCalled()
  })

  it("400 si ids está vacío", async () => {
    asAdmin()
    const res = await POST(bulkRequest({ ids: [], patch: { is_visible: false } }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain("vacío")
  })

  it("400 si algún id no es un entero positivo", async () => {
    asAdmin()
    for (const ids of [[1, "2"], [1, 0], [1, 2.5], "1"]) {
      const res = await POST(bulkRequest({ ids, patch: { is_visible: false } }))
      expect(res.status).toBe(400)
    }
  })

  it("400 si se supera el tope de ids por llamada", async () => {
    asAdmin()
    const ids = Array.from({ length: MAX_BULK_IDS + 1 }, (_, i) => i + 1)
    const res = await POST(bulkRequest({ ids, patch: { is_visible: false } }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain(String(MAX_BULK_IDS))
  })

  it("400 con campos fuera de la whitelist de lote", async () => {
    asAdmin()
    const res = await POST(bulkRequest({ ids: [1, 2], patch: { name: "Todos iguales" } }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain("name")
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it("400 si el patch no aporta campos válidos", async () => {
    asAdmin()
    const res = await POST(bulkRequest({ ids: [1], patch: {} }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain("no hay campos válidos")
  })

  it("400 si se envían patch y patches a la vez, o ninguno", async () => {
    asAdmin()
    const both = await POST(
      bulkRequest({ ids: [1], patch: { unit: "kg" }, patches: { "1": { unit: "kg" } } })
    )
    expect(both.status).toBe(400)
    expect((await both.json()).error).toContain("no ambos")

    const none = await POST(bulkRequest({ ids: [1] }))
    expect(none.status).toBe(400)
    expect((await none.json()).error).toContain("se requiere")
  })

  it("200 con parches por producto y una sola petición por parche distinto", async () => {
    asAdmin()
    const { writePayloads } = serviceWith({})
    const res = await POST(
      bulkRequest({
        ids: [1, 2, 3],
        patches: {
          "1": { price: 10 },
          "2": { price: 10 },
          "3": { price: 25 },
        },
      })
    )
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ updated: [1, 2, 3], failed: [] })
    // Dos valores distintos ⇒ dos sentencias, no tres.
    expect(writePayloads).toEqual(expect.arrayContaining([{ price: 10 }, { price: 25 }]))
    expect(writePayloads).toHaveLength(2)

    const entry = vi.mocked(logAdminAction).mock.calls[0]![1]
    // Sin parche uniforme, la bitácora guarda un resumen en vez de N payloads.
    expect(entry.detail).not.toHaveProperty("patch")
    expect(entry.detail).toMatchObject({ patchCount: 2, fields: ["price"], count: 3 })
  })

  it("guarda el parche uniforme cuando todos los ids reciben el mismo valor", async () => {
    asAdmin()
    serviceWith({})
    await POST(
      bulkRequest({ ids: [1, 2], patches: { "1": { unit: "kg" }, "2": { unit: "kg" } } })
    )
    const entry = vi.mocked(logAdminAction).mock.calls[0]![1]
    expect(entry.detail).toMatchObject({ patch: { unit: "kg" }, count: 2 })
  })

  it("400 si patches omite un id, incluye un id desconocido o un campo no permitido", async () => {
    asAdmin()
    const missing = await POST(bulkRequest({ ids: [1, 2], patches: { "1": { unit: "kg" } } }))
    expect(missing.status).toBe(400)
    expect((await missing.json()).error).toContain("no incluye el id 2")

    const unknown = await POST(bulkRequest({ ids: [1], patches: { "1": { unit: "kg" }, "9": { unit: "kg" } } }))
    expect(unknown.status).toBe(400)
    expect((await unknown.json()).error).toContain("id desconocido 9")

    const rejected = await POST(bulkRequest({ ids: [1], patches: { "1": { sku: "ABC" } } }))
    expect(rejected.status).toBe(400)
    expect((await rejected.json()).error).toContain("patches[1]")
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it("400 si un valor del patch no pasa la validación compartida con update", async () => {
    asAdmin()
    const res = await POST(bulkRequest({ ids: [1], patch: { price: -3 } }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain("price")
  })

  it("200 aplica el parche uniforme en una sola sentencia y deja una bitácora agrupada", async () => {
    asAdmin()
    const { writePayloads, writeChunks } = serviceWith({})
    const res = await POST(bulkRequest({ ids: [1, 2, 3], patch: { is_visible: false } }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ updated: [1, 2, 3], failed: [] })

    expect(writePayloads).toHaveLength(1)
    // Publicar/despublicar manual cancela la programación pendiente.
    expect(writePayloads[0]).toEqual({ is_visible: false, publish_at: null, unpublish_at: null })
    expect(writeChunks[0]).toEqual([1, 2, 3])

    expect(logAdminAction).toHaveBeenCalledTimes(1)
    const entry = vi.mocked(logAdminAction).mock.calls[0]![1]
    expect(entry.action).toBe("product_bulk_update")
    expect(entry.detail).toMatchObject({ ids: [1, 2, 3], count: 3, failed: [] })
    expect(entry.detail!.patch).toEqual({ is_visible: false, publish_at: null, unpublish_at: null })
  })

  it("trocea la escritura en bloques de 200 ids", async () => {
    asAdmin()
    const ids = Array.from({ length: 450 }, (_, i) => i + 1)
    const { writeChunks } = serviceWith({})
    const res = await POST(bulkRequest({ ids, patch: { unit: "kg" } }))
    expect(res.status).toBe(200)
    expect((await res.json()).updated).toHaveLength(450)
    expect(writeChunks.map((c) => c.length)).toEqual([200, 200, 50])
  })

  it("reporta fallos parciales con el id concreto", async () => {
    asAdmin()
    serviceWith({ writes: [{ data: [{ id: 1 }, { id: 3 }], error: null }] })
    const res = await POST(bulkRequest({ ids: [1, 2, 3], patch: { is_visible: true } }))
    expect(await res.json()).toEqual({
      updated: [1, 3],
      failed: [{ id: 2, reason: "El producto no existe" }],
    })
    const entry = vi.mocked(logAdminAction).mock.calls[0]![1]
    expect(entry.detail).toMatchObject({ count: 2 })
  })

  it("atribuye el error de escritura a todo el bloque", async () => {
    asAdmin()
    serviceWith({ writes: [{ error: { code: "42501", message: "denied" } }] })
    const res = await POST(bulkRequest({ ids: [1, 2], patch: { is_visible: true } }))
    expect(await res.json()).toEqual({
      updated: [],
      failed: [
        { id: 1, reason: "denied" },
        { id: 2, reason: "denied" },
      ],
    })
  })

  it("deriva stock_status con el umbral de cada producto", async () => {
    asAdmin()
    const { readCols, writePayloads } = serviceWith({
      reads: [
        {
          data: [
            { id: 1, low_stock_threshold: 3 },
            { id: 2, low_stock_threshold: 10 },
          ],
          error: null,
        },
      ],
    })
    const res = await POST(bulkRequest({ ids: [1, 2], patch: { stock_quantity: 5 } }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ updated: [1, 2], failed: [] })

    // Los umbrales se leen antes de escribir.
    expect(readCols[0]).toContain("low_stock_threshold")
    // Dos umbrales ⇒ dos grupos ⇒ una sentencia por grupo, cada una con su status.
    expect(writePayloads).toHaveLength(2)
    expect(writePayloads).toEqual(
      expect.arrayContaining([
        { stock_quantity: 5, stock_status: "in_stock" },
        { stock_quantity: 5, stock_status: "low_stock" },
      ])
    )
  })

  it("reintenta sin low_stock_threshold si la migración 00108 no está aplicada", async () => {
    asAdmin()
    const { writePayloads } = serviceWith({
      reads: [{ data: null, error: READ_MISSING_COLUMN }, { data: [], error: null }],
      writes: [{ error: WRITE_MISSING_COLUMN }, { error: null }],
    })
    const res = await POST(
      bulkRequest({ ids: [1], patch: { low_stock_threshold: 2, is_visible: false } })
    )
    expect(res.status).toBe(200)
    expect(writePayloads).toHaveLength(2)
    expect(writePayloads[0]).toMatchObject({ low_stock_threshold: 2, is_visible: false })
    expect(writePayloads[1]).not.toHaveProperty("low_stock_threshold")
    expect(writePayloads[1]).toMatchObject({ is_visible: false })
  })
})
