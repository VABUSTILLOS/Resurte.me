import { describe, expect, it } from "vitest"
import {
  EMPTY_PRODUCT_CHIP_COUNTS,
  parseProductCountsPayload,
  rankProductTags,
  sortProductBrands,
} from "@/lib/admin-product-counts"

/** Payload mínimo de la v2 del RPC (00118). */
function payload(overrides: Record<string, unknown> = {}) {
  return {
    noCitiesIds: [3, 1],
    dupNameIds: [7],
    underThresholdIds: [2, 9, 4],
    categoryCounts: { "5": 2 },
    catalogTotal: 10,
    published: 6,
    noImage: 1,
    lowStock: 2,
    outStock: 3,
    noPrice: 1,
    noCategory: 2,
    waMismatch: 1,
    onSale: 4,
    staleSale: 1,
    trash: 2,
    brands: ["Acme", " acme ", "", "Zeta"],
    tagCounts: { promo: 3, oferta: 3, nuevo: 1 },
    ...overrides,
  }
}

describe("admin-product-counts", () => {
  it("mapea el payload v2 a los chips del panel", () => {
    const parsed = parseProductCountsPayload(payload())
    expect(parsed).not.toBeNull()
    expect(parsed!.counts).toEqual({
      catalogTotal: 10,
      published: 6,
      unpublished: 4,
      noImage: 1,
      lowStock: 2,
      outStock: 3,
      noCities: 2,
      noPrice: 1,
      noCategory: 2,
      waMismatch: 1,
      onSale: 4,
      staleSale: 1,
      dupNames: 1,
      underThreshold: 3,
      trash: 2,
    })
  })

  it("deriva los contadores de filtros desde la longitud de los ids", () => {
    const parsed = parseProductCountsPayload(
      payload({ noCitiesIds: [], dupNameIds: [], underThresholdIds: [1] })
    )!
    expect(parsed.counts.noCities).toBe(0)
    expect(parsed.counts.dupNames).toBe(0)
    expect(parsed.counts.underThreshold).toBe(1)
    // El panel usa los ids para filtrar, no solo para contar.
    expect(parsed.underThresholdIds).toEqual([1])
    expect(parsed.categoryCounts).toEqual({ "5": 2 })
  })

  it("devuelve null cuando la migración 00118 no está aplicada", () => {
    // Payload de la v1 (00115): sin `brands` ni `tagCounts`.
    expect(
      parseProductCountsPayload({
        noCitiesIds: [],
        dupNameIds: [],
        underThresholdIds: [],
        categoryCounts: {},
      })
    ).toBeNull()
    expect(parseProductCountsPayload(null)).toBeNull()
    expect(parseProductCountsPayload([])).toBeNull()
    expect(parseProductCountsPayload("nope")).toBeNull()
  })

  it("sanea contadores inválidos a 0 sin romper el panel", () => {
    const parsed = parseProductCountsPayload(
      payload({ catalogTotal: null, published: Number.NaN, noImage: -5, lowStock: "3" })
    )!
    expect(parsed.counts.catalogTotal).toBe(0)
    expect(parsed.counts.published).toBe(0)
    expect(parsed.counts.noImage).toBe(0)
    expect(parsed.counts.lowStock).toBe(0)
    // `unpublished` nunca queda negativo aunque `published` venga inflado.
    expect(parsed.counts.unpublished).toBe(0)
    const inflated = parseProductCountsPayload(payload({ published: 99 }))!
    expect(inflated.counts.unpublished).toBe(0)
  })

  it("ignora ids no enteros y categorías sin conteo numérico", () => {
    const parsed = parseProductCountsPayload(
      payload({
        noCitiesIds: [1, 0, -2, 1.5, "3", null],
        categoryCounts: { "5": 2, "6": "x", "7": Number.NaN },
      })
    )!
    expect(parsed.noCitiesIds).toEqual([1])
    expect(parsed.counts.noCities).toBe(1)
    expect(parsed.categoryCounts).toEqual({ "5": 2 })
  })

  it("trata un array como 'no es un objeto plano' (B32)", () => {
    // `typeof [] === "object"` y `![]` es false: sin el guard, un `tagCounts`
    // array pasaría la validación de la v2 y el panel pintaría cero etiquetas
    // en lugar de caer al camino antiguo.
    expect(parseProductCountsPayload(payload({ tagCounts: ["promo"] }))).toBeNull()
    expect(parseProductCountsPayload(payload({ brands: [] }))).not.toBeNull()
    // `categoryCounts` no discrimina: se sanea a vacío.
    expect(parseProductCountsPayload(payload({ categoryCounts: [] }))!.categoryCounts).toEqual({})
    expect(rankProductTags([])).toEqual([])
  })

  it("normaliza marcas y las ordena en español", () => {
    // Se recortan los espacios y se descartan las vacías; la deduplicación es
    // sensible a mayúsculas, igual que en la versión en JS que sustituye.
    expect(sortProductBrands(["Zeta", "ácido", "Acme", " acme ", ""])).toEqual([
      "ácido",
      "acme",
      "Acme",
      "Zeta",
    ])
    expect(sortProductBrands(undefined)).toEqual([])
    expect(sortProductBrands([1, null, "  "])).toEqual([])
    expect(parseProductCountsPayload(payload())!.brands).toEqual(["acme", "Acme", "Zeta"])
  })

  it("ordena etiquetas por frecuencia y recorta al tope", () => {
    expect(rankProductTags({ promo: 1, oferta: 5, nuevo: 5 })).toEqual(["nuevo", "oferta", "promo"])
    expect(rankProductTags({ " PROMO ": 2 })).toEqual(["promo"])
    expect(rankProductTags({})).toEqual([])
    expect(rankProductTags(null)).toEqual([])
    const many = Object.fromEntries(Array.from({ length: 80 }, (_, i) => [`t${i}`, i + 1]))
    const ranked = rankProductTags(many)
    expect(ranked).toHaveLength(50)
    expect(ranked[0]).toBe("t79")
  })

  it("expone un estado inicial en cero reutilizable por el panel", () => {
    expect(Object.values(EMPTY_PRODUCT_CHIP_COUNTS).every((v) => v === 0)).toBe(true)
    expect(Object.keys(EMPTY_PRODUCT_CHIP_COUNTS).sort()).toEqual(
      Object.keys(parseProductCountsPayload(payload())!.counts).sort()
    )
  })
})
