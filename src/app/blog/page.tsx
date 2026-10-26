import type { Metadata } from "next"
import { Suspense } from "react"
import { getAllPosts, getBlogIndexCta, toBlogIndexCard } from "@/lib/blog"
import { getBlogIndexSchema, getBlogBreadcrumbSchema } from "@/lib/blog-schema"
import { BlogHero } from "@/components/blog/blog-hero"
import { PostCTA } from "@/components/blog/post-cta"
import { BlogIndexClient } from "./blog-index-client"

export const metadata: Metadata = {
  title: "Blog de Resurte.me — Recursos para Restaurantes",
  description:
    "Aprende a costear tu menú, reducir mermas, comprar por mayoreo y hacer crecer tu restaurante. Guías prácticas para dueños de restaurantes en México.",
  alternates: {
    canonical: "https://resurte.me/blog",
    // Descubrimiento del feed RSS/Atom para lectores y crawlers.
    types: { "application/rss+xml": "https://resurte.me/rss.xml" },
  },
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
    // El `WebSite` con su `SearchAction` ya lo emite el layout raíz con
    // `@id: /#website`. Repetirlo aquí creaba un segundo nodo `WebSite` sin
    // `@id` —dos entidades distintas para el mismo sitio— y el buscador tenía
    // que adivinar cuál era la buena. El blog solo declara su relación con el
    // sitio, no un sitio nuevo.
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      "@id": "https://resurte.me/blog#collectionpage",
      url: "https://resurte.me/blog",
      name: "Blog de Resurte.me — Recursos para Restaurantes",
      inLanguage: "es-MX",
      isPartOf: { "@id": "https://resurte.me/#website" },
      about: { "@id": "https://resurte.me/#organization" },
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
        <BlogIndexClient posts={posts.map(toBlogIndexCard)} />
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
