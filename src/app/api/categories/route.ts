import { NextResponse } from "next/server"
import { getCachedCategories, getCachedVisibleProducts } from "@/lib/catalog-cache"
import type { Category, Product } from "@/types"

// ============================================================
// /api/categories — categorías con conteo de productos
// ============================================================
// Lo consume el mega-menú del header. No duplica lógica de catálogo: lee de
// la MISMA capa cacheada que las páginas (src/lib/catalog-cache.ts), así que
// nombres, orden y visibilidad nunca se desincronizan del sitio.
//
// El conteo se calcula sobre el catálogo visible completo (no por ciudad):
// es una cifra de orientación para el menú, no una promesa de disponibilidad
// local. La disponibilidad por ciudad la resuelve la página de categoría.
//
// CRÍTICO: sin cookies() ni headers() — solo lecturas cacheadas.

export const runtime = "nodejs"

const CACHE_CONTROL =
  "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800"

export interface ApiCategory {
  id: number
  name: string
  slug: string
  icon: string | null
  count: number
}

export async function GET() {
  const [categories, products] = await Promise.all([
    getCachedCategories(),
    getCachedVisibleProducts(),
  ])

  const counts = new Map<number, number>()
  for (const product of products as Product[]) {
    if (product.category_id == null) continue
    counts.set(product.category_id, (counts.get(product.category_id) ?? 0) + 1)
  }

  const payload: ApiCategory[] = (categories as Category[]).map((category) => ({
    id: category.id,
    name: category.name,
    slug: category.slug,
    icon: category.icon ?? null,
    count: counts.get(category.id) ?? 0,
  }))

  return NextResponse.json(
    { categories: payload },
    { headers: { "Cache-Control": CACHE_CONTROL } }
  )
}
