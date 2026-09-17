import { describe, expect, it } from "vitest"

import {
  DEFAULT_STATUS_FILTER,
  DEFAULT_STOCK_FILTER,
  EMPTY_PRODUCT_FILTERS,
  PRODUCT_FLAG_KEYS,
  activeProductFilterCount,
  clearedProductFilters,
  parseProductFilters,
  productFilterApiParams,
  productFiltersToSearchParams,
  type ProductFilters,
} from "./admin-product-filters"

function sp(query: string) {
  return new URLSearchParams(query)
}

function filters(overrides: Partial<ProductFilters> = {}): ProductFilters {
  return { ...EMPTY_PRODUCT_FILTERS, ...overrides }
}

describe("parseProductFilters", () => {
  it("devuelve los defaults con una URL vacía", () => {
    expect(parseProductFilters(sp(""))).toEqual(EMPTY_PRODUCT_FILTERS)
  })

  it("lee los filtros de texto", () => {
    const parsed = parseProductFilters(
      sp("q=tomate&category=3&tag=verano&city=5&brand=Acme")
    )
    expect(parsed.search).toBe("tomate")
    expect(parsed.category).toBe("3")
    expect(parsed.tag).toBe("verano")
    expect(parsed.city).toBe("5")
    expect(parsed.brand).toBe("Acme")
  })

  it("trata un filtro de texto vacío como ausente", () => {
    const parsed = parseProductFilters(sp("category=&tag=&city=&brand="))
    expect(parsed.category).toBe("all")
    expect(parsed.tag).toBe("all")
    expect(parsed.city).toBe("all")
    expect(parsed.brand).toBe("all")
  })

  it("acepta los valores válidos de stock y status", () => {
    expect(parseProductFilters(sp("stock=low_stock")).stock).toBe("low_stock")
    expect(parseProductFilters(sp("status=unpublished")).status).toBe("unpublished")
  })

  it("cae al default con stock o status desconocidos", () => {
    expect(parseProductFilters(sp("stock=agotado")).stock).toBe(DEFAULT_STOCK_FILTER)
    expect(parseProductFilters(sp("status=draft")).status).toBe(DEFAULT_STATUS_FILTER)
  })

  it("marca los booleanos solo cuando valen exactamente 1", () => {
    const parsed = parseProductFilters(
      sp("noImage=1&trash=1&onSale=0&noCities=true&brokenImage=1")
    )
    expect(parsed.noImage).toBe(true)
    expect(parsed.trash).toBe(true)
    expect(parsed.brokenImage).toBe(true)
    expect(parsed.onSale).toBe(false)
    expect(parsed.noCities).toBe(false)
  })

  it("deja en false todos los booleanos que no están en la URL", () => {
    const parsed = parseProductFilters(sp("q=x"))
    for (const key of PRODUCT_FLAG_KEYS) expect(parsed[key]).toBe(false)
  })

  it("funciona con cualquier fuente que implemente get()", () => {
    const parsed = parseProductFilters({ get: (k) => (k === "q" ? "arroz" : null) })
    expect(parsed.search).toBe("arroz")
  })
})

describe("productFiltersToSearchParams", () => {
  it("no escribe nada cuando no hay filtros", () => {
    expect(productFiltersToSearchParams(filters()).toString()).toBe("")
  })

  it("escribe los filtros de texto no-default", () => {
    const out = productFiltersToSearchParams(
      filters({ search: "arroz", category: "2", tag: "x", city: "9", brand: "Acme" })
    )
    expect(out.get("q")).toBe("arroz")
    expect(out.get("category")).toBe("2")
    expect(out.get("tag")).toBe("x")
    expect(out.get("city")).toBe("9")
    expect(out.get("brand")).toBe("Acme")
  })

  it("no escribe stock/status en su valor default", () => {
    const out = productFiltersToSearchParams(filters())
    expect(out.has("stock")).toBe(false)
    expect(out.has("status")).toBe(false)
  })

  it("escribe stock/status cuando difieren del default", () => {
    const out = productFiltersToSearchParams(filters({ stock: "out_of_stock", status: "published" }))
    expect(out.get("stock")).toBe("out_of_stock")
    expect(out.get("status")).toBe("published")
  })

  it("escribe solo los booleanos activos, siempre como 1", () => {
    const out = productFiltersToSearchParams(filters({ noImage: true, brokenImage: true }))
    expect(out.get("noImage")).toBe("1")
    expect(out.get("brokenImage")).toBe("1")
    expect(out.has("trash")).toBe(false)
    expect(out.has("onSale")).toBe(false)
  })

  it("reutiliza el URLSearchParams recibido para no perder orden o página", () => {
    const base = new URLSearchParams({ sort: "price", dir: "desc", page: "3" })
    const out = productFiltersToSearchParams(filters({ search: "x" }), base)
    expect(out).toBe(base)
    expect(out.get("sort")).toBe("price")
    expect(out.get("page")).toBe("3")
    expect(out.get("q")).toBe("x")
  })

  it("ida y vuelta: parse(serialize(f)) reproduce f", () => {
    const original = filters({
      search: "arroz",
      category: "7",
      stock: "low_stock",
      status: "published",
      tag: "verano",
      city: "3",
      brand: "Acme",
      noImage: true,
      trash: true,
      staleSale: true,
      brokenImage: true,
    })
    const roundTrip = parseProductFilters(sp(productFiltersToSearchParams(original).toString()))
    expect(roundTrip).toEqual(original)
  })

  it("ida y vuelta también con los defaults (nada se pierde al no escribirlos)", () => {
    const roundTrip = parseProductFilters(sp(productFiltersToSearchParams(filters()).toString()))
    expect(roundTrip).toEqual(filters())
  })
})

describe("productFilterApiParams", () => {
  it("manda los booleanos explícitos como 1 y 0", () => {
    const params = productFilterApiParams(filters({ noImage: true, trash: true }))
    expect(params.noImage).toBe("1")
    expect(params.trash).toBe("1")
    expect(params.onSale).toBe("0")
    expect(params.dupNames).toBe("0")
  })

  it("manda los filtros de texto siempre, con su valor default incluido", () => {
    const params = productFilterApiParams(filters())
    expect(params.q).toBe("")
    expect(params.category).toBe("all")
    expect(params.stock).toBe("all")
    expect(params.status).toBe("all")
    expect(params.tag).toBe("all")
    expect(params.city).toBe("all")
    expect(params.brand).toBe("all")
  })

  it("cubre las 11 claves booleanas", () => {
    const params = productFilterApiParams(filters())
    for (const key of PRODUCT_FLAG_KEYS) expect(params[key]).toBeDefined()
    expect(Object.keys(params)).toHaveLength(7 + PRODUCT_FLAG_KEYS.length)
  })

  it("ida y vuelta: parse(apiParams(f)) reproduce f", () => {
    const original = filters({
      search: "tomate",
      category: "1",
      stock: "in_stock",
      status: "unpublished",
      underThreshold: true,
      waMismatch: true,
    })
    const roundTrip = parseProductFilters(
      sp(new URLSearchParams(productFilterApiParams(original)).toString())
    )
    expect(roundTrip).toEqual(original)
  })
})

describe("activeProductFilterCount", () => {
  it("es 0 sin filtros", () => {
    expect(activeProductFilterCount(filters())).toBe(0)
  })

  it("cuenta el texto solo si tiene contenido real", () => {
    expect(activeProductFilterCount(filters({ search: "   " }))).toBe(0)
    expect(activeProductFilterCount(filters({ search: "x" }))).toBe(1)
  })

  it("cuenta cada familia de filtro una sola vez", () => {
    const count = activeProductFilterCount(
      filters({
        search: "x",
        category: "1",
        stock: "low_stock",
        status: "published",
        city: "2",
        brand: "Acme",
        tag: "verano",
      })
    )
    expect(count).toBe(7)
  })

  it("cuenta todos los booleanos activos", () => {
    const all = Object.fromEntries(
      PRODUCT_FLAG_KEYS.map((k) => [k, true])
    ) as unknown as Partial<ProductFilters>
    expect(activeProductFilterCount(filters(all))).toBe(PRODUCT_FLAG_KEYS.length)
  })

  it("ignora los booleanos en false", () => {
    expect(activeProductFilterCount(filters({ noImage: false, trash: false }))).toBe(0)
  })
})

describe("clearedProductFilters", () => {
  it("devuelve el estado sin filtros", () => {
    expect(clearedProductFilters()).toEqual(EMPTY_PRODUCT_FILTERS)
  })

  it("devuelve una copia, no el objeto compartido", () => {
    const cleared = clearedProductFilters()
    expect(cleared).not.toBe(EMPTY_PRODUCT_FILTERS)
    cleared.noImage = true
    expect(EMPTY_PRODUCT_FILTERS.noImage).toBe(false)
  })
})
