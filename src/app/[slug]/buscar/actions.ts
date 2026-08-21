"use server"

import { getCachedProductsPaginated } from "@/lib/catalog-cache"
import { searchAll } from "@/lib/data"
import type { Product } from "@/types"

const PAGE_SIZE = 24

function isSupabaseUnconfigured(error: unknown): boolean {
  return error instanceof Error && error.message.includes("Supabase no está configurado")
}

export async function loadMoreProducts(page: number): Promise<{
  products: Product[]
  hasMore: boolean
}> {
  try {
    const { products, hasMore } = await getCachedProductsPaginated(page, PAGE_SIZE)
    return { products, hasMore }
  } catch (error) {
    // Dev local / preview sin secrets de Supabase: degradar a catálogo vacío
    // en lugar de lanzar al cliente. Un server action que revienta pinta el
    // overlay de error de Next.js en todo el preview (unhandledRejection).
    // Los errores reales de la DB se siguen propagando.
    if (isSupabaseUnconfigured(error)) {
      return { products: [], hasMore: false }
    }
    throw error
  }
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
  try {
    const { products } = await searchAll(query.trim())
    return products
  } catch (error) {
    if (isSupabaseUnconfigured(error)) return []
    throw error
  }
}