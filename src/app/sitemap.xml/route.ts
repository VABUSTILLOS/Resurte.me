import type { SitemapEntry } from "@/lib/structured-data"

const BASE_URL = "https://resurte.me"

export async function GET() {
  // Dynamic imports to avoid build-time evaluation when DB isn't ready
  const [
    { ACTIVE_CITIES, DEFAULT_CITY_SLUG },
    { getAllPosts },
    { generateSitemapXml },
    { BLOG_CATEGORIES },
    { getPriceIndexUrlSlugs },
    { DEFAULT_TIMEZONE, dayKeyOf },
  ] = await Promise.all([
    import("@/lib/cities"),
    import("@/lib/blog"),
    import("@/lib/structured-data"),
    import("@/lib/blog-categories"),
    import("@/lib/price-index"),
    import("@/lib/local-date"),
  ])

  // El catálogo cambia a diario, así que las páginas que lo muestran sí llevan
  // `lastmod` real. Las institucionales (/privacy, /terms, /careers) no: su
  // contenido no cambia y declarar lo contrario entrena a Google a ignorar la
  // etiqueta.
  const catalogDay = dayKeyOf(DEFAULT_TIMEZONE)

  const entries: SitemapEntry[] = [
    // La portada `/` NO se anuncia: `src/proxy.ts` la resuelve por IP y
    // responde 307 hacia la ciudad activa, así que no es una URL indexable.
    // La landing que sí se indexa es `/{ciudad}` (abajo, prioridad 1.0).
    // Páginas institucionales públicas (indexables). /auth/* se excluye:
    // llevan noindex y antes aparecían en el sitemap pese a estar
    // bloqueadas en robots.txt — señales contradictorias para Google.
    { url: `${BASE_URL}/about`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${BASE_URL}/contact`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${BASE_URL}/soporte`, changeFrequency: "monthly", priority: 0.6 },
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

  // Solo ciudades con cobertura. Las páginas "próximamente" se conservan
  // accesibles, pero llevan noindex y no deben anunciarse en el sitemap.
  for (const city of ACTIVE_CITIES) {
    // Cada ciudad es canónica de sí misma y es la landing que realmente se
    // indexa (la portada redirige aquí), así que la ciudad por defecto va con
    // la prioridad más alta del sitemap.
    entries.push({
      url: `${BASE_URL}/${city.slug}`,
      changeFrequency: "daily",
      priority: city.slug === DEFAULT_CITY_SLUG ? 1.0 : 0.9,
      lastModified: catalogDay,
    })
    // /buscar y /carrito llevan noindex (páginas transaccionales / resultados
    // de búsqueda interna) y no deben estar en el sitemap.

    // Zonas de entrega: la página que responde "¿entregan en mi colonia?".
    // Cambia poco, pero es la que captura la búsqueda local de cobertura.
    entries.push({
      url: `${BASE_URL}/${city.slug}/zonas-de-entrega`,
      changeFrequency: "monthly",
      priority: 0.8,
    })

    // Category pages per city
    for (const catSlug of categorySlugs) {
      entries.push({
        url: `${BASE_URL}/${city.slug}/categoria/${catSlug}`,
        changeFrequency: "daily",
        priority: 0.7,
        lastModified: catalogDay,
      })
    }

    // Collection pages per city
    for (const collSlug of collectionSlugs) {
      entries.push({
        url: `${BASE_URL}/${city.slug}/coleccion/${collSlug}`,
        changeFrequency: "weekly",
        priority: 0.6,
        lastModified: catalogDay,
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
  entries.push({
    url: `${BASE_URL}/comer`,
    changeFrequency: "daily",
    priority: 0.9,
    lastModified: catalogDay,
  })

  // Micrositios de restaurantes y su sitio IA (Fase 6). Se listan el micrositio
  // de pedidos y la carta indexable de cada restaurante activo, más las páginas
  // de contenido que el dueño publicó. Solo lo publicado: la RLS anónima
  // filtra los borradores y el sitemap no debe anunciar lo que da 404.
  try {
    const [{ getPublicMarketplace }, { createPublicClient }, { listPublishedSeoPages }, { menuPath, restaurantPath, seoPagePath }] =
      await Promise.all([
        import("@/lib/foodos-public"),
        import("@/lib/supabase/public"),
        import("@/lib/foodos-seo-pages"),
        import("@/lib/foodos-seo"),
      ])

    const marketplace = await getPublicMarketplace()
    const supabase = createPublicClient()

    for (const entry of marketplace) {
      const slug = entry.restaurant.slug
      if (!slug) continue
      entries.push({
        url: `${BASE_URL}${restaurantPath(slug)}`,
        changeFrequency: "daily",
        priority: 0.9,
        lastModified: catalogDay,
      })
      entries.push({
        url: `${BASE_URL}${menuPath(slug)}`,
        changeFrequency: "weekly",
        priority: 0.8,
        lastModified: catalogDay,
      })

      if (!supabase) continue
      const pages = await listPublishedSeoPages(supabase, entry.restaurant.id, 50)
      for (const page of pages) {
        if (!page.slug) continue
        entries.push({
          url: `${BASE_URL}${seoPagePath(slug, page.slug)}`,
          changeFrequency: "monthly",
          priority: 0.6,
          lastModified: page.updated_at,
        })
      }
    }
  } catch {
    // Supabase not configured — se queda el directorio /comer
  }

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
