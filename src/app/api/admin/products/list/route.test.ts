import { beforeEach, describe, expect, it, vi, type Mock } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }))
vi.mock("@/lib/admin-auth", () => ({ requireAdmin: vi.fn() }))

import { GET } from "./route"
import { createServiceClient } from "@/lib/supabase/service"
import { requireAdmin } from "@/lib/admin-auth"

const ROWS = [
  { id: 1, name: "Aceite", brand: "Marca", tags: ["oferta"] },
  { id: 2, name: "Arroz", brand: null, tags: null },
]

/** Filas que devuelve la consulta de conteo por categoría (select solo
 *  `category_id`): una sin categoría no debe aparecer en el tally. */
const CATEGORY_ROWS = [
  { category_id: 1 },
  { category_id: 1 },
  { category_id: 3 },
  { category_id: null },
]

/** Filas de `product_city_availability` (fallback sin RPC): el producto 1 tiene
 *  filas pero ninguna ciudad activa, así que cuenta como "sin ciudades". */
const AVAILABILITY_ROWS = [
  { product_id: 1, city_id: 1, is_available: false },
  { product_id: 2, city_id: 1, is_available: true },
]

/**
 * Filas que devuelve cada consulta según sus columnas. Cada `select` obtiene su
 * propia cadena, así que dos consultas concurrentes sobre el mismo cliente
 * falso (el `Promise.all` de conteos) no se pisan las filas entre sí.
 */
function rowsFor(cols: string): unknown[] {
  if (cols === "category_id") return CATEGORY_ROWS
  if (cols.includes("is_available")) return AVAILABILITY_ROWS
  return ROWS
}

const CHAIN_METHODS = [
  "is",
  "not",
  "eq",
  "in",
  "ilike",
  "or",
  "contains",
  "lt",
  "limit",
  "order",
  "range",
] as const

type ChainMethod = (typeof CHAIN_METHODS)[number]

type ChainSpies = Record<ChainMethod | "select", Mock>

/**
 * Builder falso que imita al de PostgREST: encadena devolviendo el mismo
 * objeto y, como es "thenable", al `await`-lo resuelve al resultado ya
 * ejecutado (`{ data, error, count }`) en vez de al propio builder.
 *
 * `select` devuelve una cadena NUEVA ligada a las filas de esas columnas; el
 * resto de métodos delega en espías compartidos, que son los que afirman los
 * tests.
 */
function fakeBuilder() {
  const spies = {} as ChainSpies
  for (const name of [...CHAIN_METHODS, "select"] as const) spies[name] = vi.fn()

  function makeChain(rows: unknown[]): Record<string, unknown> {
    const chain: Record<string, unknown> = {
      select: (cols: string) => {
        spies.select(cols)
        return makeChain(rowsFor(cols))
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

  const entry = makeChain(ROWS)
  return { entry, spies }
}

function mockClient() {
  const { entry, spies } = fakeBuilder()
  vi.mocked(createServiceClient).mockResolvedValue({ from: vi.fn(() => entry) } as never)
  return { spies, order: spies.order, range: spies.range }
}

/**
 * Cliente falso con `rpc`: `admin_product_filter_counts` responde con el
 * payload agregado de 00115 y el resto de funciones falla (como en un esquema
 * sin ellas). Permite probar el camino sin paginar el catálogo.
 */
function mockClientWithRpc(filterCountsPayload: unknown) {
  const { entry, spies } = fakeBuilder()
  const rpc = vi.fn((fn: string) =>
    Promise.resolve(
      fn === "admin_product_filter_counts"
        ? { data: filterCountsPayload, error: null }
        : { data: null, error: { message: `function ${fn} does not exist` } }
    )
  )
  vi.mocked(createServiceClient).mockResolvedValue({ from: vi.fn(() => entry), rpc } as never)
  return { spies, order: spies.order, range: spies.range, rpc }
}

function listRequest(query = "page=1&pageSize=2") {
  return new NextRequest(`http://localhost/api/admin/products/list?${query}`)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(requireAdmin).mockResolvedValue({ user: { id: "admin-1" }, response: null } as never)
})

describe("GET /api/admin/products/list", () => {
  it("ordena y pagina sobre el builder sin perder el encadenado", async () => {
    const { order, range } = mockClient()

    const res = await GET(listRequest())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.error).toBeUndefined()
    expect(body.rows).toHaveLength(2)
    // El orden se aplica al builder (no a un resultado ya ejecutado).
    expect(order).toHaveBeenCalledWith("name", { ascending: true, nullsFirst: false })
    expect(range).toHaveBeenCalledWith(0, 1)
  })

  it("aplica el orden por severidad de stock con dos llamadas encadenadas", async () => {
    const { order } = mockClient()

    const res = await GET(listRequest("sort=stock&dir=desc&page=1&pageSize=2"))

    expect(res.status).toBe(200)
    expect(order).toHaveBeenNthCalledWith(1, "stock_status", { ascending: false })
    expect(order).toHaveBeenNthCalledWith(2, "name", { ascending: true })
  })

  it("devuelve solo ids en modo idsOnly", async () => {
    mockClient()

    const res = await GET(listRequest("idsOnly=1&page=1&pageSize=2"))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.ids).toEqual([1, 2])
    expect(body.total).toBe(2)
  })

  it("trata un filtro presente pero vacío como 'sin filtro', no como filtro imposible", async () => {
    const { spies } = mockClient()

    // `?brand=` no debe convertirse en `eq("brand", "")` (0 filas, panel vacío
    // y sin error): el listado tiene que salir completo.
    const res = await GET(listRequest("category=&stock=&status=&city=&brand=&tag=&page=1&pageSize=2"))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.rows).toHaveLength(2)
    expect(spies.eq).not.toHaveBeenCalledWith("brand", "")
    expect(spies.eq).not.toHaveBeenCalledWith("stock_status", "")
    expect(spies.eq).not.toHaveBeenCalledWith("category_id", expect.anything())
    expect(spies.contains).not.toHaveBeenCalled()
  })

  it("sí aplica el filtro cuando el parámetro trae valor", async () => {
    const { spies } = mockClient()

    const res = await GET(listRequest("brand=Marca&tag=oferta&page=1&pageSize=2"))

    expect(res.status).toBe(200)
    expect(spies.eq).toHaveBeenCalledWith("brand", "Marca")
    expect(spies.contains).toHaveBeenCalledWith("tags", JSON.stringify(["oferta"]))
  })

  it("devuelve el conteo de productos por categoría para los chips", async () => {
    mockClient()

    const res = await GET(listRequest())
    const body = await res.json()

    expect(res.status).toBe(200)
    // Los productos sin categoría no entran en el tally (los cubre el chip
    // "Sin categoría" con `counts.noCategory`).
    expect(body.categoryCounts).toEqual({ "1": 2, "3": 1 })
  })

  it("calcula la disponibilidad solo de la página visible (clave ausente = global)", async () => {
    mockClient()

    const res = await GET(listRequest())
    const body = await res.json()

    expect(res.status).toBe(200)
    // El producto 1 tiene filas pero ninguna ciudad disponible; el 2 sí. Un
    // producto sin filas no aparece en el mapa (se pinta como "Global"), así
    // que el cliente no necesita descargar la tabla completa.
    expect(body.availability).toEqual({ "1": 0, "2": 1 })
  })

  it("usa el RPC agregado (00115) cuando está disponible, sin paginar el catálogo", async () => {
    const { rpc, spies } = mockClientWithRpc({
      noCitiesIds: [7, 9],
      dupNameIds: [11],
      underThresholdIds: [4, 5, 6],
      categoryCounts: { "1": 42, "3": 7 },
    })

    const res = await GET(listRequest("noCities=1&dupNames=1&underThreshold=1"))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(rpc).toHaveBeenCalledWith("admin_product_filter_counts", { p_include_deleted: false })
    // Los ids del RPC alimentan los filtros (sin tope de 1000 filas)...
    expect(spies.in).toHaveBeenCalledWith("id", [7, 9])
    expect(spies.in).toHaveBeenCalledWith("id", [11])
    expect(spies.in).toHaveBeenCalledWith("id", [4, 5, 6])
    // ...y los conteos de los chips salen del mismo payload.
    expect(body.counts.noCities).toBe(2)
    expect(body.counts.dupNames).toBe(1)
    expect(body.counts.underThreshold).toBe(3)
    expect(body.categoryCounts).toEqual({ "1": 42, "3": 7 })
  })

  it("cae a los helpers en JS si el RPC de conteos no existe (esquema sin 00115)", async () => {
    const { rpc } = mockClientWithRpc(null)

    const res = await GET(listRequest())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(rpc).toHaveBeenCalledWith("admin_product_filter_counts", { p_include_deleted: false })
    // Fallback: el tally sale de las filas paginadas del catálogo.
    expect(body.categoryCounts).toEqual({ "1": 2, "3": 1 })
  })
})
