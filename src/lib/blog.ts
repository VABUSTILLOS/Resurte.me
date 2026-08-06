import fs from "node:fs"
import path from "node:path"
import matter from "gray-matter"

// ============================================================
// BLOG DE RESURTE.ME — lectura de posts MDX locales
// Los posts viven en src/content/blog/*.mdx (estáticos, mejor SEO).
// ============================================================

export const BLOG_DIR = path.join(process.cwd(), "src", "content", "blog")

export interface BlogFAQ {
  question: string
  answer: string
}

export interface BlogPostMeta {
  slug: string
  title: string
  description: string
  category: string
  date: string
  updatedAt: string
  author: string
  authorRole?: string
  coverImage?: string
  coverAlt?: string
  tags: string[]
  featured?: boolean
  readingTime: number // minutos de lectura estimados
  faq?: BlogFAQ[]
}

function normalizeFrontmatter(
  slug: string,
  data: Record<string, unknown>
): BlogPostMeta {
  const date = String(data.date ?? "")
  const updatedAt = String(data.updatedAt ?? date)
  const tags = Array.isArray(data.tags) ? data.tags.map(String) : []
  const faq = Array.isArray(data.faq)
    ? data.faq
        .filter(
          (f): f is Record<string, unknown> =>
            !!f && typeof f === "object" && "question" in f && "answer" in f
        )
        .map((f) => ({
          question: String(f.question),
          answer: String(f.answer),
        }))
    : undefined

  const title = String(data.title ?? slug)
  const raw = String(data.description ?? "")
  const readingTime = estimateReadingTime(raw)

  return {
    slug,
    title,
    description: raw,
    category: String(data.category ?? "industria"),
    date,
    updatedAt,
    author: String(data.author ?? "Resurte.me"),
    authorRole: data.authorRole ? String(data.authorRole) : undefined,
    coverImage: data.coverImage ? String(data.coverImage) : undefined,
    coverAlt: data.coverAlt ? String(data.coverAlt) : undefined,
    tags,
    featured: data.featured === true,
    readingTime,
    faq,
  }
}

function estimateReadingTime(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length
  return Math.max(1, Math.round(words / 200))
}

function readPostFile(slug: string): { content: string; data: BlogPostMeta } | null {
  const file = path.join(BLOG_DIR, `${slug}.mdx`)
  if (!fs.existsSync(file)) return null
  const raw = fs.readFileSync(file, "utf-8")
  const { content, data } = matter(raw)
  return { content, data: normalizeFrontmatter(slug, data) }
}

/** Todos los posts, ordenados por fecha (más reciente primero). */
export function getAllPosts(): BlogPostMeta[] {
  if (!fs.existsSync(BLOG_DIR)) return []
  const files = fs
    .readdirSync(BLOG_DIR)
    .filter((f) => f.endsWith(".mdx"))
    .map((f) => f.replace(/\.mdx$/, ""))
  const posts: BlogPostMeta[] = []
  for (const slug of files) {
    const post = readPostFile(slug)
    if (post) posts.push(post.data)
  }
  return posts.sort((a, b) => (a.date < b.date ? 1 : -1))
}

export function getPostBySlug(slug: string): { content: string; data: BlogPostMeta } | null {
  return readPostFile(slug)
}

export function getPostSlugs(): string[] {
  if (!fs.existsSync(BLOG_DIR)) return []
  return fs
    .readdirSync(BLOG_DIR)
    .filter((f) => f.endsWith(".mdx"))
    .map((f) => f.replace(/\.mdx$/, ""))
}

/** Posts de la misma categoría, excluyendo el post actual. */
export function getRelatedPosts(slug: string, limit = 3): BlogPostMeta[] {
  const current = getPostBySlug(slug)
  if (!current) return []
  return getAllPosts()
    .filter((p) => p.slug !== slug && p.category === current.data.category)
    .slice(0, limit)
}

/** Filtro simple por texto (título, descripción y tags). */
export function searchPosts(query: string): BlogPostMeta[] {
  const q = query.trim().toLowerCase()
  if (!q) return getAllPosts()
  return getAllPosts().filter((p) => {
    const haystack = [p.title, p.description, p.category, ...p.tags]
      .join(" ")
      .toLowerCase()
    return haystack.includes(q)
  })
}

/** URL canónica de un post. */
export function getPostUrl(slug: string): string {
  return `https://resurte.me/blog/${slug}`
}
