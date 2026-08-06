import { createClient } from "@/lib/supabase/server"
import type { City, Category, Product, RestaurantCollection } from "@/types"

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

/**
 * Crea el cliente Supabase degradando con gracia cuando el entorno no tiene
 * secrets configurados (dev local o preview): devuelve null y los consumidores
 * renderizan estados vacíos en lugar de crashear.
 */
async function tryCreateClient(): Promise<SupabaseServerClient | null> {
  try {
    return await createClient()
  } catch {
    return null
  }
}

// ============================================================
// CIUDADES
// ============================================================

export async function getCities(): Promise<City[]> {
  const supabase = await tryCreateClient()
  if (!supabase) return []
  const { data } = await supabase
    .from("cities")
    .select("*")
    .eq("is_active", true)
    .order("name")
  return (data as City[]) ?? []
}

export async function getCityBySlug(slug: string): Promise<City | null> {
  const supabase = await tryCreateClient()
  if (!supabase) return null
  const { data } = await supabase
    .from("cities")
    .select("*")
    .eq("slug", slug)
    .single()
  return (data as City) ?? null
}

// ============================================================
// CATEGORÍAS
// ============================================================

export async function getCategories(): Promise<Category[]> {
  const supabase = await tryCreateClient()
  if (!supabase) return []
  const { data } = await supabase
    .from("categories")
    .select("*")
    .order("name")
  return (data as Category[]) ?? []
}

// ============================================================
// PRODUCTOS
// ============================================================

export async function getProducts(
  categoryId?: number,
  includeHidden: boolean = false
): Promise<Product[]> {
  const supabase = await tryCreateClient()
  if (!supabase) return []
  let query = supabase
    .from("products")
    .select("*")

  if (!includeHidden) {
    query = query.eq("is_visible", true)
  }

  query = query.order("name")

  if (categoryId) {
    query = query.eq("category_id", categoryId)
  }

  const { data } = await query
  return (data as Product[]) ?? []
}

const PAGE_SIZE = 24

export async function getProductsPaginated(
  page: number = 0,
  pageSize: number = PAGE_SIZE,
  categoryId?: number,
  includeHidden: boolean = false
): Promise<{
  products: Product[]
  total: number
  hasMore: boolean
}> {
  const supabase = await tryCreateClient()
  if (!supabase) return { products: [], total: 0, hasMore: false }
  const from = page * pageSize
  const to = from + pageSize - 1

  let query = supabase
    .from("products")
    .select("*", { count: "exact", head: false })

  if (!includeHidden) {
    query = query.eq("is_visible", true)
  }

  query = query.order("name").range(from, to)

  if (categoryId) {
    query = query.eq("category_id", categoryId)
  }

  const { data, count } = await query

  const products = (data as Product[]) ?? []
  const total = count ?? products.length
  const hasMore = from + products.length < total

  return { products, total, hasMore }
}

export async function getProductBySlug(slug: string): Promise<Product | null> {
  const supabase = await tryCreateClient()
  if (!supabase) return null
  const { data } = await supabase
    .from("products")
    .select("*")
    .eq("slug", slug)
    .single()
  return (data as Product) ?? null
}

// ============================================================
// BÚSQUEDA
// ============================================================

interface SearchResults {
  products: Product[]
}

export async function searchAll(
  query: string,
  _cityId?: number
): Promise<SearchResults> {
  const supabase = await tryCreateClient()
  if (!supabase) return { products: [] }
  const searchTerm = `%${query}%`

  const { data: products } = await supabase
    .from("products")
    .select("*")
    .ilike("name", searchTerm)
    .eq("is_visible", true)
    .limit(20)

  return {
    products: (products as Product[]) ?? [],
  }
}

// ============================================================
// COLECCIONES DE RESTAURANTE
// ============================================================

/**
 * Obtiene todas las colecciones activas ordenadas por display_order.
 * Cada colección agrupa productos por tags (sin duplicar inventario).
 */
export async function getRestaurantCollections(): Promise<RestaurantCollection[]> {
  const supabase = await tryCreateClient()
  if (!supabase) return []
  const { data } = await supabase
    .from("restaurant_collections")
    .select("*")
    .eq("is_active", true)
    .order("display_order")
  return (data as RestaurantCollection[]) ?? []
}

/**
 * Obtiene una colección por su slug.
 */
export async function getRestaurantCollectionBySlug(
  slug: string
): Promise<RestaurantCollection | null> {
  const supabase = await tryCreateClient()
  if (!supabase) return null
  const { data } = await supabase
    .from("restaurant_collections")
    .select("*")
    .eq("slug", slug)
    .eq("is_active", true)
    .single()
  return (data as RestaurantCollection) ?? null
}

/**
 * Obtiene los productos asociados a una colección mediante intersección de tags.
 * Las colecciones funcionan como queries filtradas: los productos deben tener al
 * menos un tag que coincida con los tags de la colección.
 *
 * Usa el operador ?| de PostgreSQL JSONB para intersección de arrays.
 */
export async function getProductsByCollection(
  collectionSlug: string
): Promise<Product[]> {
  const supabase = await tryCreateClient()
  if (!supabase) return []

  // 1. Obtener la colección y sus tags
  const { data: collection } = await supabase
    .from("restaurant_collections")
    .select("tags")
    .eq("slug", collectionSlug)
    .eq("is_active", true)
    .single()

  if (!collection || !(collection as { tags: string[] }).tags?.length) return []

  const tags = (collection as { tags: string[] }).tags

  // 2. Obtener productos y filtrar por tags
  const { data } = await supabase
    .from("products")
    .select("*")
    .eq("is_visible", true)
    .order("name")

  const filteredProducts =
    (data as (Product & { tags: string[] })[])?.filter((p) => {
      const productTags: string[] = Array.isArray(p.tags) ? p.tags : []
      return productTags.some((t) => tags.includes(t))
    }) ?? []

  return filteredProducts
}
