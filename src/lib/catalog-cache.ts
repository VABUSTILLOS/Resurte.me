import { unstable_cache } from "next/cache"
import { createPublicClient } from "@/lib/supabase/public"
import type { Category, Product, RestaurantCollection } from "@/types"

// ============================================================
// Lecturas de catálogo con caché (unstable_cache).
//
// Estas funciones usan el cliente público SIN cookies (createPublicClient),
// porque dentro del scope de unstable_cache no se pueden leer cookies() ni
// headers(). RLS expone la misma data pública a todos los visitantes, así que
// el resultado se comparte entre requests y se revalida por TTL.
//
// Tags disponibles para revalidación manual con revalidateTag():
//   "catalog", "categories", "products", "collections"
// ============================================================

const CATEGORY_SELECT = "id, name, slug, icon, parent_id"

export const getCachedCategories = unstable_cache(
  async (): Promise<Category[]> => {
    const supabase = createPublicClient()
    if (!supabase) return []
    const { data } = await supabase
      .from("categories")
      .select(CATEGORY_SELECT)
      .order("id")
    return (data as Category[]) ?? []
  },
  ["catalog-categories"],
  { revalidate: 3600, tags: ["catalog", "categories"] }
)

export const getCachedVisibleProducts = unstable_cache(
  async (): Promise<Product[]> => {
    const supabase = createPublicClient()
    if (!supabase) return []
    const { data } = await supabase
      .from("products")
      .select("*")
      .eq("is_visible", true)
      .order("name")
    return (data as Product[]) ?? []
  },
  ["catalog-products"],
  { revalidate: 300, tags: ["catalog", "products"] }
)

export const getCachedActiveCollections = unstable_cache(
  async (): Promise<RestaurantCollection[]> => {
    const supabase = createPublicClient()
    if (!supabase) return []
    const { data } = await supabase
      .from("restaurant_collections")
      .select("*")
      .eq("is_active", true)
      .order("display_order")
    return (data as RestaurantCollection[]) ?? []
  },
  ["catalog-collections"],
  { revalidate: 3600, tags: ["catalog", "collections"] }
)

export const getCachedCategoryBySlug = unstable_cache(
  async (slug: string): Promise<Category | null> => {
    const supabase = createPublicClient()
    if (!supabase) return null
    const { data } = await supabase
      .from("categories")
      .select(CATEGORY_SELECT)
      .eq("slug", slug)
      .single()
    return (data as Category) ?? null
  },
  ["catalog-category-by-slug"],
  { revalidate: 3600, tags: ["catalog", "categories"] }
)

export const getCachedProductsByCategory = unstable_cache(
  async (categoryId: number): Promise<Product[]> => {
    const supabase = createPublicClient()
    if (!supabase) return []
    const { data } = await supabase
      .from("products")
      .select("*")
      .eq("category_id", categoryId)
      .eq("is_visible", true)
      .order("name")
    return (data as Product[]) ?? []
  },
  ["catalog-products-by-category"],
  { revalidate: 300, tags: ["catalog", "products"] }
)

export const getCachedCollectionBySlug = unstable_cache(
  async (slug: string): Promise<RestaurantCollection | null> => {
    const supabase = createPublicClient()
    if (!supabase) return null
    const { data } = await supabase
      .from("restaurant_collections")
      .select("*")
      .eq("slug", slug)
      .eq("is_active", true)
      .single()
    return (data as RestaurantCollection) ?? null
  },
  ["catalog-collection-by-slug"],
  { revalidate: 3600, tags: ["catalog", "collections"] }
)

export const getCachedProductBySlug = unstable_cache(
  async (slug: string): Promise<Product | null> => {
    const supabase = createPublicClient()
    if (!supabase) return null
    const { data } = await supabase
      .from("products")
      .select("*")
      .eq("slug", slug)
      .single()
    return (data as Product) ?? null
  },
  ["catalog-product-by-slug"],
  { revalidate: 300, tags: ["catalog", "products"] }
)

export const getCachedCategoryById = unstable_cache(
  async (id: number): Promise<Category | null> => {
    const supabase = createPublicClient()
    if (!supabase) return null
    const { data } = await supabase
      .from("categories")
      .select(CATEGORY_SELECT)
      .eq("id", id)
      .single()
    return (data as Category) ?? null
  },
  ["catalog-category-by-id"],
  { revalidate: 3600, tags: ["catalog", "categories"] }
)

export interface CachedPaginatedProducts {
  products: Product[]
  total: number
  hasMore: boolean
}

export const getCachedProductsPaginated = unstable_cache(
  async (page: number, pageSize: number, categoryId?: number): Promise<CachedPaginatedProducts> => {
    const supabase = createPublicClient()
    if (!supabase) return { products: [], total: 0, hasMore: false }

    const from = page * pageSize
    const to = from + pageSize - 1

    let query = supabase
      .from("products")
      .select("*", { count: "exact", head: false })
      .eq("is_visible", true)
      .order("name")
      .range(from, to)

    if (categoryId) query = query.eq("category_id", categoryId)

    const { data, count } = await query

    const products = (data as Product[]) ?? []
    const total = count ?? products.length

    return {
      products,
      total,
      hasMore: from + products.length < total,
    }
  },
  ["catalog-products-paginated"],
  { revalidate: 300, tags: ["catalog", "products"] }
)
