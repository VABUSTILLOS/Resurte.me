"use server"

import { getCachedProductsPaginated } from "@/lib/catalog-cache"
import { searchAll } from "@/lib/data"
import type { Product } from "@/types"

const PAGE_SIZE = 24

export async function loadMoreProducts(page: number): Promise<{
  products: Product[]
  hasMore: boolean
}> {
  const { products, hasMore } = await getCachedProductsPaginated(
    page,
    PAGE_SIZE
  )
  return { products, hasMore }
}

/**
 * Búsqueda server-side en TODO el catálogo (no solo la página cargada).
 * El buscador client-side solo filtra los productos ya paginados; esta
 * acción complementa los resultados con coincidencias del catálogo completo
 * (ilike sobre name, límite 20), para que productos fuera de la página
 * actual también aparezcan al buscar.
 */
export async function searchProducts(query: string): Promise<Product[]> {
  if (!query.trim() || query.trim().length < 2) return []
  const { products } = await searchAll(query.trim())
  return products
}
