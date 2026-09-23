import { describe, expect, it } from "vitest"
import {
  EMPTY_CITY_SUMMARY,
  SUPPLIER_CITY_MODES,
  SUPPLIER_FILTER_NONE,
  parseSupplierOverview,
  supplierCityLabel,
  supplierCityPlan,
  supplierFilterLabel,
  supplierFilterValue,
  summarizeSupplierCities,
  type SupplierCitySummary,
} from "./admin-supplier-panel"

const CITIES = [{ id: 1 }, { id: 2 }, { id: 3 }]

function summary(overrides: Partial<SupplierCitySummary> = {}): SupplierCitySummary {
  return { ...EMPTY_CITY_SUMMARY, ...overrides }
}

describe("summarizeSupplierCities", () => {
  it("sin filas es global", () => {
    const s = summarizeSupplierCities([], CITIES, [10, 11])
    expect(s.global).toBe(true)
    expect(s.availableCount).toBe(3)
    expect(s.totalCities).toBe(3)
    expect(s.availableCityIds).toEqual([1, 2, 3])
  })

  it("una fila en false saca esa ciudad del conteo", () => {
    const s = summarizeSupplierCities(
      [{ product_id: 10, city_id: 2, is_available: false }],
      CITIES,
      [10]
    )
    expect(s.global).toBe(false)
    expect(s.availableCount).toBe(2)
    expect(s.availableCityIds).toEqual([1, 3])
  })

  it("una fila en true NO vuelve global al proveedor", () => {
    // La existencia de la fila es lo que rompe el default global, aunque diga
    // "disponible": a partir de ahí solo cuenta lo que tenga fila.
    const s = summarizeSupplierCities(
      [{ product_id: 10, city_id: 1, is_available: true }],
      CITIES,
      [10]
    )
    expect(s.global).toBe(false)
  })

  it("ignora filas de productos de OTRO proveedor", () => {
    const s = summarizeSupplierCities(
      [{ product_id: 99, city_id: 1, is_available: false }],
      CITIES,
      [10, 11]
    )
    expect(s.global).toBe(true)
    expect(s.availableCount).toBe(3)
  })

  it("basta un producto apagado para apagar la ciudad del proveedor", () => {
    const s = summarizeSupplierCities(
      [
        { product_id: 10, city_id: 1, is_available: true },
        { product_id: 11, city_id: 1, is_available: false },
      ],
      CITIES,
      [10, 11]
    )
    expect(s.availableCityIds).toEqual([2, 3])
  })

  it("sin ciudades activas no inventa disponibilidad", () => {
    const s = summarizeSupplierCities([], [], [10])
    expect(s.totalCities).toBe(0)
    expect(s.availableCount).toBe(0)
  })
})

describe("supplierCityPlan", () => {
  it("`all` manda scope y NO escribe celdas", () => {
    // Escribir true en las 20 dejaría filas que impiden heredar el default a
    // una ciudad nueva: la semántica de 00065 exige borrar.
    const r = supplierCityPlan("all", CITIES, new Set([1]))
    expect(r).toEqual({ ok: true, plan: { kind: "scope", scope: "all", isAvailable: true } })
  })

  it("`exclude` apaga solo las marcadas", () => {
    const r = supplierCityPlan("exclude", CITIES, new Set([1, 3]))
    expect(r).toEqual({
      ok: true,
      plan: {
        kind: "changes",
        changes: [
          { cityId: 1, isAvailable: false },
          { cityId: 3, isAvailable: false },
        ],
      },
    })
  })

  it("`only` deja true en las marcadas y false en el resto", () => {
    const r = supplierCityPlan("only", CITIES, new Set([2]))
    expect(r).toEqual({
      ok: true,
      plan: {
        kind: "changes",
        changes: [
          { cityId: 1, isAvailable: false },
          { cityId: 2, isAvailable: true },
          { cityId: 3, isAvailable: false },
        ],
      },
    })
  })

  it("`only` con todas marcadas equivale a Global", () => {
    const r = supplierCityPlan("only", CITIES, new Set([1, 2, 3]))
    expect(r).toEqual({ ok: true, plan: { kind: "scope", scope: "all", isAvailable: true } })
  })

  it("exige selección en los modos que la necesitan", () => {
    for (const mode of ["exclude", "only"] as const) {
      const r = supplierCityPlan(mode, CITIES, new Set())
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.reason).toMatch(/al menos una ciudad/i)
    }
  })

  it("sin ciudades activas falla en vez de mandar un cambio vacío", () => {
    const r = supplierCityPlan("exclude", [], new Set([1]))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/ciudades activas/i)
  })

  it("descarta ids marcados que no son ciudades activas", () => {
    const r = supplierCityPlan("exclude", CITIES, new Set([99]))
    expect(r.ok).toBe(false)
  })

  it("los modos que exigen selección están marcados en el catálogo", () => {
    const needs = SUPPLIER_CITY_MODES.filter((m) => m.needsSelection).map((m) => m.value)
    expect(needs).toEqual(["exclude", "only"])
  })
})

describe("supplierCityLabel", () => {
  it("nombra el caso global", () => {
    expect(supplierCityLabel(summary({ global: true, availableCount: 20, totalCities: 20 }))).toBe(
      "Global (20 de 20)"
    )
  })

  it("cuenta las ciudades cuando está restringido", () => {
    expect(supplierCityLabel(summary({ global: false, availableCount: 3, totalCities: 20 }))).toBe(
      "3 de 20 ciudades"
    )
  })

  it("explicita el caso sin ninguna ciudad", () => {
    expect(supplierCityLabel(summary({ global: false, availableCount: 0, totalCities: 20 }))).toBe(
      "Sin ciudad disponible"
    )
  })

  it("no divide entre cero sin ciudades activas", () => {
    expect(supplierCityLabel(summary({ global: false, availableCount: 0, totalCities: 0 }))).toBe(
      "Sin ciudades activas"
    )
  })
})

describe("parseSupplierOverview", () => {
  const valid = {
    suppliers: [
      {
        id: 2,
        name: "FRUGASA",
        slug: "frugasa",
        status: "activo",
        productCount: 135,
        visibleCount: 130,
        productIds: [1, 2, 3],
        cities: { global: true, availableCount: 20, totalCities: 20, availableCityIds: [1, 2] },
      },
    ],
  }

  it("lee el payload completo", () => {
    const s = parseSupplierOverview(valid)[0]!
    expect(s).toEqual({
      id: 2,
      name: "FRUGASA",
      slug: "frugasa",
      status: "activo",
      productCount: 135,
      visibleCount: 130,
      productIds: [1, 2, 3],
      cities: { global: true, availableCount: 20, totalCities: 20, availableCityIds: [1, 2] },
    })
  })

  it("devuelve vacío ante un payload que no es objeto o no trae suppliers", () => {
    expect(parseSupplierOverview(null)).toEqual([])
    expect(parseSupplierOverview("nope")).toEqual([])
    expect(parseSupplierOverview({})).toEqual([])
    expect(parseSupplierOverview({ suppliers: "nope" })).toEqual([])
  })

  it("descarta entradas sin id o sin nombre", () => {
    const rows = parseSupplierOverview({
      suppliers: [
        { id: 0, name: "X", slug: "x" },
        { id: 1, slug: "sin-nombre" },
        { id: 2, name: "Ok", slug: "ok" },
      ],
    })
    expect(rows.map((r) => r.id)).toEqual([2])
  })

  it("sanea conteos e ids raros en vez de pintar NaN", () => {
    const s = parseSupplierOverview({
      suppliers: [
        {
          id: 1,
          name: "X",
          slug: "x",
          productCount: "7",
          visibleCount: -3,
          productIds: [1, 2.5, 0, -1, "3", 4],
          cities: { availableCount: null, totalCities: "2", availableCityIds: [1, "2", 3] },
        },
      ],
    })[0]!
    expect(s.productCount).toBe(7)
    expect(s.visibleCount).toBe(0)
    expect(s.productIds).toEqual([1, 4])
    expect(s.cities.totalCities).toBe(2)
    expect(s.cities.availableCount).toBe(0)
    expect(s.cities.availableCityIds).toEqual([1, 3])
    expect(s.cities.global).toBe(false)
  })

  it("un status desconocido cae a prospecto en vez de propagarse", () => {
    const s = parseSupplierOverview({
      suppliers: [{ id: 1, name: "X", slug: "x", status: 42 }],
    })[0]!
    expect(s.status).toBe("prospecto")
  })
})

describe("supplierFilterValue", () => {
  it("normaliza el parámetro vacío a `all`", () => {
    // `?supplier=` no es un filtro: tratarlo como valor dejaría el listado en
    // blanco sin error, que es el fallo que ya documenta `admin-product-filters`.
    expect(supplierFilterValue("")).toBe("all")
    expect(supplierFilterValue("   ")).toBe("all")
    expect(supplierFilterValue(null)).toBe("all")
    expect(supplierFilterValue(undefined)).toBe("all")
  })

  it("conserva los valores reales", () => {
    expect(supplierFilterValue(" frugasa ")).toBe("frugasa")
    expect(supplierFilterValue("none")).toBe("none")
  })
})

describe("supplierFilterLabel", () => {
  const names = new Map([["frugasa", "FRUGASA"]])

  it("nombra los tres casos", () => {
    expect(supplierFilterLabel("all", names)).toBe("Todos los proveedores")
    expect(supplierFilterLabel(SUPPLIER_FILTER_NONE, names)).toBe("Sin proveedor")
    expect(supplierFilterLabel("frugasa", names)).toBe("FRUGASA")
  })

  it("cae al slug cuando la lista aún no cargó", () => {
    expect(supplierFilterLabel("ab-foods", new Map())).toBe("ab-foods")
  })
})
