import { revalidateTag, unstable_cache } from "next/cache"
import type { Category, Product, RestaurantCollection } from "@/types"
import {
  getCategories,
  getCategoryById,
  getCategoryBySlug,
  getProductBySlug,
  getProducts,
  getProductsByCollection,
  getProductsPaginated,
  getRestaurantCollectionBySlug,
  getRestaurantCollections,
} from "@/lib/data"

// ============================================================
// Lecturas de catálogo con caché (unstable_cache).
//
// Estos wrappers delegan en la capa única de acceso a datos
// (src/lib/data.ts). Las funciones de data.ts usan el cliente
// público SIN cookies (createPublicClient), porque dentro del
// scope de unstable_cache no se pueden leer cookies() ni
// headers(). RLS expone la misma data pública a todos los
// visitantes, así que el resultado se comparte entre requests
// y se revalida por TTL.
//
// Tags disponibles para revalidación manual con revalidateTag():
//   "catalog", "categories", "products", "collections"
// ============================================================

export const getCachedCategories = unstable_cache(
  async (): Promise<Category[]> => getCategories(),
  ["catalog-categories"],
  { revalidate: 3600, tags: ["catalog", "categories"] }
)

export const getCachedVisibleProducts = unstable_cache(
  async (): Promise<Product[]> => getProducts(),
  ["catalog-products"],
  { revalidate: 300, tags: ["catalog", "products"] }
)

export const getCachedActiveCollections = unstable_cache(
  async (): Promise<RestaurantCollection[]> => getRestaurantCollections(),
  ["catalog-collections"],
  { revalidate: 3600, tags: ["catalog", "collections"] }
)

export const getCachedCategoryBySlug = unstable_cache(
  async (slug: string): Promise<Category | null> => getCategoryBySlug(slug),
  ["catalog-category-by-slug"],
  { revalidate: 3600, tags: ["catalog", "categories"] }
)

export const getCachedProductsByCategory = unstable_cache(
  async (categoryId: number): Promise<Product[]> => getProducts(categoryId),
  ["catalog-products-by-category"],
  { revalidate: 300, tags: ["catalog", "products"] }
)

export const getCachedCollectionBySlug = unstable_cache(
  async (slug: string): Promise<RestaurantCollection | null> =>
    getRestaurantCollectionBySlug(slug),
  ["catalog-collection-by-slug"],
  { revalidate: 3600, tags: ["catalog", "collections"] }
)

export const getCachedProductBySlug = unstable_cache(
  async (slug: string): Promise<Product | null> => getProductBySlug(slug),
  ["catalog-product-by-slug"],
  { revalidate: 300, tags: ["catalog", "products"] }
)

export const getCachedCategoryById = unstable_cache(
  async (id: number): Promise<Category | null> => getCategoryById(id),
  ["catalog-category-by-id"],
  { revalidate: 3600, tags: ["catalog", "categories"] }
)

export const getCachedProductsByCollection = unstable_cache(
  async (collectionSlug: string): Promise<Product[]> =>
    getProductsByCollection(collectionSlug),
  ["catalog-products-by-collection"],
  { revalidate: 300, tags: ["catalog", "products"] }
)

export interface CachedPaginatedProducts {
  products: Product[]
  total: number
  hasMore: boolean
}

export const getCachedProductsPaginated = unstable_cache(
  async (
    page: number,
    pageSize: number,
    categoryId?: number
  ): Promise<CachedPaginatedProducts> =>
    getProductsPaginated(page, pageSize, categoryId),
  ["catalog-products-paginated"],
  { revalidate: 300, tags: ["catalog", "products"] }
)

/**
 * Invalida el caché del catálogo completo (productos, categorías y
 * colecciones). Úsala después de escribir el catálogo desde el panel admin
 * para que los cambios se reflejen en la tienda sin esperar el TTL.
 *
 * profile="max" usa stale-while-revalidate: la próxima visita sirve el
 * contenido previo y refresca en background (recomendado por la doc de
 * Next.js; la forma de un argumento está deprecada).
 */
export function revalidateCatalogCache(): void {
  revalidateTag("catalog", "max")
}
