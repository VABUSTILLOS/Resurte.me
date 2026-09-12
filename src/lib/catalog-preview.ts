import type { Category, Product } from "@/types"

// Categorías restaurant-esenciales destacadas en la landing, por prioridad.
export const FEATURED_CATEGORY_SLUGS = [
  "frutas-verduras",
  "carnes-pescados",
  "lacteos-huevos",
  "despensa",
  "bebidas",
]

// Productos por categoría destacada que se pre-renderizan en la landing.
export const LANDING_PREVIEW_COUNT = 4

// Productos por categoría que se pre-renderizan en /catalogo/[ciudad].
export const CATALOG_PREVIEW_COUNT = 8

// Productos pre-renderizados en /[ciudad]/categoria/[slug]; el resto se
// pagina en cliente con loadMoreCategoryProducts (mismo page size).
export const CATEGORY_FIRST_PAGE_SIZE = 24

/**
 * Subconjunto de Product que necesita el matching ingrediente → producto de
 * las recetas (RecipeSlider). El catálogo completo se serializa en las
 * páginas de colección solo para ese matching; recortar description, galería
 * de imágenes, tags y campos de WhatsApp reduce bastante el payload flight.
 */
export type MatchableProduct = Pick<
  Product,
  | "id"
  | "name"
  | "slug"
  | "image_url"
  | "brand"
  | "price"
  | "sale_price"
  | "stock_status"
  | "unit"
>

export function toMatchableProduct(p: Product): MatchableProduct {
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    image_url: p.image_url,
    brand: p.brand,
    price: p.price,
    sale_price: p.sale_price,
    stock_status: p.stock_status,
    unit: p.unit,
  }
}

/**
 * Recorta el catálogo completo a lo que la landing realmente renderiza
 * (conteo por categoría + las primeras N tarjetas de las categorías
 * destacadas). Evita serializar cientos de productos en el HTML y en el
 * payload RSC flight cuando solo se muestran ~20.
 */
export function buildLandingPreview(
  products: Product[],
  categories: Category[]
): {
  previewProducts: Product[]
  categoryCounts: [number, number][]
} {
  const featuredIds = new Set(
    categories
      .filter((c) => FEATURED_CATEGORY_SLUGS.includes(c.slug))
      .map((c) => c.id)
  )
  const counts = new Map<number, number>()
  const preview = new Map<number, Product[]>()

  for (const p of products) {
    counts.set(p.category_id, (counts.get(p.category_id) ?? 0) + 1)
    if (featuredIds.has(p.category_id)) {
      const list = preview.get(p.category_id) ?? []
      if (list.length < LANDING_PREVIEW_COUNT) {
        list.push(p)
        preview.set(p.category_id, list)
      }
    }
  }

  return {
    previewProducts: [...preview.values()].flat(),
    categoryCounts: [...counts.entries()],
  }
}

/**
 * Recorta el catálogo a las primeras N tarjetas por categoría para el
 * pre-render de /catalogo/[ciudad]. El catálogo completo se carga en el
 * cliente solo cuando el usuario interactúa (buscar o filtrar).
 */
export function buildCatalogPreview(
  products: Product[]
): { previewProducts: Product[]; categoryCounts: [number, number][] } {
  const counts = new Map<number, number>()
  const preview = new Map<number, Product[]>()

  for (const p of products) {
    counts.set(p.category_id, (counts.get(p.category_id) ?? 0) + 1)
    const list = preview.get(p.category_id) ?? []
    if (list.length < CATALOG_PREVIEW_COUNT) {
      list.push(p)
      preview.set(p.category_id, list)
    }
  }

  return {
    previewProducts: [...preview.values()].flat(),
    categoryCounts: [...counts.entries()],
  }
}
