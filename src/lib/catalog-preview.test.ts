import { describe, expect, it } from "vitest"
import {
  buildCatalogPreview,
  buildLandingPreview,
  FEATURED_CATEGORY_SLUGS,
  LANDING_PREVIEW_COUNT,
  toMatchableProduct,
} from "./catalog-preview"
import type { Category, Product } from "@/types"

function makeProduct(id: number, categoryId: number): Product {
  return {
    id,
    name: `Producto ${id}`,
    slug: `producto-${id}`,
    description: `Descripción larga del producto ${id}`,
    image_url: `https://img/${id}.webp`,
    images: [`https://img/${id}.webp`, `https://img/${id}-2.webp`],
    brand: "Marca",
    category_id: categoryId,
    price: 100,
    sale_price: null,
    stock_status: "in_stock",
    show_in_whatsapp: false,
    whatsapp_product_id: null,
    unit: "kg",
    tags: ["tag"],
    is_visible: true,
  }
}

const categories: Category[] = [
  { id: 1, name: "Frutas y Verduras", slug: "frutas-verduras", icon: "🥑" },
  { id: 2, name: "Carnes", slug: "carnes-pescados", icon: "🥩" },
  { id: 3, name: "Otra", slug: "otra-no-destacada", icon: "📦" },
] as Category[]

describe("buildLandingPreview", () => {
  it("limita el preview a N productos por categoría destacada y cuenta el total real", () => {
    const products = [
      ...Array.from({ length: 10 }, (_, i) => makeProduct(i + 1, 1)),
      ...Array.from({ length: 6 }, (_, i) => makeProduct(i + 101, 2)),
      ...Array.from({ length: 3 }, (_, i) => makeProduct(i + 201, 3)),
    ]

    const { previewProducts, categoryCounts } = buildLandingPreview(products, categories)

    // Solo categorías destacadas aportan tarjetas, máx LANDING_PREVIEW_COUNT c/u
    expect(previewProducts).toHaveLength(LANDING_PREVIEW_COUNT * 2)
    expect(previewProducts.every((p) => [1, 2].includes(p.category_id))).toBe(true)

    // Los conteos reflejan el catálogo completo (incluye no destacadas)
    expect(Object.fromEntries(categoryCounts)).toEqual({ 1: 10, 2: 6, 3: 3 })
  })

  it("con catálogo vacío devuelve estructuras vacías", () => {
    const { previewProducts, categoryCounts } = buildLandingPreview([], [])
    expect(previewProducts).toEqual([])
    expect(categoryCounts).toEqual([])
  })
})

describe("buildCatalogPreview", () => {
  it("recorta a N por categoría conservando conteos completos", () => {
    const products = Array.from({ length: 20 }, (_, i) => makeProduct(i + 1, 1))
    const { previewProducts, categoryCounts } = buildCatalogPreview(products)

    // CATALOG_PREVIEW_COUNT no se exporta (knip): el preview es de 8 por categoría
    expect(previewProducts).toHaveLength(8)
    expect(categoryCounts).toEqual([[1, 20]])
  })
})

describe("toMatchableProduct", () => {
  it("conserva solo los campos de matching y tarjeta", () => {
    const m = toMatchableProduct(makeProduct(1, 1))
    expect(m).toEqual({
      id: 1,
      name: "Producto 1",
      slug: "producto-1",
      image_url: "https://img/1.webp",
      brand: "Marca",
      price: 100,
      sale_price: null,
      stock_status: "in_stock",
      unit: "kg",
    })
    expect("description" in m).toBe(false)
    expect("images" in m).toBe(false)
    expect("tags" in m).toBe(false)
  })
})

describe("constantes", () => {
  it("las categorías destacadas son las 5 restaurant-esenciales", () => {
    expect(FEATURED_CATEGORY_SLUGS).toContain("frutas-verduras")
    expect(FEATURED_CATEGORY_SLUGS).toHaveLength(5)
  })
})
