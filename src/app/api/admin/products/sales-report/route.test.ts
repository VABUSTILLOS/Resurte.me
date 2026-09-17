import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }))
vi.mock("@/lib/admin-auth", () => ({ requireAdmin: vi.fn() }))

import { GET } from "./route"
import { createServiceClient } from "@/lib/supabase/service"
import { requireAdmin } from "@/lib/admin-auth"

interface FakeResult {
  data?: unknown
  error?: unknown
}

function asAdmin() {
  vi.mocked(requireAdmin).mockResolvedValue({ user: { id: "admin-1" }, response: null } as never)
}

/** Cliente Supabase falso: un resultado por tabla, en orden de consumo. */
function serviceWith(byTable: Record<string, FakeResult | FakeResult[]>) {
  const cursors = new Map<string, number>()
  const selects: { table: string; columns: string }[] = []
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
    for (const op of ["eq", "neq", "in", "is", "not", "order", "limit", "range", "gte", "lte"]) {
      builder[op] = vi.fn((...args: unknown[]) => {
        filters.push({ table, op, args })
        return builder
      })
    }
    return thenable(builder, result)
  })

  vi.mocked(createServiceClient).mockResolvedValue({ from } as never)
  return { from, selects, filters }
}

const ORDERS = [
  {
    id: 1,
    order_items: [
      { product_id: 1, quantity: 2, unit_price: 100 },
      { product_id: 2, quantity: 1, unit_price: 50 },
    ],
  },
  { id: 2, order_items: [{ product_id: 1, quantity: 1, unit_price: 100 }] },
]

const PRODUCTS = [
  { id: 1, name: "Taco", cost: 20 },
  { id: 2, name: "Agua", cost: 5 },
]

function reportRequest(query = "") {
  return new NextRequest(`http://localhost/api/admin/products/sales-report${query}`)
}

/**
 * `response.text()` descarta el BOM al decodificar UTF-8, así que se lee el
 * cuerpo en bytes para poder afirmar que el CSV sí lo incluye (Excel lo necesita
 * para respetar los acentos).
 */
async function readCsv(response: Response) {
  const bytes = new Uint8Array(await response.arrayBuffer())
  return {
    bytes,
    csv: new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes),
  }
}

describe("/api/admin/products/sales-report", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("devuelve 403 y no toca Supabase si el admin es rechazado", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({
      user: null,
      response: new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }),
    } as never)

    const response = await GET(reportRequest("?from=2026-01-01&to=2026-01-31"))

    expect(response.status).toBe(403)
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it("devuelve 400 cuando from o to faltan o no son YYYY-MM-DD", async () => {
    asAdmin()

    const sinRango = await GET(reportRequest())
    const malFormato = await GET(reportRequest("?from=2026-1-1&to=2026-01-31"))
    const invertido = await GET(reportRequest("?from=2026-01-31&to=hoy"))

    expect(sinRango.status).toBe(400)
    expect(malFormato.status).toBe(400)
    expect(invertido.status).toBe(400)
    expect((await sinRango.json()).error).toBe("Se requieren from y to en formato YYYY-MM-DD")
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it("devuelve el CSV con BOM y nombre de archivo, consultando el rango inclusivo", async () => {
    asAdmin()
    const supabase = serviceWith({ orders: { data: ORDERS, error: null }, products: { data: PRODUCTS, error: null } })

    const response = await GET(reportRequest("?from=2026-01-01&to=2026-01-31"))
    const { bytes, csv } = await readCsv(response)

    expect(response.status).toBe(200)
    expect(response.headers.get("Content-Type")).toBe("text/csv; charset=utf-8")
    expect(response.headers.get("Content-Disposition")).toBe(
      'attachment; filename="ventas-2026-01-01_a_2026-01-31.csv"'
    )
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
    expect(csv.startsWith("\ufeffproducto,unidades,monto,costo,margen,margen_pct,clase_abc,participacion_pct")).toBe(
      true
    )
    expect(csv).toContain("Taco,3,300.00,60.00,240.00,80.0,A,85.71")
    expect(csv).toContain("Agua,1,50.00,5.00,45.00,90.0,B,14.29")
    expect(supabase.selects).toEqual([
      { table: "orders", columns: "id, order_items(product_id, quantity, unit_price)" },
      { table: "products", columns: "id,name,cost" },
    ])
    expect(supabase.filters).toEqual([
      { table: "orders", op: "gte", args: ["created_at", "2026-01-01T00:00:00Z"] },
      { table: "orders", op: "lte", args: ["created_at", "2026-01-31T23:59:59Z"] },
      { table: "orders", op: "neq", args: ["status", "cancelled"] },
      { table: "orders", op: "limit", args: [10_000] },
      { table: "products", op: "in", args: ["id", [1, 2]] },
    ])
  })

  it("con format=json devuelve las filas y los insights del rango", async () => {
    asAdmin()
    serviceWith({ orders: { data: ORDERS, error: null }, products: { data: PRODUCTS, error: null } })

    const response = await GET(reportRequest("?from=2026-01-01&to=2026-01-31&format=json"))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.from).toBe("2026-01-01")
    expect(json.to).toBe("2026-01-31")
    expect(json.rows).toHaveLength(2)
    expect(json.rows[0]).toMatchObject({
      productId: 1,
      name: "Taco",
      units: 3,
      revenue: 300,
      unitCost: 20,
      margin: 240,
      marginPct: 80,
      abc: "A",
    })
    expect(json.rows[1]).toMatchObject({ productId: 2, name: "Agua", abc: "B" })
    expect(json.insights).toMatchObject({
      products: 2,
      units: 4,
      revenue: 350,
      margin: 285,
      missingCost: 0,
      abc: { A: 1, B: 1, C: 0 },
      topRevenue: { name: "Taco", revenue: 300 },
      topUnits: { name: "Taco", units: 3 },
      bestMargin: { name: "Agua", marginPct: 90 },
      worstMargin: { name: "Taco", marginPct: 80 },
    })
  })

  it("degrada sin margen cuando la columna cost no existe en el entorno", async () => {
    asAdmin()
    const supabase = serviceWith({
      orders: { data: ORDERS, error: null },
      products: [
        {
          data: null,
          error: {
            code: "42703",
            message: "column products.cost does not exist",
          },
        },
        { data: [{ id: 1, name: "Taco" }, { id: 2, name: "Agua" }], error: null },
      ],
    })

    const response = await GET(reportRequest("?from=2026-01-01&to=2026-01-31&format=json"))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.rows[0].margin).toBeNull()
    expect(json.rows[0].marginPct).toBeNull()
    expect(json.insights.margin).toBeNull()
    expect(json.insights.missingCost).toBe(2)
    expect(supabase.selects).toEqual([
      { table: "orders", columns: "id, order_items(product_id, quantity, unit_price)" },
      { table: "products", columns: "id,name,cost" },
      { table: "products", columns: "id,name" },
    ])
  })

  it("devuelve 500 cuando falla la lectura de pedidos", async () => {
    asAdmin()
    serviceWith({ orders: { data: null, error: { message: "relation does not exist" } } })

    const response = await GET(reportRequest("?from=2026-01-01&to=2026-01-31"))
    const json = await response.json()

    expect(response.status).toBe(500)
    expect(json.error).toBe("relation does not exist")
  })

  it("no consulta productos cuando no hay ventas en el rango", async () => {
    asAdmin()
    const supabase = serviceWith({ orders: { data: [], error: null } })

    const response = await GET(reportRequest("?from=2026-01-01&to=2026-01-31"))
    const { csv } = await readCsv(response)

    expect(response.status).toBe(200)
    expect(csv).toBe("\ufeffproducto,unidades,monto,costo,margen,margen_pct,clase_abc,participacion_pct")
    expect(supabase.selects).toHaveLength(1)
  })
})
