import { describe, expect, it } from "vitest"
import {
  MAX_META_IDS,
  parseMetaIds,
  parseRowMetaPayload,
  type RowMetaSources,
} from "./admin-product-row-meta"

function sources(overrides: Partial<RowMetaSources> = {}): RowMetaSources {
  return {
    queue: { ok: true, rows: [] },
    audit: { ok: true, rows: [] },
    sales: { ok: true, rows: [] },
    suppliers: { ok: true, rows: [] },
    ...overrides,
  }
}

describe("parseMetaIds", () => {
  it("acepta enteros positivos separados por coma", () => {
    expect(parseMetaIds("1,2,3")).toEqual([1, 2, 3])
    expect(parseMetaIds(" 7 , 8 ")).toEqual([7, 8])
  })

  it("descarta vacíos, no numéricos, cero y negativos", () => {
    expect(parseMetaIds("1,,abc,0,-5,2.5,3")).toEqual([1, 3])
  })

  it("elimina duplicados", () => {
    expect(parseMetaIds("4,4,4,5")).toEqual([4, 5])
  })

  it("trata null/undefined/'' como lista vacía", () => {
    expect(parseMetaIds(null)).toEqual([])
    expect(parseMetaIds(undefined)).toEqual([])
    expect(parseMetaIds("")).toEqual([])
  })

  it("acota a MAX_META_IDS", () => {
    const raw = Array.from({ length: MAX_META_IDS + 50 }, (_, i) => i + 1).join(",")
    expect(parseMetaIds(raw)).toHaveLength(MAX_META_IDS)
    expect(parseMetaIds(raw).at(-1)).toBe(MAX_META_IDS)
  })
})

describe("parseRowMetaPayload", () => {
  it("deduplica ids pendientes de WhatsApp y descarta product_id nulo", () => {
    const payload = parseRowMetaPayload(
      sources({
        queue: {
          ok: true,
          rows: [{ product_id: 1 }, { product_id: 1 }, { product_id: 2 }, { product_id: null }],
        },
      })
    )

    expect(payload.waPending).toEqual([1, 2])
    expect(payload.degraded).toEqual([])
  })

  it("se queda con la primera fila de auditoría por producto (orden desc)", () => {
    const payload = parseRowMetaPayload(
      sources({
        audit: {
          ok: true,
          rows: [
            { entity_id: "1", actor_email: "nuevo@x.com", created_at: "2026-02-02T00:00:00Z" },
            { entity_id: "1", actor_email: "viejo@x.com", created_at: "2026-01-01T00:00:00Z" },
            { entity_id: "2", actor_email: null, created_at: "2026-01-15T00:00:00Z" },
          ],
        },
      })
    )

    expect(payload.lastEdit["1"]).toEqual({
      at: "2026-02-02T00:00:00Z",
      email: "nuevo@x.com",
    })
    expect(payload.lastEdit["2"]).toEqual({ at: "2026-01-15T00:00:00Z", email: null })
  })

  it("acumula ventas y tolera numéricos como cadena o nulos", () => {
    const payload = parseRowMetaPayload(
      sources({
        sales: {
          ok: true,
          rows: [
            { id: 1, sales_units: "3", sales_revenue: "25.50" },
            { id: 1, sales_units: 2, sales_revenue: null },
            { id: 2, sales_units: null, sales_revenue: "10" },
            { id: 3, sales_units: "no-num", sales_revenue: undefined as unknown as null },
          ],
        },
      })
    )

    expect(payload.sales).toEqual({ "1": 5, "2": 0, "3": 0 })
    expect(payload.salesAmount).toEqual({ "1": 25.5, "2": 10, "3": 0 })
  })

  it("degrada solo la fuente que falló y conserva las demás", () => {
    const payload = parseRowMetaPayload(
      sources({
        queue: { ok: false, rows: [{ product_id: 9 }] },
        sales: { ok: false, rows: [{ id: 9, sales_units: 5, sales_revenue: 50 }] },
        audit: {
          ok: true,
          rows: [{ entity_id: "9", actor_email: "a@x.com", created_at: "2026-01-01T00:00:00Z" }],
        },
      })
    )

    expect(payload.degraded).toEqual(["queue", "sales"])
    // Lo que sí llegó se entrega: una fuente caída no borra a las otras.
    expect(payload.waPending).toEqual([])
    expect(payload.sales).toEqual({})
    expect(payload.salesAmount).toEqual({})
    expect(payload.lastEdit["9"]).toEqual({ at: "2026-01-01T00:00:00Z", email: "a@x.com" })
  })

  it("sin fuentes caídas no declara degradación y siempre trae las cinco claves", () => {
    const payload = parseRowMetaPayload(sources())
    expect(payload).toEqual({
      waPending: [],
      lastEdit: {},
      sales: {},
      salesAmount: {},
      suppliers: {},
      degraded: [],
    })
  })

  it("marca el proveedor de cada producto", () => {
    const payload = parseRowMetaPayload(
      sources({
        suppliers: {
          ok: true,
          rows: [
            { product_id: 1, is_primary: true, supplier_name: "FRUGASA" },
            { product_id: 2, is_primary: true, supplier_name: "AB Foods" },
          ],
        },
      })
    )
    expect(payload.suppliers).toEqual({ "1": "FRUGASA", "2": "AB Foods" })
  })

  it("con varios vínculos gana el primario, sin importar el orden de llegada", () => {
    const rows = [
      { product_id: 7, is_primary: false, supplier_name: "Secundario" },
      { product_id: 7, is_primary: true, supplier_name: "Primario" },
    ]
    expect(parseRowMetaPayload(sources({ suppliers: { ok: true, rows } })).suppliers).toEqual({
      "7": "Primario",
    })
    // El orden inverso no debe cambiar el resultado.
    expect(
      parseRowMetaPayload(sources({ suppliers: { ok: true, rows: [...rows].reverse() } })).suppliers
    ).toEqual({ "7": "Primario" })
  })

  it("ignora vínculos sin nombre de proveedor o sin producto", () => {
    const payload = parseRowMetaPayload(
      sources({
        suppliers: {
          ok: true,
          rows: [
            { product_id: null, is_primary: true, supplier_name: "Fantasma" },
            { product_id: 3, is_primary: true, supplier_name: null },
            { product_id: 4, is_primary: true, supplier_name: "Real" },
          ],
        },
      })
    )
    expect(payload.suppliers).toEqual({ "4": "Real" })
  })

  it("si la fuente de proveedores falla, degrada y deja el mapa vacío", () => {
    const payload = parseRowMetaPayload(
      sources({
        suppliers: { ok: false, rows: [{ product_id: 1, is_primary: true, supplier_name: "X" }] },
      })
    )
    expect(payload.degraded).toEqual(["suppliers"])
    expect(payload.suppliers).toEqual({})
  })
})
