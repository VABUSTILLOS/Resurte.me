import { NextResponse } from "next/server"
import {
  getCachedActiveCities,
  getCachedActiveCollections,
  getCachedCategories,
  getCachedVisibleProducts,
} from "@/lib/catalog-cache"
import { MEXICO_CITIES } from "@/lib/cities"
import type { Category, Product, RestaurantCollection } from "@/types"

// ============================================================
// /api/feed/catalogo.json — catálogo público en JSON para agentes
// ============================================================
// Feed estable y versionado para LLM, agentes y consumidores externos.
// No duplica lógica de catálogo: lee de la MISMA capa cacheada que usan las
// páginas del sitio (src/lib/catalog-cache.ts → src/lib/data.ts), así que
// precios, visibilidad y disponibilidad nunca se desincronizan del sitio.
//
// Sin Supabase configurado, data.ts devuelve colecciones vacías (no lanza):
// el feed degrada a `status: "partial"` con el índice estático de ciudades
// (MEXICO_CITIES) y sin productos, en vez de fallar. Mismo criterio que
// sitemap.xml.
//
// CRÍTICO: sin cookies() ni headers() — solo lecturas cacheadas.

export const runtime = "nodejs"

const BASE_URL = "https://resurte.me"

/** Versión del contrato del feed. Subir ante cualquier cambio incompatible. */
const FEED_VERSION = "1.0"

const CACHE_CONTROL =
  "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800"

interface FeedCity {
  id: number
  name: string
  slug: string
  state: string
  url: string
}

interface FeedCategory {
  id: number
  name: string
  slug: string
  /** Plantilla de URL: las categorías no tienen página propia, viven por ciudad. */
  urlPattern: string
  description: string | null
}

interface FeedItem {
  id: number
  slug: string
  name: string
  brand: string
  description: string
  categoryId: number
  categorySlug: string | null
  categoryName: string | null
  unit: string | null
  price: number
  salePrice: number | null
  currency: "MXN"
  stockStatus: Product["stock_status"]
  available: boolean
  tags: string[]
  imageUrl: string
}

export async function GET() {
  // Ciudades: las activas en DB cuando Supabase está disponible; si la tabla
  // no devuelve nada (DB vacía o sin configurar), se usan todas las estáticas.
  let cities: FeedCity[] = MEXICO_CITIES.map((city) => ({
    id: city.id,
    name: city.name,
    slug: city.slug,
    state: city.state,
    url: `${BASE_URL}/${city.slug}`,
  }))

  let categories: FeedCategory[] = []
  let collections: { name: string; slug: string; description: string | null; tags: string[] }[] = []
  let products: Product[] = []

  try {
    const [dbCities, dbCategories, dbCollections, dbProducts] = await Promise.all([
      getCachedActiveCities(),
      getCachedCategories(),
      getCachedActiveCollections(),
      getCachedVisibleProducts(),
    ])

    if (dbCities.length > 0) {
      cities = dbCities.map((city) => ({
        id: city.id,
        name: city.name,
        slug: city.slug,
        state: city.state,
        url: `${BASE_URL}/${city.slug}`,
      }))
    }

    categories = dbCategories.map((category: Category) => ({
      id: category.id,
      name: category.name,
      slug: category.slug,
      urlPattern: `${BASE_URL}/{ciudad}/categoria/${category.slug}`,
      description: category.description ?? null,
    }))

    collections = dbCollections.map((collection: RestaurantCollection) => ({
      name: collection.name,
      slug: collection.slug,
      description: collection.description,
      tags: collection.tags ?? [],
    }))

    products = dbProducts
  } catch {
    // Supabase no configurado o consulta fallida: se sirve solo el índice de
    // ciudades y `status: "partial"` avisa al consumidor del feed.
  }

  const categoryById = new Map(categories.map((c) => [c.id, c]))

  const items: FeedItem[] = products.map((product) => {
    const category = categoryById.get(product.category_id)
    return {
      id: product.id,
      slug: product.slug,
      name: product.name,
      brand: product.brand,
      description: product.description,
      categoryId: product.category_id,
      categorySlug: category?.slug ?? null,
      categoryName: category?.name ?? null,
      unit: product.unit ?? null,
      price: product.price,
      salePrice: product.sale_price,
      currency: "MXN",
      stockStatus: product.stock_status,
      available: product.stock_status !== "out_of_stock",
      tags: product.tags ?? [],
      imageUrl: product.image_url,
    }
  })

  // Páginas de categoría por ciudad: mismo patrón de URL que publica el sitio
  // en /{ciudad}/categoria/{categoria} (ver sitemap.xml).
  const categoryPages = cities.flatMap((city) =>
    categories.map((category) => ({
      city: city.name,
      citySlug: city.slug,
      category: category.name,
      categorySlug: category.slug,
      url: `${BASE_URL}/${city.slug}/categoria/${category.slug}`,
    }))
  )

  const partial = categories.length === 0 && items.length === 0

  return NextResponse.json(
    {
      version: FEED_VERSION,
      generatedAt: new Date().toISOString(),
      count: items.length,
      status: partial ? "partial" : "ok",
      note: partial
        ? "Catálogo no disponible en este entorno (Supabase sin configurar). El feed sigue publicando el índice de ciudades y la estructura completa del contrato."
        : undefined,
      baseUrl: BASE_URL,
      currency: "MXN",
      // Los productos son por ciudad: {ciudad} y {producto} se sustituyen por
      // el slug de ciudad y el slug del producto.
      urlPatterns: {
        city: `${BASE_URL}/{ciudad}`,
        categoryPage: `${BASE_URL}/{ciudad}/categoria/{categoria}`,
        collectionPage: `${BASE_URL}/{ciudad}/coleccion/{coleccion}`,
        product: `${BASE_URL}/{ciudad}/producto/{producto}`,
      },
      cities,
      categories,
      collections,
      categoryPages,
      items,
    },
    { headers: { "Cache-Control": CACHE_CONTROL } }
  )
}
