"use server"

import {
  filterByCityAvailability,
  getCachedProductsByCategory,
  getCachedVisibleProducts,
  getCityAvailabilityForSlug,
} from "@/lib/catalog-cache"
import type { Product } from "@/types"

const CATEGORY_PAGE_SIZE = 24

function isSupabaseUnconfigured(error: unknown): boolean {
  return error instanceof Error && error.message.includes("Supabase no está configurado")
}

/**
 * Catálogo completo visible para una ciudad. Lo usan las vistas interactivas
 * (tienda del usuario logueado, búsqueda/filtro del catálogo) que necesitan
 * todos los productos en el cliente — se llama tras la hidratación, así el
 * HTML pre-renderizado no carga con el catálogo entero.
 */
export async function loadCatalogForCity(citySlug: string): Promise<Product[]> {
  try {
    const [products, availableIds] = await Promise.all([
      getCachedVisibleProducts(),
      getCityAvailabilityForSlug(citySlug),
    ])
    return filterByCityAvailability(products, availableIds)
  } catch (error) {
    // Dev local / preview sin secrets: degradar a catálogo vacío (mismo
    // criterio que loadMoreProducts en buscar/actions.ts).
    if (isSupabaseUnconfigured(error)) return []
    throw error
  }
}

/**
 * Paginación de una categoría (páginas 1+; la página 0 ya viene
 * pre-renderizada en el HTML). Pagina en memoria sobre la categoría cacheada
 * para respetar la disponibilidad por ciudad sin páginas vacías intermedias.
 */
export async function loadMoreCategoryProducts(
  categoryId: number,
  page: number,
  citySlug: string
): Promise<{ products: Product[]; hasMore: boolean }> {
  try {
    const [categoryProducts, availableIds] = await Promise.all([
      getCachedProductsByCategory(categoryId),
      getCityAvailabilityForSlug(citySlug),
    ])
    const all = filterByCityAvailability(categoryProducts, availableIds)
    const from = page * CATEGORY_PAGE_SIZE
    return {
      products: all.slice(from, from + CATEGORY_PAGE_SIZE),
      hasMore: from + CATEGORY_PAGE_SIZE < all.length,
    }
  } catch (error) {
    if (isSupabaseUnconfigured(error)) return { products: [], hasMore: false }
    throw error
  }
}
