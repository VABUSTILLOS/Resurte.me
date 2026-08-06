import { MEXICO_CITIES } from "@/lib/cities"
import { getAllPosts } from "@/lib/blog"
import { generateSitemapXml } from "@/lib/structured-data"
import type { SitemapEntry } from "@/lib/structured-data"

const BASE_URL = "https://resurte.me"

export async function GET() {
  const entries: SitemapEntry[] = [
    { url: BASE_URL, changeFrequency: "daily", priority: 1.0 },
    { url: `${BASE_URL}/auth/login`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${BASE_URL}/auth/register`, changeFrequency: "monthly", priority: 0.3 },
  ]

  for (const city of MEXICO_CITIES) {
    entries.push({ url: `${BASE_URL}/${city.slug}`, changeFrequency: "daily", priority: 0.9 })
    entries.push({ url: `${BASE_URL}/${city.slug}/buscar`, changeFrequency: "daily", priority: 0.7 })
    entries.push({ url: `${BASE_URL}/${city.slug}/carrito`, changeFrequency: "weekly", priority: 0.5 })
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

  const xml = generateSitemapXml(entries)

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
    },
  })
}
