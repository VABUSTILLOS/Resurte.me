import { describe, expect, it, vi, beforeEach } from "vitest"

vi.mock("@/lib/supabase/client", () => ({
  createClient: vi.fn(() => null),
}))

import {
  getCatalogProducts,
  mergeWithCatalog,
  resetCatalogCache,
} from "@/lib/catalog"

interface ProductShape {
  name: string
  unit: string
  price: number
}

const mockProducts: ProductShape[] = [
  { name: "🥬 Cilantro", unit: "manojo", price: 15 },
  { name: "Pollo", unit: "kg", price: 60 },
  { name: "Cebolla", unit: "kg", price: 25 },
]

const catalogProducts: ProductShape[] = [
  { name: "Pollo", unit: "kg", price: 55 },
  { name: "Cebolla Morada", unit: "kg", price: 32 },
]

describe("mergeWithCatalog", () => {
  it("catálogo vacío devuelve los mocks", () => {
    expect(mergeWithCatalog(mockProducts, [])).toEqual(mockProducts)
  })

  it("los productos del catálogo ganan sobre los mocks (precio autoritativo)", () => {
    const merged = mergeWithCatalog(mockProducts, catalogProducts)
    const pollo = merged.find((p) => p.name === "Pollo")
    expect(pollo?.price).toBe(55)
  })

  it("dedupe por nombre normalizado (emojis/espacios)", () => {
    const merged = mergeWithCatalog(mockProducts, catalogProducts)
    const cilantro = merged.filter((p) => p.name.toLowerCase().includes("cilantro"))
    expect(cilantro).toHaveLength(1)
  })

  it("los mocks rellenan los huecos que el catálogo no cubre", () => {
    const merged = mergeWithCatalog(mockProducts, catalogProducts)
    expect(merged.map((p) => p.name)).toContain("Cebolla")
    expect(merged.map((p) => p.name)).toContain("🥬 Cilantro")
    expect(merged).toHaveLength(4)
  })

  it("default de unit 'kg' para productos del catálogo sin unit", () => {
    const noUnit = [{ name: "Tomate", unit: "", price: 20 }]
    const merged = mergeWithCatalog([], noUnit)
    expect(merged[0].unit).toBe("kg")
  })
})

describe("getCatalogProducts / resetCatalogCache", () => {
  beforeEach(() => {
    resetCatalogCache()
  })

  it("devuelve [] cuando Supabase no está disponible (createClient null)", async () => {
    await expect(getCatalogProducts()).resolves.toEqual([])
  })

  it("cachea el mismo promise entre llamadas", () => {
    expect(getCatalogProducts()).toBe(getCatalogProducts())
  })

  it("resetCatalogCache invalida el promise cacheado", () => {
    const first = getCatalogProducts()
    resetCatalogCache()
    const second = getCatalogProducts()
    expect(second).not.toBe(first)
  })
})
