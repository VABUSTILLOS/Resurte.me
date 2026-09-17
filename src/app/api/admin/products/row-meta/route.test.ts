import { beforeEach, describe, expect, it, vi, type Mock } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }))
vi.mock("@/lib/admin-auth", () => ({ requireAdmin: vi.fn() }))
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

import { GET } from "./route"
import { createServiceClient } from "@/lib/supabase/service"
import { requireAdmin } from "@/lib/admin-auth"
import { logger } from "@/lib/logger"
import { MAX_META_IDS } from "@/lib/admin-product-row-meta"

const CHAIN_METHODS = ["in", "is", "eq", "neq", "order", "limit"] as const

type ChainSpies = Record<(typeof CHAIN_METHODS)[number] | "select", Mock>

/**
 * Builder falso "thenable" (igual que el del listado): encadena devolviendo el
 * mismo objeto y, al await-earlo, resuelve a las filas de esas columnas. Un
 * `errorsByTable` simula una fuente caída sin tumbar a las demás.
 */
function fakeBuilder(
  rowsByTable: Record<string, unknown[]>,
  errorsByTable: Record<string, { message: string }> = {}
) {
  const spies = {} as ChainSpies
  for (const name of [...CHAIN_METHODS, "select"] as const) spies[name] = vi.fn()

  function makeChain(table: string, rows: unknown[] = []): Record<string, unknown> {
    const chain: Record<string, unknown> = {
      select: (cols: string) => {
        spies.select(cols)
        return makeChain(table, rowsByTable[table] ?? [])
      },
      then: (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
        Promise.resolve({
          data: errorsByTable[table] ? null : rows,
          error: errorsByTable[table] ?? null,
          count: rows.length,
        }).then(onFulfilled, onRejected),
    }
    for (const name of CHAIN_METHODS) {
      chain[name] = (...args: unknown[]) => {
        spies[name](...args)
        return chain
      }
    }
    return chain
  }

  const from = vi.fn((table: string) => makeChain(table))
  vi.mocked(createServiceClient).mockResolvedValue({ from } as never)
  return { spies, from }
}

function metaRequest(ids = "1,2") {
  return new NextRequest(`http://localhost/api/admin/products/row-meta?ids=${ids}`)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(requireAdmin).mockResolvedValue({ user: { id: "admin-1" }, response: null } as never)
})

describe("GET /api/admin/products/row-meta", () => {
  it("lee las ventas agregadas de products_with_sales", async () => {
    const { spies, from } = fakeBuilder({
      products_with_sales: [
        { id: 1, sales_units: 3, sales_revenue: 25 },
        { id: 2, sales_units: 4, sales_revenue: 10 },
      ],
    })

    const res = await GET(metaRequest())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.sales).toEqual({ "1": 3, "2": 4 })
    expect(body.salesAmount).toEqual({ "1": 25, "2": 10 })
    // La vista ya descarta los pedidos cancelados: la columna Ventas cuadra con
    // el orden "más vendidos" sin agregar order_items en cada página.
    expect(from).toHaveBeenCalledWith("products_with_sales")
    expect(spies.select).toHaveBeenCalledWith("id,sales_units,sales_revenue")
    expect(from).not.toHaveBeenCalledWith("order_items")
  })

  it("no consulta nada sin ids y devuelve el contrato completo", async () => {
    const { from } = fakeBuilder({})

    const res = await GET(metaRequest(""))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({
      waPending: [],
      lastEdit: {},
      sales: {},
      salesAmount: {},
      degraded: [],
    })
    expect(from).not.toHaveBeenCalled()
  })

  it("degrada la fuente caída y sigue entregando las demás", async () => {
    fakeBuilder(
      {
        whatsapp_sync_queue: [{ product_id: 1 }],
        admin_audit_log: [
          { entity_id: "1", actor_email: "a@x.com", created_at: "2026-01-01T00:00:00Z" },
        ],
      },
      { products_with_sales: { message: "relation does not exist" } }
    )

    const res = await GET(metaRequest())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.degraded).toEqual(["sales"])
    expect(body.waPending).toEqual([1])
    expect(body.lastEdit["1"]).toEqual({ at: "2026-01-01T00:00:00Z", email: "a@x.com" })
    expect(body.sales).toEqual({})
    expect(body.salesAmount).toEqual({})
    expect(logger.warn).toHaveBeenCalledWith(
      "products.row-meta.degraded",
      expect.objectContaining({ source: "sales" })
    )
  })

  it("deja rastro cuando la petición excede el tope de ids", async () => {
    fakeBuilder({})
    const ids = Array.from({ length: MAX_META_IDS + 1 }, (_, i) => i + 1).join(",")

    const res = await GET(metaRequest(ids))

    expect(res.status).toBe(200)
    expect(logger.warn).toHaveBeenCalledWith(
      "products.row-meta.truncated",
      expect.objectContaining({ requested: MAX_META_IDS + 1, max: MAX_META_IDS })
    )
  })
})
