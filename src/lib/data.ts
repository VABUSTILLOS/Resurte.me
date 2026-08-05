import { createClient } from "@/lib/supabase/server"
import type { City, Store, Category, Product, ProductStore, RestaurantCollection } from "@/types"

// ============================================================
// CIUDADES
// ============================================================

export async function getCities(): Promise<City[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from("cities")
    .select("*")
    .eq("is_active", true)
    .order("name")
  return (data as City[]) ?? []
}

export async function getCityBySlug(slug: string): Promise<City | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from("cities")
    .select("*")
    .eq("slug", slug)
    .single()
  return (data as City) ?? null
}

// ============================================================
// TIENDAS
// ============================================================

export async function getStoresByCity(cityId: number): Promise<Store[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from("stores")
    .select("*")
    .eq("is_active", true)
    .order("name")
  // TODO: filter by cityId via store_cities join when DB is populated
  return (data as Store[]) ?? []
}

export async function getStoreBySlug(slug: string): Promise<Store | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from("stores")
    .select("*")
    .eq("slug", slug)
    .single()
  return (data as Store) ?? null
}

// ============================================================
// CATEGORÍAS
// ============================================================

export async function getCategories(): Promise<Category[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from("categories")
    .select("*")
    .order("name")
  return (data as Category[]) ?? []
}

// ============================================================
// PRODUCTOS
// ============================================================

export async function getProductsByStore(
  storeId: number,
  categoryId?: number,
  includeHidden: boolean = false
): Promise<(Product & { price: number; sale_price: number | null; stock_status: string })[]> {
  const supabase = await createClient()
  let query = supabase
    .from("products")
    .select(
      `*, product_stores!inner(price, sale_price, stock_status)`
    )
    .eq("product_stores.store_id", storeId)
    .eq("product_stores.is_available", true)
 
  if (!includeHidden) {
    query = query.eq("is_visible", true)
  }
 
  query = query.order("name")
 
  if (categoryId) {
    query = query.eq("category_id", categoryId)
  }
 
  const { data } = await query
 
  return (
    (data as unknown as (Product & {
      product_stores: { price: number; sale_price: number | null; stock_status: string }[]
    })[])?.map((p) => ({
      ...p,
      price: p.product_stores[0]?.price ?? 0,
      sale_price: p.product_stores[0]?.sale_price ?? null,
      stock_status: p.product_stores[0]?.stock_status ?? "out_of_stock",
    })) ?? []
  )
}
 
const PAGE_SIZE = 24

export async function getProductsByStorePaginated(
  storeId: number,
  page: number = 0,
  pageSize: number = PAGE_SIZE,
  categoryId?: number,
  includeHidden: boolean = false
): Promise<{
  products: (Product & { price: number; sale_price: number | null; stock_status: string })[]
  total: number
  hasMore: boolean
}> {
  const supabase = await createClient()
  const from = page * pageSize
  const to = from + pageSize - 1

  let query = supabase
    .from("products")
    .select(
      `*, product_stores!inner(price, sale_price, stock_status)`,
      { count: "exact", head: false }
    )
    .eq("product_stores.store_id", storeId)
    .eq("product_stores.is_available", true)

  if (!includeHidden) {
    query = query.eq("is_visible", true)
  }

  query = query.order("name")
    .range(from, to)
 
  if (categoryId) {
    query = query.eq("category_id", categoryId)
  }
 
  const { data, count } = await query
 
  const products =
    (data as unknown as (Product & {
      product_stores: { price: number; sale_price: number | null; stock_status: string }[]
    })[])?.map((p) => ({
      ...p,
      price: p.product_stores[0]?.price ?? 0,
      sale_price: p.product_stores[0]?.sale_price ?? null,
      stock_status: p.product_stores[0]?.stock_status ?? "out_of_stock",
    })) ?? []
 
  const total = count ?? products.length
  const hasMore = from + products.length < total

  return { products, total, hasMore }
}

export async function getProductsCount(storeId: number, includeHidden: boolean = false): Promise<number> {
  const supabase = await createClient()
  let query = supabase
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("product_stores.store_id", storeId)
    .eq("product_stores.is_available", true)

  if (!includeHidden) {
    query = query.eq("is_visible", true)
  }

  const { count } = await query
  return count ?? 0
}

export async function getProductBySlug(
  slug: string,
  storeId?: number
): Promise<(Product & { price?: number; sale_price?: number | null; stock_status?: string }) | null> {
  const supabase = await createClient()
  let query = supabase.from("products").select("*").eq("slug", slug)

  if (storeId) {
    query = supabase
      .from("products")
      .select(`*, product_stores!inner(price, sale_price, stock_status)`)
      .eq("slug", slug)
      .eq("product_stores.store_id", storeId)
  }

  const { data } = await query.single()

  if (!data) return null

  const product = data as unknown as Product & {
    product_stores?: { price: number; sale_price: number | null; stock_status: string }[]
  }

  if (product.product_stores?.[0]) {
    return {
      ...product,
      price: product.product_stores[0].price,
      sale_price: product.product_stores[0].sale_price,
      stock_status: product.product_stores[0].stock_status,
    }
  }

  return product
}

// ============================================================
// BÚSQUEDA
// ============================================================

interface SearchResults {
  products: (Product & { store_name: string; price: number; store_slug: string })[]
  stores: Store[]
}

export async function searchAll(
  query: string,
  cityId?: number
): Promise<SearchResults> {
  const supabase = await createClient()
  const searchTerm = `%${query}%`

  const [{ data: products }, { data: stores }] = await Promise.all([
    supabase
      .from("products")
      .select(
        `*, product_stores!inner(price), stores!product_stores(name, slug)`
      )
      .ilike("name", searchTerm)
      .eq("product_stores.is_available", true)
      .limit(20),
    supabase
      .from("stores")
      .select("*")
      .ilike("name", searchTerm)
      .eq("is_active", true)
      .limit(10),
  ])

  return {
    products:
      (products as unknown as (Product & {
        product_stores: { price: number; stores: { name: string; slug: string } }[]
      })[])?.map((p) => ({
        ...p,
        price: p.product_stores?.[0]?.price ?? 0,
        store_name: p.product_stores?.[0]?.stores?.name ?? "",
        store_slug: p.product_stores?.[0]?.stores?.slug ?? "",
      })) ?? [],
    stores: (stores as Store[]) ?? [],
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
  const supabase = await createClient()
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
  const supabase = await createClient()
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
  collectionSlug: string,
  storeId: number = 1
): Promise<(Product & { price: number; sale_price: number | null; stock_status: string })[]> {
  const supabase = await createClient()

  // 1. Obtener la colección y sus tags
  const { data: collection } = await supabase
    .from("restaurant_collections")
    .select("tags")
    .eq("slug", collectionSlug)
    .eq("is_active", true)
    .single()

  if (!collection || !(collection as { tags: string[] }).tags?.length) return []

  const tags = (collection as { tags: string[] }).tags

  // 2. Obtener todos los productos disponibles y filtrar por tags
  //    en el lado del servidor (JSONB overlap vía PostgREST
  //    tiene problemas de casteo de tipos).
  const { data } = await supabase
    .from("products")
    .select(`*, product_stores!inner(price, sale_price, stock_status)`)
    .eq("product_stores.store_id", storeId)
    .eq("product_stores.is_available", true)
    .order("name")
  
  const filteredProducts =
    (data as (Product & {
      product_stores: { price: number; sale_price: number | null; stock_status: string }[]
      tags: string[]
    })[])?.filter((p) => {
      const productTags: string[] = Array.isArray(p.tags) ? p.tags : []
      return productTags.some((t) => tags.includes(t))
    }) ?? []

  return filteredProducts.map((p) => ({
      ...p,
      price: p.product_stores[0]?.price ?? 0,
      sale_price: p.product_stores[0]?.sale_price ?? null,
      stock_status: p.product_stores[0]?.stock_status ?? "out_of_stock",
    }))
}
