import type { BlogPostMeta } from "./blog"
import { getPostUrl } from "./blog"
import { getCategory } from "./blog-categories"
import { extractHeadings } from "./heading-slug"
import { resolveAuthor, getAuthorReference, ORGANIZATION_ID, SITE_NAME } from "./author"

// ============================================================
// JSON-LD para el blog de Resurte.me
// ============================================================

const SITE = "https://resurte.me"

/**
 * Publisher como referencia a la Organization global del layout, no como
 * objeto suelto: así el Knowledge Graph une post → organización → autor
 * en vez de crear tres entidades homónimas sin relación.
 */
const PUBLISHER = {
  "@type": "Organization" as const,
  "@id": ORGANIZATION_ID,
  name: SITE_NAME,
  url: SITE,
  logo: { "@type": "ImageObject", url: `${SITE}/apple-icon.webp` },
}

/** Schema Blog para el índice /blog. */
export function getBlogIndexSchema(posts: BlogPostMeta[]) {
  return {
    "@context": "https://schema.org",
    "@type": "Blog",
    name: "Blog de Resurte.me — Recursos para Restaurantes",
    description:
      "Aprende a costear tu menú, reducir mermas, comprar por mayoreo y hacer crecer tu restaurante. Guías prácticas para dueños de restaurantes en México.",
    url: `${SITE}/blog`,
    inLanguage: "es-MX",
    publisher: PUBLISHER,
    /**
     * Entradas deliberadamente mínimas. Con 226 artículos, incluir
     * `description`, `author` e `image` por entrada producía ~217 KB de JSON-LD
     * que Next serializa dos veces (en el `<script>` y en el payload RSC).
     * Cada artículo ya publica su propio `BlogPosting` completo en su página;
     * aquí basta con identificar la lista para el grafo de entidades.
     */
    blogPost: posts.map((p) => ({
      "@type": "BlogPosting",
      headline: p.title,
      url: getPostUrl(p.slug),
      datePublished: p.date,
      dateModified: p.updatedAt,
    })),
  }
}

/** Schema BlogPosting para la página de un post. */
export function getBlogPostingSchema(post: BlogPostMeta) {
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.description,
    url: getPostUrl(post.slug),
    datePublished: post.date,
    dateModified: post.updatedAt,
    inLanguage: "es-MX",
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": getPostUrl(post.slug),
    },
    author: getAuthorReference(resolveAuthor(post.author)),
    publisher: PUBLISHER,
    image: post.coverImage ? `${SITE}${post.coverImage}` : undefined,
    keywords: post.tags.join(", "),
    articleSection: getCategory(post.category).label,
  }
}

/**
 * Schema HowTo para tutoriales (`contentType: tutorial`).
 *
 * Los pasos salen de los H2 del propio post, con el `id` de ancla que el
 * plugin rehype ya puso en el HTML. No hay que mantener una lista de pasos
 * a mano: si el autor edita el post, el schema sigue.
 */
export function getHowToSchema(post: BlogPostMeta, markdown: string) {
  const steps = extractHeadings(markdown).filter((h) => h.level === 2)
  if (steps.length < 2) return null

  const url = getPostUrl(post.slug)
  return {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: post.title,
    description: post.description,
    url,
    inLanguage: "es-MX",
    datePublished: post.date,
    dateModified: post.updatedAt,
    author: getAuthorReference(resolveAuthor(post.author)),
    publisher: PUBLISHER,
    step: steps.map((h, i) => ({
      "@type": "HowToStep",
      position: i + 1,
      name: h.text,
      url: `${url}#${h.id}`,
    })),
  }
}

/**
 * `speakable` para las páginas con respuesta directa: indica al asistente
 * qué fragmento leer en voz alta y citar. Devuelve solo la especificación;
 * se incrusta como `speakable` de la WebPage/BlogPosting, que es donde el
 * vocabulario la define (un SpeakableSpecification suelto no es válido).
 */
export function getSpeakableSpec(cssSelectors: string[]) {
  return {
    "@type": "SpeakableSpecification" as const,
    cssSelector: cssSelectors,
  }
}

/** Schema FAQPage (solo si el post tiene preguntas frecuentes). */
export function getFAQSchema(faq: { question: string; answer: string }[]) {
  if (!faq || faq.length === 0) return null
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  }
}


/** Schema BreadcrumbList para /blog, /blog/[slug] y /blog/categoria/[slug]. */
export function getBlogBreadcrumbSchema(
  crumb: "blog" | "post" | "category",
  crumbTitle?: string,
  crumbSlug?: string
) {
  const trail = [
    { "@type": "ListItem", position: 1, name: "Inicio", item: SITE },
    { "@type": "ListItem", position: 2, name: "Blog", item: `${SITE}/blog` },
  ]

  const items =
    crumb === "blog"
      ? trail
      : crumb === "category"
        ? [
            ...trail,
            {
              "@type": "ListItem",
              position: 3,
              name: crumbTitle ?? "Categoría",
              item: `${SITE}/blog/categoria/${crumbSlug ?? ""}`,
            },
          ]
        : [
            ...trail,
            { "@type": "ListItem", position: 3, name: crumbTitle ?? "Artículo" },
          ]

  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items,
  }
}
