import fs from "node:fs"
import path from "node:path"
import matter from "gray-matter"
import { searchPosts as filterPostsByQuery } from "./blog-search"

// ============================================================
// BLOG DE RESURTE.ME — lectura de posts MDX locales
// Los posts viven en src/content/blog/*.mdx (estáticos, mejor SEO).
// ============================================================

const BLOG_DIR = path.join(process.cwd(), "src", "content", "blog")

interface BlogFAQ {
  question: string
  answer: string
}

/** Activos de Resurte.me a los que puede llevar un CTA. */
type BlogCTAVariant = "coleccion" | "herramienta" | "crecimiento"

/** Configuración del CTA de cierre de un post (override por frontmatter). */
interface BlogCTAConfig {
  variant: BlogCTAVariant
  title?: string
  cta?: string
  href?: string
  collectionSlug?: string
  collectionName?: string
}

export interface BlogPostMeta {
  slug: string
  title: string
  description: string
  category: string
  contentType?: string
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
  cta?: BlogCTAConfig
}

interface BlogFrontmatter {
  date?: unknown
  updatedAt?: unknown
  tags?: unknown
  faq?: unknown
  cta?: unknown
  title?: unknown
  description?: unknown
  category?: unknown
  contentType?: unknown
  author?: unknown
  authorRole?: unknown
  coverImage?: unknown
  coverAlt?: unknown
  featured?: unknown
}

function normalizeFrontmatter(
  slug: string,
  data: BlogFrontmatter,
  body?: string
): BlogPostMeta {
  const date = String(data.date ?? "")
  const updatedAt = String(data.updatedAt ?? date)
  const tags = Array.isArray(data.tags) ? data.tags.map(String) : []
  const faq = Array.isArray(data.faq)
    ? data.faq
        .filter(
          (f): f is { question: unknown; answer: unknown } =>
            !!f && typeof f === "object" && "question" in f && "answer" in f
        )
        .map((f) => ({
          question: String(f.question),
          answer: String(f.answer),
        }))
    : undefined

  // CTA de cierre: opcional por frontmatter; si no viene, se deriva por categoría.
  let cta: BlogCTAConfig | undefined
  if (data.cta && typeof data.cta === "object" && !Array.isArray(data.cta)) {
    const c = data.cta as { variant?: unknown; title?: unknown; cta?: unknown; href?: unknown; collectionSlug?: unknown; collectionName?: unknown }
    const variant = ["coleccion", "herramienta", "crecimiento"].includes(
      String(c.variant)
    )
      ? (String(c.variant) as BlogCTAVariant)
      : undefined
    cta = variant
      ? {
          variant,
          title: c.title ? String(c.title) : undefined,
          cta: c.cta ? String(c.cta) : undefined,
          href: c.href ? String(c.href) : undefined,
          collectionSlug: c.collectionSlug ? String(c.collectionSlug) : undefined,
          collectionName: c.collectionName
            ? String(c.collectionName)
            : undefined,
        }
      : undefined
  }

  const title = String(data.title ?? slug)
  const description = String(data.description ?? "")
  const readingTime = estimateReadingTime(body?.trim() || description)

  return {
    slug,
    title,
    description,
    category: String(data.category ?? "industria"),
    contentType: data.contentType ? String(data.contentType) : undefined,
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
    cta,
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
  return { content, data: normalizeFrontmatter(slug, data, content) }
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
/** Normaliza una categoría a su slug canónico (sinónimos → canónico). */
function normalizeCategory(slug: string): string {
  const s = slug.trim().toLowerCase()
  return CATEGORY_SYNONYMS[s] ?? s
}

/** Normaliza un tag para comparar de forma consistente. */
function normalizeTag(tag: string): string {
  return tag
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
}

/**
 * Devuelve los posts más relacionados al indicado: puntúa por categoría
 * (con sinónimos normalizados) y por etiquetas compartidas, y rompe
 * empates favoreciendo los artículos más recientes.
 */
export function getRelatedPosts(slug: string, limit = 3): BlogPostMeta[] {
  const current = getPostBySlug(slug)
  if (!current) return []

  const currentCategory = normalizeCategory(current.data.category)
  const currentTags = new Set(current.data.tags.map(normalizeTag))
  const currentTime = new Date(current.data.date).getTime() || 0
  const DAY = 24 * 60 * 60 * 1000

  return getAllPosts()
    .filter((p) => p.slug !== slug)
    .map((p) => {
      let score = 0
      if (normalizeCategory(p.category) === currentCategory) score += 2
      for (const tag of p.tags.map(normalizeTag)) {
        if (currentTags.has(tag)) score += 3
      }
      // Pequeño ajuste de recencia (±0.5 máx) para favorecer artículos recientes.
      const pTime = new Date(p.date).getTime() || 0
      score += Math.max(-0.5, Math.min(0.5, (pTime - currentTime) / (30 * DAY)))
      return { post: p, score }
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        (new Date(b.post.date).getTime() || 0) - (new Date(a.post.date).getTime() || 0)
    )
    .slice(0, limit)
    .map((r) => r.post)
}

/** CTA de cierre resuelto para un post (frontmatter o default por categoría). */
export interface ResolvedPostCta {
  variant: BlogCTAVariant
  eyebrow: string
  title: string
  cta: string
  href?: string
  collectionSlug?: string
  collectionName?: string
}

const CATEGORY_SYNONYMS: Record<string, string> = {
  operaciones: "operacion",
  administracion: "costos",
  admin: "costos",
  abastecimiento: "proveeduria",
  proveedores: "proveeduria",
  compras: "proveeduria",
  crecimiento: "marketing",
  tecnologia: "herramientas",
}

const DEFAULT_CTA_TEXTS: Record<BlogCTAVariant, ResolvedPostCta> = {
  coleccion: {
    variant: "coleccion",
    eyebrow: "Colecciones Resurte.me",
    title:
      "Compara precios reales por mayoreo de los insumos de tu cocina y compra directo a distribuidores.",
    cta: "Ver colección",
    collectionSlug: "comida-mexicana-corrida",
    collectionName: "Comida mexicana corrida",
  },
  herramienta: {
    variant: "herramienta",
    eyebrow: "Herramienta Resurte.me",
    title:
      "Mide, controla y haz crecer la rentabilidad de tu restaurante con las herramientas del Panel.",
    cta: "Abrir herramienta",
    href: "/panel/costeo",
  },
  crecimiento: {
    variant: "crecimiento",
    eyebrow: "Tienda de Crecimiento",
    title:
      "Guías, plantillas y estrategias listas para llenar tu restaurante de clientes.",
    cta: "Ir a la Tienda de Crecimiento",
    href: "/recompensas",
  },
}

const CATEGORY_CTA: Record<string, Partial<ResolvedPostCta>> = {
  costos: {
    variant: "herramienta",
    eyebrow: "Herramienta Resurte.me",
    title:
      "Costea tu menú y recupera margen con la calculadora de food cost del Panel.",
    cta: "Calcular mi food cost",
    href: "/panel/costeo",
  },
  operacion: {
    variant: "herramienta",
    eyebrow: "Herramienta Resurte.me",
    title:
      "Controla mermas e inventario sin hojas de cálculo con el Panel de Resurte.me.",
    cta: "Probar control de mermas",
    href: "/panel/mermas",
  },
  administracion: {
    variant: "herramienta",
    eyebrow: "Herramienta Resurte.me",
    title:
      "Facturación y cotizaciones sin dolores de cabeza para tu negocio de comida.",
    cta: "Ver cómo facturar",
    href: "/negocio/facturacion",
  },
  proveeduria: {
    variant: "coleccion",
    eyebrow: "Colecciones Resurte.me",
    title:
      "Encuentra los insumos de tu tipo de cocina con precios por mayoreo de tu zona.",
    cta: "Ver precios por mayoreo",
    collectionSlug: "comida-mexicana-corrida",
    collectionName: "Comida mexicana corrida",
  },
  marketing: {
    variant: "crecimiento",
    eyebrow: "Tienda de Crecimiento",
    title:
      "Guías y plantillas para atraer más clientes a tu restaurante y fidelizarlos.",
    cta: "Explorar la Tienda de Crecimiento",
    href: "/recompensas",
  },
  herramientas: {
    variant: "herramienta",
    eyebrow: "Herramientas Resurte.me",
    title:
      "Planificador, inventario, rentabilidad y más: todo el Panel para tu restaurante.",
    cta: "Abrir el Panel",
    href: "/panel",
  },
}

export function getPostCta(post: BlogPostMeta): ResolvedPostCta {
  const normalized = normalizeCategory(post.category)
  const categoryCfg = CATEGORY_CTA[normalized]
  const variant: BlogCTAVariant =
    post.cta?.variant ?? categoryCfg?.variant ?? "crecimiento"

  // Base = defaults del variante final + overrides de categoría (solo si la
  // categoría coincide con la variante final).
  const base: ResolvedPostCta = {
    ...DEFAULT_CTA_TEXTS[variant],
    ...(categoryCfg && categoryCfg.variant === variant ? categoryCfg : {}),
  }

  if (!post.cta) return base

  return {
    ...base,
    ...post.cta,
    variant,
  }
}

/** CTA de cierre del index del blog (como el de TenClientes en /blog). */
export function getBlogIndexCta(): ResolvedPostCta {
  return {
    variant: "coleccion",
    eyebrow: "Colecciones Resurte.me",
    title:
      "Compara precios reales por mayoreo de los insumos de tu cocina y compra directo a distribuidores.",
    cta: "Ver precios por mayoreo",
    collectionSlug: "comida-mexicana-corrida",
    collectionName: "Comida mexicana corrida",
  }
}

/** Filtro por texto (título, descripción y tags). Server-side: usa la lista completa de posts. */
export function searchPosts(query: string): BlogPostMeta[] {
  return filterPostsByQuery(getAllPosts(), query)
}

/** URL canónica de un post. */
export function getPostUrl(slug: string): string {
  return `https://resurte.me/blog/${slug}`
}
