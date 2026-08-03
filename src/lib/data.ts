import { createClient } from "@/lib/supabase/server"
import type { City, Store, Category, Product, ProductStore } from "@/types"

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
  categoryId?: number
): Promise<(Product & { price: number; sale_price: number | null; stock_status: string })[]> {
  const supabase = await createClient()
  let query = supabase
    .from("products")
    .select(
      `*, product_stores!inner(price, sale_price, stock_status)`
    )
    .eq("product_stores.store_id", storeId)
    .eq("product_stores.is_available", true)
    .order("name")

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
