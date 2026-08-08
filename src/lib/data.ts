import { createPublicClient } from "@/lib/supabase/public"
import type { City, Category, Product, RestaurantCollection } from "@/types"

type SupabasePublicClient = NonNullable<ReturnType<typeof createPublicClient>>

/**
 * Crea el cliente Supabase público (sin cookies) degradando con gracia cuando
 * el entorno no tiene secrets configurados (dev local o preview): devuelve
 * null y los consumidores renderizan estados vacíos en lugar de crashear.
 *
 * Se usa el cliente público (no el SSR con cookies) para que estas funciones
 * puedan ejecutarse dentro del scope de unstable_cache, donde cookies() y
 * headers() no están disponibles. Todas las consultas de esta capa son lecturas
 * públicas del catálogo; RLS expone la misma data a todos los visitantes.
 */
async function tryCreateClient(): Promise<SupabasePublicClient | null> {
  return createPublicClient()
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
    .order("id")
  return (data as Category[]) ?? []
}

export async function getCategoryBySlug(slug: string): Promise<Category | null> {
  const supabase = await tryCreateClient()
  if (!supabase) return null
  const { data } = await supabase
    .from("categories")
    .select("*")
    .eq("slug", slug)
    .single()
  return (data as Category) ?? null
}

export async function getCategoryById(id: number): Promise<Category | null> {
  const supabase = await tryCreateClient()
  if (!supabase) return null
  const { data } = await supabase
    .from("categories")
    .select("*")
    .eq("id", id)
    .single()
  return (data as Category) ?? null
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

export async function getProductBySlug(
  slug: string,
  includeHidden: boolean = false
): Promise<Product | null> {
  const supabase = await tryCreateClient()
  if (!supabase) return null
  let query = supabase
    .from("products")
    .select("*")
    .eq("slug", slug)

  if (!includeHidden) {
    query = query.eq("is_visible", true)
  }

  const { data } = await query.single()
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
 * El filtrado se hace en PostgreSQL (RPC get_products_by_collection) usando el
 * operador JSONB `?|` sobre el índice GIN de products.tags, en lugar de traer
 * todos los productos y filtrar en memoria.
 */
export async function getProductsByCollection(
  collectionSlug: string
): Promise<Product[]> {
  const supabase = await tryCreateClient()
  if (!supabase) return []

  const { data, error } = await supabase.rpc("get_products_by_collection", {
    p_slug: collectionSlug,
  })

  if (error) {
    console.error("getProductsByCollection error:", error.message)
    return []
  }

  return (data ?? []) as Product[]
}
