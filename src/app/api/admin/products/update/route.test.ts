import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }))
vi.mock("@/lib/admin-auth", () => ({ requireAdmin: vi.fn() }))
vi.mock("@/lib/catalog-cache", () => ({ revalidateCatalogCache: vi.fn() }))
vi.mock("@/lib/catalog", () => ({ resetCatalogCache: vi.fn() }))
vi.mock("@/lib/audit-log", () => ({ logAdminAction: vi.fn() }))
vi.mock("@/lib/whatsapp-sync-queue", () => ({ enqueueProductsForWaSync: vi.fn() }))

import { PATCH } from "./route"
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

function asAdmin() {
  vi.mocked(requireAdmin).mockResolvedValue({ user: { id: "admin-1" }, response: null } as never)
}

/**
 * Cliente Supabase falso para el PATCH: `select()` sirve la lectura de la fila
 * actual y `update()` las escrituras (con reintento).
 */
function serviceWith(opts: {
  reads: { data: unknown; error: unknown }[]
  writes: { error: unknown; data?: unknown }[]
}) {
  let readCalls = 0
  let writeCalls = 0
  const writePayloads: unknown[] = []
  const readCols: string[] = []

  const builder: Record<string, unknown> = {
    select: vi.fn((cols: string) => {
      readCols.push(cols)
      const result = opts.reads[Math.min(readCalls, opts.reads.length - 1)]
      readCalls++
      return { eq: vi.fn(() => ({ maybeSingle: vi.fn(() => Promise.resolve(result)) })) }
    }),
    update: vi.fn((payload: unknown) => {
      writePayloads.push(payload)
      const result = opts.writes[Math.min(writeCalls, opts.writes.length - 1)] ?? { error: null }
      writeCalls++
      // El PATCH encadena `.select("id")` para distinguir "actualizado" de
      // "ya no existe"; el fake imita esa forma.
      const terminal = {
        error: result.error,
        data: result.error ? null : (result.data ?? [{ id: 1 }]),
      }
      return { eq: vi.fn(() => ({ select: vi.fn(() => Promise.resolve(terminal)) })) }
    }),
  }
  vi.mocked(createServiceClient).mockResolvedValue({ from: vi.fn(() => builder) } as never)
  return { builder, writePayloads, readCols }
}

function patchRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/admin/products/update", {
    method: "PATCH",
    body: JSON.stringify(body),
  })
}

const CURRENT_ROW = {
  name: "Taco",
  price: 20,
  stock_quantity: 2,
  low_stock_threshold: 3,
  stock_status: "low_stock",
  deleted_at: null,
  updated_at: "2026-01-01T00:00:00.000Z",
}

// B19 — versiones de la fila para las pruebas de concurrencia optimista.
const V1 = "2026-01-01T00:00:00.000Z"
const V2 = "2026-01-02T00:00:00.000Z"

describe("/api/admin/products/update", () => {
  beforeEach(() => vi.clearAllMocks())

  it("403 sin rol admin", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({
      user: null,
      response: new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }),
    } as never)
    const res = await PATCH(patchRequest({ productId: 1, price: 30 }))
    expect(res.status).toBe(403)
  })

  it("200 con el umbral cuando la migración 00108 ya está aplicada", async () => {
    asAdmin()
    const { writePayloads, readCols } = serviceWith({
      reads: [{ data: CURRENT_ROW, error: null }],
      writes: [{ error: null }],
    })
    const res = await PATCH(patchRequest({ productId: 1, price: 30, low_stock_threshold: 3 }))
    expect(res.status).toBe(200)
    expect(readCols[0]).toContain("low_stock_threshold")
    expect(writePayloads).toHaveLength(1)
    expect(writePayloads[0]).toMatchObject({ price: 30 })
  })

  it("200 degrada la lectura y el PATCH si la columna no existe", async () => {
    asAdmin()
    const { writePayloads, readCols } = serviceWith({
      reads: [
        { data: null, error: READ_MISSING_COLUMN },
        { data: { ...CURRENT_ROW, low_stock_threshold: undefined }, error: null },
      ],
      writes: [{ error: WRITE_MISSING_COLUMN }, { error: null }],
    })
    const res = await PATCH(
      patchRequest({ productId: 1, price: 30, stock_quantity: 2, low_stock_threshold: 3 })
    )
    // Antes del arreglo: 500 en la lectura Y, aun sin ella, en el PATCH.
    expect(res.status).toBe(200)

    // La lectura se reintenta sin el umbral.
    expect(readCols).toHaveLength(2)
    expect(readCols[0]).toContain("low_stock_threshold")
    expect(readCols[1]).not.toContain("low_stock_threshold")

    // El PATCH se reintenta sin el umbral, conservando el resto de la edición.
    expect(writePayloads).toHaveLength(2)
    expect(writePayloads[0]).toMatchObject({ price: 30, low_stock_threshold: 3 })
    expect(writePayloads[1]).not.toHaveProperty("low_stock_threshold")
    expect(writePayloads[1]).toMatchObject({ price: 30, stock_quantity: 2 })
  })

  it("omite el umbral del diff de auditoría cuando la lectura degradó", async () => {
    asAdmin()
    const { writePayloads } = serviceWith({
      reads: [
        { data: null, error: READ_MISSING_COLUMN },
        { data: { ...CURRENT_ROW, low_stock_threshold: undefined }, error: null },
      ],
      writes: [{ error: WRITE_MISSING_COLUMN }, { error: null }],
    })
    await PATCH(patchRequest({ productId: 1, price: 30, low_stock_threshold: 3 }))
    expect(writePayloads[1]).not.toHaveProperty("low_stock_threshold")

    const detail = vi.mocked(logAdminAction).mock.calls[0]![1].detail as {
      before?: Record<string, unknown>
      after?: Record<string, unknown>
    }
    // Un `null` inventado haría parecer que el umbral cambió desde "sin valor".
    expect(detail.before ?? {}).not.toHaveProperty("low_stock_threshold")
    expect(detail.after ?? {}).not.toHaveProperty("low_stock_threshold")
    // El resto del diff sí se registra.
    expect(detail.after).toMatchObject({ price: 30 })
  })

  it("500 si el reintento del PATCH vuelve a fallar", async () => {
    asAdmin()
    serviceWith({
      reads: [{ data: CURRENT_ROW, error: null }],
      writes: [{ error: WRITE_MISSING_COLUMN }, { error: { code: "42501", message: "denied" } }],
    })
    const res = await PATCH(patchRequest({ productId: 1, price: 30, low_stock_threshold: 3 }))
    expect(res.status).toBe(500)
    expect((await res.json()).error).toContain("denied")
  })

  it("400 sin productId", async () => {
    asAdmin()
    const res = await PATCH(patchRequest({ price: 30 }))
    expect(res.status).toBe(400)
  })

  // ---------- B19: concurrencia optimista ----------

  it("409 sin escribir cuando la fila cambió desde que el panel la leyó", async () => {
    asAdmin()
    const { writePayloads, readCols } = serviceWith({
      reads: [{ data: { ...CURRENT_ROW, updated_at: V2 }, error: null }],
      writes: [{ error: null }],
    })
    const res = await PATCH(patchRequest({ productId: 1, price: 30, expectedUpdatedAt: V1 }))
    expect(res.status).toBe(409)

    const body = await res.json()
    expect(body.code).toBe("stale_write")
    expect(body.field).toBeNull()
    expect(body.conflict.currentUpdatedAt).toBe(V2)
    // La fila vigente viaja para que el panel se resincronice sin otra lectura.
    expect(body.conflict.current).toMatchObject({ name: "Taco", price: 20 })
    expect(body.error).toContain("Recarga")

    // Lo importante: el cambio ajeno no se pisa.
    expect(writePayloads).toHaveLength(0)
    // Y la lectura pide `updated_at` para poder comparar.
    expect(readCols[0]).toContain("updated_at")
  })

  it("200 y sella `updated_at` cuando la versión enviada es la vigente", async () => {
    asAdmin()
    const { writePayloads } = serviceWith({
      reads: [{ data: { ...CURRENT_ROW, updated_at: V1 }, error: null }],
      writes: [{ error: null }],
    })
    const res = await PATCH(patchRequest({ productId: 1, price: 30, expectedUpdatedAt: V1 }))
    expect(res.status).toBe(200)

    // Cada escritura mueve la versión, que es justo lo que compara el guard.
    const stamped = writePayloads[0] as Record<string, unknown>
    expect(typeof stamped.updated_at).toBe("string")
    expect(Number.isFinite(Date.parse(stamped.updated_at as string))).toBe(true)

    // Y la versión nueva vuelve al panel: sin ella, su siguiente edición
    // chocaría con su propia escritura anterior.
    const body = await res.json()
    expect(body.updated_at).toBe(stamped.updated_at)
    expect(body.success).toBe(true)
  })

  it("no bloquea si el `updated_at` vigente es anterior al esperado", async () => {
    asAdmin()
    const { writePayloads } = serviceWith({
      // Reloj desfasado o una importación que reescribió la fecha hacia atrás.
      reads: [{ data: { ...CURRENT_ROW, updated_at: V1 }, error: null }],
      writes: [{ error: null }],
    })
    const res = await PATCH(patchRequest({ productId: 1, price: 30, expectedUpdatedAt: V2 }))
    expect(res.status).toBe(200)
    expect(writePayloads).toHaveLength(1)
  })

  it("sin `expectedUpdatedAt` mantiene el comportamiento anterior", async () => {
    asAdmin()
    const { writePayloads } = serviceWith({
      reads: [{ data: { ...CURRENT_ROW, updated_at: V2 }, error: null }],
      writes: [{ error: null }],
    })
    const res = await PATCH(patchRequest({ productId: 1, price: 30 }))
    expect(res.status).toBe(200)
    expect(writePayloads).toHaveLength(1)
  })

  it("404 si el producto desapareció entre la lectura y la escritura", async () => {
    asAdmin()
    // Sin `.select("id")` PostgREST no devuelve error al no tocar ninguna fila:
    // el panel mostraba "guardado" sobre un producto que ya no existía.
    serviceWith({
      reads: [{ data: CURRENT_ROW, error: null }],
      writes: [{ error: null, data: [] }],
    })
    const res = await PATCH(patchRequest({ productId: 1, price: 30 }))
    expect(res.status).toBe(404)
    expect((await res.json()).error).toContain("ya no existe")
  })
})
