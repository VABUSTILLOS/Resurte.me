import type { SitemapEntry } from "@/lib/structured-data"
import { getCachedActiveCities } from "@/lib/catalog-cache"

const BASE_URL = "https://resurte.me"

export async function GET() {
  // Dynamic imports to avoid build-time evaluation when DB isn't ready
  const [{ MEXICO_CITIES }, { getAllPosts }, { generateSitemapXml }] =
    await Promise.all([
      import("@/lib/cities"),
      import("@/lib/blog"),
      import("@/lib/structured-data"),
    ])

  const entries: SitemapEntry[] = [
    { url: BASE_URL, changeFrequency: "daily", priority: 1.0 },
    { url: `${BASE_URL}/auth/login`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${BASE_URL}/auth/register`, changeFrequency: "monthly", priority: 0.3 },
  ]

  // Fetch categories and collections from Supabase for URL generation
  let categorySlugs: string[] = []
  let collectionSlugs: string[] = []
  try {
    const { getCachedCategories, getCachedActiveCollections } = await import(
      "@/lib/catalog-cache"
    )
    const [cats, colls] = await Promise.all([
      getCachedCategories(),
      getCachedActiveCollections(),
    ])
    categorySlugs = cats.map((c: { slug: string }) => c.slug)
    collectionSlugs = colls.map((c: { slug: string }) => c.slug)
  } catch {
    // Supabase not configured — skip dynamic URLs
  }

  // Ciudades: las activas en DB cuando Supabase está disponible; si la tabla
  // no devuelve nada (DB vacía o sin configurar), se usan todas las estáticas.
  let activeCitySlugs: string[] = []
  try {
    const cities = await getCachedActiveCities()
    if (cities.length > 0) activeCitySlugs = cities.map((c) => c.slug)
  } catch {
    // Supabase not configured — fallback to all static cities
  }

  for (const city of MEXICO_CITIES) {
    if (activeCitySlugs.length > 0 && !activeCitySlugs.includes(city.slug)) continue
    entries.push({ url: `${BASE_URL}/${city.slug}`, changeFrequency: "daily", priority: 0.9 })
    entries.push({ url: `${BASE_URL}/${city.slug}/buscar`, changeFrequency: "daily", priority: 0.7 })
    entries.push({ url: `${BASE_URL}/${city.slug}/carrito`, changeFrequency: "weekly", priority: 0.5 })

    // Category pages per city
    for (const catSlug of categorySlugs) {
      entries.push({
        url: `${BASE_URL}/${city.slug}/categoria/${catSlug}`,
        changeFrequency: "daily",
        priority: 0.7,
      })
    }

    // Collection pages per city
    for (const collSlug of collectionSlugs) {
      entries.push({
        url: `${BASE_URL}/${city.slug}/coleccion/${collSlug}`,
        changeFrequency: "weekly",
        priority: 0.6,
      })
    }
  }

  entries.push({ url: `${BASE_URL}/admin`, changeFrequency: "weekly", priority: 0.4 })
  entries.push({ url: `${BASE_URL}/admin/pedidos`, changeFrequency: "weekly", priority: 0.4 })
  entries.push({ url: `${BASE_URL}/admin/whatsapp`, changeFrequency: "weekly", priority: 0.5 })

  // Blog
  entries.push({ url: `${BASE_URL}/blog`, changeFrequency: "weekly", priority: 0.8 })
  for (const post of getAllPosts()) {
    entries.push({
      url: `${BASE_URL}/blog/${post.slug}`,
      changeFrequency: "monthly",
      priority: 0.7,
      lastModified: post.updatedAt,
    })
  }

  // Marketplace hoyquecomemos
  entries.push({ url: `${BASE_URL}/comer`, changeFrequency: "daily", priority: 0.9 })

  const xml = generateSitemapXml(entries)

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
    },
  })
}
