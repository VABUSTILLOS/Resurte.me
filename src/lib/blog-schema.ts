import type { BlogPostMeta } from "./blog"
import { getPostUrl } from "./blog"
import { getCategory } from "./blog-categories"

// ============================================================
// JSON-LD para el blog de Resurte.me
// ============================================================

const SITE = "https://resurte.me"

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
    publisher: {
      "@type": "Organization",
      name: "Resurte.me",
      url: SITE,
      logo: { "@type": "ImageObject", url: `${SITE}/apple-icon.webp` },
    },
    blogPost: posts.map((p) => ({
      "@type": "BlogPosting",
      headline: p.title,
      description: p.description,
      url: getPostUrl(p.slug),
      datePublished: p.date,
      dateModified: p.updatedAt,
      author: { "@type": "Person", name: p.author },
      image: p.coverImage ? `${SITE}${p.coverImage}` : undefined,
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
    author: { "@type": "Person", name: post.author },
    publisher: {
      "@type": "Organization",
      name: "Resurte.me",
      url: SITE,
      logo: { "@type": "ImageObject", url: `${SITE}/apple-icon.webp` },
    },
    image: post.coverImage ? `${SITE}${post.coverImage}` : undefined,
    keywords: post.tags.join(", "),
    articleSection: getCategory(post.category).label,
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

/** Schema BreadcrumbList para /blog y /blog/[slug]. */
export function getBlogBreadcrumbSchema(crumb: "blog" | "post", postTitle?: string) {
  const items =
    crumb === "blog"
      ? [
          { "@type": "ListItem", position: 1, name: "Inicio", item: SITE },
          { "@type": "ListItem", position: 2, name: "Blog", item: `${SITE}/blog` },
        ]
      : [
          { "@type": "ListItem", position: 1, name: "Inicio", item: SITE },
          { "@type": "ListItem", position: 2, name: "Blog", item: `${SITE}/blog` },
          { "@type": "ListItem", position: 3, name: postTitle ?? "Artículo" },
        ]

  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items,
  }
}
