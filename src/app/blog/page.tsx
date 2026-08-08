import type { Metadata } from "next"
import { getAllPosts, searchPosts, getBlogIndexCta } from "@/lib/blog"
import { getBlogIndexSchema, getBlogBreadcrumbSchema } from "@/lib/blog-schema"
import { BlogHero } from "@/components/blog/blog-hero"
import { PostCTA } from "@/components/blog/post-cta"
import { BlogIndexClient } from "./blog-index-client"

export const metadata: Metadata = {
  title: "Blog de Resurte.me — Recursos para Restaurantes",
  description:
    "Aprende a costear tu menú, reducir mermas, comprar por mayoreo y hacer crecer tu restaurante. Guías prácticas para dueños de restaurantes en México.",
  alternates: { canonical: "https://resurte.me/blog" },
  openGraph: {
    title: "Blog de Resurte.me — Recursos para Restaurantes",
    description:
      "Aprende a costear tu menú, reducir mermas, comprar por mayoreo y hacer crecer tu restaurante. Guías prácticas para dueños de restaurantes en México.",
    url: "https://resurte.me/blog",
    type: "website",
    locale: "es_MX",
    siteName: "Resurte.me",
  },
  twitter: {
    card: "summary_large_image",
    title: "Blog de Resurte.me — Recursos para Restaurantes",
    description:
      "Aprende a costear tu menú, reducir mermas, comprar por mayoreo y hacer crecer tu restaurante.",
  },
}

export default async function BlogIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; categoria?: string; tipo?: string }>
}) {
  const { q, categoria, tipo } = await searchParams
  // Pre-filtro server-side: con ?q= el HTML inicial ya llega filtrado (mejor SEO).
  const posts = q ? searchPosts(q) : getAllPosts()
  const jsonLd = [
    getBlogIndexSchema(posts),
    getBlogBreadcrumbSchema("blog"),
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "Resurte.me",
      url: "https://resurte.me",
      potentialAction: {
        "@type": "SearchAction",
        target: "https://resurte.me/blog?q={search_term_string}",
        "query-input": "required name=search_term_string",
      },
    },
  ]

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <BlogHero
        title="Recursos para tu restaurante"
        subtitle="Guías prácticas, herramientas y datos para que tu restaurante gane más: food cost, mermas, proveeduría, marketing y tecnología. Escrito para dueños como tú, no para corporativos."
      />
      <BlogIndexClient
        posts={posts}
        initialQuery={q ?? ""}
        initialCategory={categoria ?? "all"}
        initialContentType={tipo ?? "all"}
      />
      <div className="pb-16">
        <PostCTA
          config={getBlogIndexCta()}
          heading="¿Listo para impulsar tu restaurante?"
          secondaryHref="/panel"
          secondaryLabel="Explorar el Panel de Herramientas"
        />
      </div>
    </>
  )
}
