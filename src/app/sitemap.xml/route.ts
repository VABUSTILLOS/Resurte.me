import type { SitemapEntry } from "@/lib/structured-data"
import { getCachedActiveCities } from "@/lib/catalog-cache"

const BASE_URL = "https://resurte.me"

export async function GET() {
  // Dynamic imports to avoid build-time evaluation when DB isn't ready
  const [
    { MEXICO_CITIES },
    { getAllPosts },
    { generateSitemapXml },
    { BLOG_CATEGORIES },
    { getPriceIndexUrlSlugs },
  ] = await Promise.all([
    import("@/lib/cities"),
    import("@/lib/blog"),
    import("@/lib/structured-data"),
    import("@/lib/blog-categories"),
    import("@/lib/price-index"),
  ])

  const entries: SitemapEntry[] = [
    { url: BASE_URL, changeFrequency: "daily", priority: 1.0 },
    // Páginas institucionales públicas (indexables). /auth/* se excluye:
    // llevan noindex y antes aparecían en el sitemap pese a estar
    // bloqueadas en robots.txt — señales contradictorias para Google.
    { url: `${BASE_URL}/about`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${BASE_URL}/contact`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${BASE_URL}/faq`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${BASE_URL}/preguntas`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${BASE_URL}/ciudades`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${BASE_URL}/comercializacion`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${BASE_URL}/recompensas`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${BASE_URL}/negocio`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${BASE_URL}/careers`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${BASE_URL}/privacy`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${BASE_URL}/terms`, changeFrequency: "yearly", priority: 0.2 },
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
    // /buscar y /carrito llevan noindex (páginas transaccionales / resultados
    // de búsqueda interna) y no deben estar en el sitemap.

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

  // Blog
  entries.push({ url: `${BASE_URL}/blog`, changeFrequency: "weekly", priority: 0.8 })
  for (const category of BLOG_CATEGORIES) {
    entries.push({
      url: `${BASE_URL}/blog/categoria/${category.slug}`,
      changeFrequency: "weekly",
      priority: 0.7,
    })
  }
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

  // Índice de precios (Fase 6): el hub, una página por insumo publicado y una
  // por ciudad. Los slugs salen de `getPriceIndexUrlSlugs`, congelado por
  // despliegue, porque las páginas usan `dynamicParams = false`: el sitemap no
  // puede anunciar slugs que no se prerenderizaron en el build. Si la tabla
  // todavía no existe solo queda el hub, que igual responde con la metodología.
  entries.push({ url: `${BASE_URL}/precios`, changeFrequency: "weekly", priority: 0.8 })
  try {
    const { insumos, ciudades } = await getPriceIndexUrlSlugs()
    for (const insumoSlug of insumos) {
      entries.push({
        url: `${BASE_URL}/precios/${insumoSlug}`,
        changeFrequency: "weekly",
        priority: 0.6,
      })
    }
    for (const ciudadSlug of ciudades) {
      entries.push({
        url: `${BASE_URL}/precios/ciudad/${ciudadSlug}`,
        changeFrequency: "weekly",
        priority: 0.6,
      })
    }
  } catch {
    // Supabase not configured — el hub de precios ya quedó en el sitemap
  }

  const xml = generateSitemapXml(entries)

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
    },
  })
}
