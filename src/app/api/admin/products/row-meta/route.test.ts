import { beforeEach, describe, expect, it, vi, type Mock } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }))
vi.mock("@/lib/admin-auth", () => ({ requireAdmin: vi.fn() }))

import { GET } from "./route"
import { createServiceClient } from "@/lib/supabase/service"
import { requireAdmin } from "@/lib/admin-auth"

const CHAIN_METHODS = ["in", "is", "eq", "neq", "order", "limit"] as const

type ChainSpies = Record<(typeof CHAIN_METHODS)[number] | "select", Mock>

/**
 * Builder falso "thenable" (igual que el del listado): encadena devolviendo el
 * mismo objeto y, al await-earlo, resuelve a las filas de esas columnas.
 */
function fakeBuilder(rowsByTable: Record<string, unknown[]>) {
  const spies = {} as ChainSpies
  for (const name of [...CHAIN_METHODS, "select"] as const) spies[name] = vi.fn()

  function makeChain(table: string, rows: unknown[] = []): Record<string, unknown> {
    const chain: Record<string, unknown> = {
      select: (cols: string) => {
        spies.select(cols)
        return makeChain(table, rowsByTable[table] ?? [])
      },
      then: (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
        Promise.resolve({ data: rows, error: null, count: rows.length }).then(
          onFulfilled,
          onRejected
        ),
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
  it("cuenta unidades y monto excluyendo pedidos cancelados", async () => {
    const { spies, from } = fakeBuilder({
      order_items: [
        { product_id: 1, quantity: 2, unit_price: 10 },
        { product_id: 1, quantity: 1, unit_price: 5 },
        { product_id: 2, quantity: 4, unit_price: 2.5 },
      ],
    })

    const res = await GET(metaRequest())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.sales).toEqual({ "1": 3, "2": 4 })
    expect(body.salesAmount).toEqual({ "1": 25, "2": 10 })
    // La misma semántica que sales-report y que el orden "más vendidos": el
    // join es interno y el pedido cancelado no suma.
    expect(from).toHaveBeenCalledWith("order_items")
    expect(spies.select).toHaveBeenCalledWith("product_id,quantity,unit_price,orders!inner(status)")
    expect(spies.neq).toHaveBeenCalledWith("orders.status", "cancelled")
  })

  it("no consulta ventas sin ids", async () => {
    const { from } = fakeBuilder({})

    const res = await GET(metaRequest(""))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ waPending: [], lastEdit: {} })
    expect(from).not.toHaveBeenCalled()
  })
})
