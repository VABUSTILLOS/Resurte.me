import { createPublicClient } from "@/lib/supabase/public"
import type { City, Category, Product, RestaurantCollection } from "@/types"
import { logger } from "@/lib/logger"
import { expandSearchTerms, escapeIlike } from "@/lib/search-terms"
import { normalizeSale, withResolvedSale } from "@/lib/sale-window"
import {
  REVIEW_FEED_LIMIT_PER_PRODUCT,
  type ProductReviewFeedRow,
  normalizeFeedRow,
} from "@/lib/product-reviews"

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

  query = query.order("sort_order", { ascending: true, nullsFirst: false }).order("name")

  if (categoryId) {
    query = query.eq("category_id", categoryId)
  }

  const { data, error } = await query
  let rows = data
  if (error) {
    // sort_order (00100) aún no aplicado: ordenar solo por nombre.
    let fallback = supabase.from("products").select("*")
    if (!includeHidden) {
      fallback = fallback.eq("is_visible", true)
    }
    fallback = fallback.order("name")
    if (categoryId) {
      fallback = fallback.eq("category_id", categoryId)
    }
    ;({ data: rows } = await fallback)
  }
  // Oferta fuera de su ventana (00107): se anula sale_price para que tarjetas,
  // detalle y JSON-LD sigan usando sale_price ?? price sin cambios.
  return normalizeSale(rows as Product[])
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

  query = query
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("name")
    .range(from, to)

  if (categoryId) {
    query = query.eq("category_id", categoryId)
  }

  let { data, count } = await query
  if (!data && !count) {
    // sort_order (00100) aún no aplicado: ordenar solo por nombre.
    let fallback = supabase
      .from("products")
      .select("*", { count: "exact", head: false })
    if (!includeHidden) {
      fallback = fallback.eq("is_visible", true)
    }
    fallback = fallback.order("name").range(from, to)
    if (categoryId) {
      fallback = fallback.eq("category_id", categoryId)
    }
    ;({ data, count } = await fallback)
  }

  const products = normalizeSale(data as Product[])
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
  const product = (data as Product) ?? null
  return product ? withResolvedSale(product) : null
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

  // Nombre + descripción + marca, con expansión de sinónimos y sin acentos
  // (search-terms.ts): "palta" encuentra "Aguacate Hass", "soda" → refrescos.
  const terms = expandSearchTerms(query)
  if (terms.length === 0) return { products: [] }

  const orFilter = terms
    .flatMap((term) => {
      const t = escapeIlike(term)
      return [`name.ilike.%${t}%`, `description.ilike.%${t}%`, `brand.ilike.%${t}%`]
    })
    .join(",")

  const { data: products } = await supabase
    .from("products")
    .select("*")
    .or(orFilter)
    .eq("is_visible", true)
    .limit(20)

  return {
    products: normalizeSale(products as Product[]),
  }
}

// ============================================================
// DISPONIBILIDAD POR CIUDAD (migración 00065)
// ============================================================

/**
 * IDs de productos visibles y disponibles en una ciudad.
 *
 * Semántica: un producto sin filas en product_city_availability está
 * disponible en todas las ciudades; con filas, solo donde
 * is_available = true (ver migración 00065).
 *
 * Devuelve null cuando el RPC no está disponible (migración sin
 * aplicar, schema cache de PostgREST sin la función): los consumidores
 * deben tratar null como "sin filtro" para no vaciar la tienda.
 */
export async function getAvailableProductIds(
  cityId: number
): Promise<number[] | null> {
  const supabase = await tryCreateClient()
  if (!supabase) return null
  const { data, error } = await supabase.rpc("get_available_product_ids", {
    p_city_id: cityId,
  })
  if (error) {
    logger.warn(
      "getAvailableProductIds: RPC no disponible, catálogo sin filtro de ciudad",
      { message: error.message, cityId }
    )
    return null
  }
  return (data ?? []) as number[]
}

// ============================================================
// RESEÑAS DE PEDIDO PROYECTADAS AL CATÁLOGO
// ============================================================

/**
 * Reseñas agregadas por producto (RPC `product_review_feed`, migración 00158).
 *
 * Devuelve [] cuando el RPC no está disponible (migración sin aplicar, caché de
 * esquema de PostgREST desactualizada, entorno sin secrets) o cuando todavía no
 * hay ninguna reseña. Los dos casos son el mismo estado para el consumidor: "no
 * hay nada que mostrar", y la página simplemente no pinta el bloque. Nunca se
 * inventan reseñas para llenar el hueco.
 *
 * Las filas se normalizan aquí para que lo que se guarde en el caché sea ya
 * válido: una fila corrupta no llega a la capa de presentación.
 */
export async function getProductReviewFeed(
  limitPerProduct: number = REVIEW_FEED_LIMIT_PER_PRODUCT
): Promise<ProductReviewFeedRow[]> {
  const supabase = await tryCreateClient()
  if (!supabase) return []

  const { data, error } = await supabase.rpc("product_review_feed", {
    p_limit_per_product: limitPerProduct,
  })

  if (error) {
    logger.warn(
      "getProductReviewFeed: RPC no disponible, catálogo sin reseñas",
      { message: error.message }
    )
    return []
  }

  const rows = (data ?? []) as unknown[]
  const normalized: ProductReviewFeedRow[] = []
  for (const raw of rows) {
    const row = normalizeFeedRow(raw)
    if (row) normalized.push(row)
  }
  return normalized
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
 *
 * Fallback: si el RPC no está disponible (p. ej. schema cache de PostgREST sin
 * la función, o migraciones no aplicadas), se replica la misma lógica en
 * memoria — colección por slug + productos visibles + intersección de tags —
 * para que la página nunca se degrade a un carrito/colección vacía.
 */
export async function getProductsByCollection(
  collectionSlug: string
): Promise<Product[]> {
  const supabase = await tryCreateClient()
  if (!supabase) return []

  const { data, error } = await supabase.rpc("get_products_by_collection", {
    p_slug: collectionSlug,
  })

  if (!error) {
    return normalizeSale(data as Product[])
  }

  logger.warn(
    "getProductsByCollection: RPC no disponible, usando fallback en memoria",
    { message: error.message }
  )

  const [collection, products] = await Promise.all([
    getRestaurantCollectionBySlug(collectionSlug),
    getProducts(),
  ])

  if (!collection || !collection.tags?.length) return []

  const tagSet = new Set(collection.tags)
  const matched = products.filter(
    (p) => p.is_visible !== false && p.tags?.some((t) => tagSet.has(t))
  )
  return matched.sort((a, b) => a.name.localeCompare(b.name))
}
