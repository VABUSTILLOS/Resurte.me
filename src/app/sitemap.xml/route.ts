import type { SitemapEntry } from "@/lib/structured-data"

const BASE_URL = "https://resurte.me"

export async function GET() {
  // Dynamic imports to avoid build-time evaluation when DB isn't ready
  const [{ createClient }, { MEXICO_CITIES }, { getAllPosts }, { generateSitemapXml }] =
    await Promise.all([
      import("@/lib/supabase/server"),
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
    const supabase = await createClient()
    const [cats, colls] = await Promise.all([
      supabase.from("categories").select("slug").then(({ data }) => data ?? []),
      supabase.from("restaurant_collections").select("slug").eq("is_active", true).then(({ data }) => data ?? []),
    ])
    categorySlugs = cats.map((c: { slug: string }) => c.slug)
    collectionSlugs = colls.map((c: { slug: string }) => c.slug)
  } catch {
    // Supabase not configured — skip dynamic URLs
  }

  for (const city of MEXICO_CITIES) {
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
