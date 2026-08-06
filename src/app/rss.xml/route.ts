import { getAllPosts, getPostBySlug, getPostUrl } from "@/lib/blog"
import { mdxToHtml } from "@/lib/blog-rss-html"

const BASE_URL = "https://resurte.me"

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

export async function GET() {
  const posts = getAllPosts()

  const items: string[] = []
  for (const post of posts) {
    const source = getPostBySlug(post.slug)
    let contentHtml = `<p>${escapeXml(post.description)}</p>`
    if (source) {
      try {
        contentHtml = await mdxToHtml(source.content)
      } catch {
        // keep description-only fallback
      }
    }

    const categories = post.tags
      .map((t) => `<category>${escapeXml(t)}</category>`)
      .join("")

    items.push(`    <item>
      <title>${escapeXml(post.title)}</title>
      <link>${getPostUrl(post.slug)}</link>
      <guid isPermaLink="true">${getPostUrl(post.slug)}</guid>
      <description>${escapeXml(post.description)}</description>
      <content:encoded><![CDATA[${contentHtml}]]></content:encoded>
      <pubDate>${new Date(post.date).toUTCString()}</pubDate>
      ${categories}
    </item>`)
  }

  const lastBuildDate = new Date(posts[0]?.date ?? Date.now()).toUTCString()

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>Blog de Resurte.me — Recursos para Restaurantes</title>
    <link>${BASE_URL}/blog</link>
    <description>Guías prácticas para dueños de restaurantes en México: food cost, mermas, proveeduría, marketing y tecnología.</description>
    <language>es-mx</language>
    <lastBuildDate>${lastBuildDate}</lastBuildDate>
    <atom:link href="${BASE_URL}/rss.xml" rel="self" type="application/rss+xml"/>
    <image>
      <url>${BASE_URL}/apple-icon.webp</url>
      <title>Blog de Resurte.me</title>
      <link>${BASE_URL}/blog</link>
    </image>
${items.join("\n")}
  </channel>
</rss>`

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
    },
  })
}
