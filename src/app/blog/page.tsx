import type { Metadata } from "next"
import { Suspense } from "react"
import { getAllPosts, getBlogIndexCta } from "@/lib/blog"
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

// Página estática: los filtros ?q=/?categoria=/?tipo= se aplican en el cliente
// (BlogIndexClient lee useSearchParams tras montar). Leer searchParams o
// headers() aquí convertía el índice del blog en SSR por request.
export default async function BlogIndexPage() {
  const posts = getAllPosts()
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
      <Suspense fallback={null}>
        <BlogIndexClient posts={posts} />
      </Suspense>
      <div className="pb-16">
        <PostCTA
          config={getBlogIndexCta()}
          heading="¿Listo para impulsar tu restaurante?"
          secondaryHref="/panel"
          secondaryLabel="Explorar Mi Restaurante"
        />
      </div>
    </>
  )
}
