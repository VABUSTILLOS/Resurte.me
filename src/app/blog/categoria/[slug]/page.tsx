import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowRight } from "lucide-react"
import { getAllPosts, getBlogIndexCta } from "@/lib/blog"
import { BLOG_CATEGORIES, getCategory } from "@/lib/blog-categories"
import {
  getBlogBreadcrumbSchema,
  getSpeakableSpec,
} from "@/lib/blog-schema"
import { getItemListSchema } from "@/lib/structured-data"
import { SITE_URL } from "@/lib/author"
import { BlogCard } from "@/components/blog/blog-card"
import { BlogHero } from "@/components/blog/blog-hero"
import { PostCTA } from "@/components/blog/post-cta"

// Temas de contenido estático: /blog/categoria/[slug] se prerenderiza por
// completo. Sin cookies()/headers(), sin searchParams leídos en el servidor.
export const dynamicParams = false

// Categorías cuyo contenido se apoya en el índice de precios publicado.
const PRICE_INDEX_CATEGORIES = new Set(["costos", "proveeduria"])

export function generateStaticParams() {
  return BLOG_CATEGORIES.map((c) => ({ slug: c.slug }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const category = BLOG_CATEGORIES.find((c) => c.slug === slug)
  if (!category) return {}

  const url = `${SITE_URL}/blog/categoria/${category.slug}`
  const title = `${category.label} para restaurantes — Blog de Resurte.me`

  return {
    title,
    description: category.description,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      url,
      title,
      description: category.description,
      siteName: "Resurte.me",
      locale: "es_MX",
    },
  }
}

export default async function BlogCategoryPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  if (!BLOG_CATEGORIES.some((c) => c.slug === slug)) notFound()

  const category = getCategory(slug)
  const posts = getAllPosts().filter((p) => p.category === category.slug)
  const url = `${SITE_URL}/blog/categoria/${category.slug}`

  const jsonLd = [
    getBlogBreadcrumbSchema("category", category.label, category.slug),
    getItemListSchema(
      `${category.label} — guías para restaurantes`,
      url,
      posts.map((p) => ({
        name: p.title,
        url: `${SITE_URL}/blog/${p.slug}`,
        description: p.description,
      })),
      "Article"
    ),
    {
      "@type": "CollectionPage",
      "@id": `${url}#page`,
      url,
      name: `${category.label} — Blog de Resurte.me`,
      description: category.description,
      inLanguage: "es-MX",
      isPartOf: { "@id": `${SITE_URL}/#website` },
      speakable: getSpeakableSpec(["#resumen-categoria", "h1"]),
    },
  ]

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <BlogHero
        title={`${category.emoji} ${category.label}`}
        subtitle={category.description}
      />

      <section className="mx-auto max-w-3xl px-4 pb-10 sm:px-6">
        <div
          id="resumen-categoria"
          className="rounded-2xl border border-gray-200 bg-gray-50 p-6"
        >
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-brand-600">
            Respuesta rápida
          </h2>
          <p className="leading-relaxed text-gray-700">
            {category.label} para restaurantes: {category.description} Resurte.me
            publica {posts.length}{" "}
            {posts.length === 1 ? "guía" : "guías"} sobre este tema, escritas para
            dueños de restaurantes en México y basadas en el trabajo diario con
            negocios de comida del país.
          </p>
        </div>
      </section>

      <nav aria-label="Otras categorías" className="mx-auto max-w-4xl px-4 pb-12 sm:px-6">
        <ul className="flex flex-wrap justify-center gap-2">
          {BLOG_CATEGORIES.filter((c) => c.slug !== category.slug).map((c) => (
            <li key={c.slug}>
              <Link
                href={`/blog/categoria/${c.slug}`}
                className="inline-flex items-center gap-2 rounded-full border border-gray-200 px-4 py-2 text-sm text-gray-700 transition-colors hover:border-brand-600 hover:text-brand-600"
              >
                <span aria-hidden="true">{c.emoji}</span>
                {c.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        {posts.length === 0 ? (
          <p className="text-center text-gray-600">
            Todavía no hay guías publicadas en esta categoría.
          </p>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {posts.map((post, i) => (
              <BlogCard key={post.slug} post={post} priority={i < 3} />
            ))}
          </div>
        )}
        <div className="mt-10 text-center">
          <Link
            href="/blog"
            className="inline-flex items-center gap-2 font-semibold text-brand-600 hover:text-brand-700"
          >
            Ver todas las guías del blog
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {PRICE_INDEX_CATEGORIES.has(category.slug) && (
        <section className="mx-auto max-w-4xl px-4 pb-16 sm:px-6">
          <Link
            href="/precios"
            className="block rounded-[16px] border border-gray-200 p-6 transition-colors hover:border-brand-600"
          >
            <h2 className="mb-1 flex items-center gap-2 font-semibold text-gray-900">
              Índice de precios de insumos
              <span className="text-brand-600">&rarr;</span>
            </h2>
            <p className="text-sm leading-relaxed text-gray-600">
              Precio de referencia por insumo, unidad y ciudad en México, actualizado cada
              semana desde el catálogo de Resurte.me. Úsalo para costear antes de fijar el
              precio de tu menú.
            </p>
          </Link>
        </section>
      )}

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
