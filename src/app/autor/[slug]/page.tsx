import Link from "next/link"
import { notFound } from "next/navigation"
import type { Metadata } from "next"
import { ChevronRight, BadgeCheck, FileText } from "lucide-react"
import { AUTHORS, getAuthorBySlug, getPersonSchema, SITE_URL } from "@/lib/author"
import { getAllPosts } from "@/lib/blog"
import { BlogCard } from "@/components/blog/blog-card"

// ============================================================
// PÁGINA DE AUTOR — la entidad `Person` citable
// ============================================================
// Los motores de respuesta no citan sitios anónimos: citan autores con
// nombre, cargo y credenciales verificables. Esta página es el destino de
// la firma de cada post y el `@id` al que apunta el `author` del JSON-LD,
// así que todo lo que hay aquí tiene que ser comprobable.

export const dynamicParams = false

export function generateStaticParams() {
  return AUTHORS.map((a) => ({ slug: a.slug }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const author = getAuthorBySlug(slug)
  if (!author)
    return { title: "Autor no encontrado", robots: { index: false, follow: false } }

  const url = author.url
  return {
    title: `${author.name} — ${author.jobTitle}`,
    description: author.bio[0],
    alternates: { canonical: url },
    openGraph: {
      title: `${author.name} — ${author.jobTitle}`,
      description: author.bio[0],
      url,
      type: "profile",
      locale: "es_MX",
      siteName: "Resurte.me",
    },
    twitter: {
      card: "summary",
      title: `${author.name} — ${author.jobTitle}`,
      description: author.bio[0],
    },
  }
}

export default async function AuthorPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const author = getAuthorBySlug(slug)
  if (!author) notFound()

  const posts = getAllPosts().filter((p) => p.authorSlug === author.slug)

  const jsonLd = [
    getPersonSchema(author),
    {
      "@context": "https://schema.org",
      "@type": "ProfilePage",
      "@id": `${author.url}#profilepage`,
      url: author.url,
      name: `${author.name} — ${author.jobTitle}`,
      inLanguage: "es-MX",
      mainEntity: { "@id": author.id },
      // `hasPart` convierte el índice de artículos en algo navegable por un
      // agente (puede enumerar y seguir cada URL), no solo visible al humano.
      hasPart: posts.slice(0, 30).map((p) => ({
        "@type": "BlogPosting",
        headline: p.title,
        url: `${SITE_URL}/blog/${p.slug}`,
        datePublished: p.date,
        dateModified: p.updatedAt,
        author: { "@id": author.id },
      })),
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Inicio", item: SITE_URL },
        { "@type": "ListItem", position: 2, name: "Blog", item: `${SITE_URL}/blog` },
        { "@type": "ListItem", position: 3, name: author.name, item: author.url },
      ],
    },
  ]

  return (
    <div className="bg-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <nav
        aria-label="Ruta de navegación"
        className="mx-auto max-w-3xl px-4 pt-8 sm:px-6"
      >
        <ol className="flex flex-wrap items-center gap-1.5 text-xs text-[var(--text-secondary)]">
          <li>
            <Link href="/" className="hover:text-brand-600">
              Inicio
            </Link>
          </li>
          <li aria-hidden="true">
            <ChevronRight className="h-3.5 w-3.5" />
          </li>
          <li>
            <Link href="/blog" className="hover:text-brand-600">
              Blog
            </Link>
          </li>
          <li aria-hidden="true">
            <ChevronRight className="h-3.5 w-3.5" />
          </li>
          <li className="text-warm-700">{author.name}</li>
        </ol>
      </nav>

      <header className="mx-auto max-w-3xl px-4 pt-8 sm:px-6">
        <div className="flex items-center gap-4">
          <span
            aria-hidden="true"
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xl font-bold text-brand-600"
          >
            {author.name
              .split(" ")
              .map((w) => w[0])
              .slice(0, 2)
              .join("")}
          </span>
          <div>
            <h1 className="text-3xl font-extrabold leading-tight tracking-tight text-warm-900 sm:text-4xl">
              {author.name}
            </h1>
            <p className="mt-1 text-sm font-semibold text-brand-600">
              {author.jobTitle}
            </p>
          </div>
        </div>

        <div className="mt-6 space-y-4 text-base leading-relaxed text-warm-700">
          {author.bio.map((paragraph, i) => (
            <p key={i}>{paragraph}</p>
          ))}
        </div>
      </header>

      <section className="mx-auto max-w-3xl px-4 pt-8 sm:px-6">
        <h2 className="text-lg font-bold text-warm-900">
          Credenciales y experiencia
        </h2>
        <ul className="mt-4 space-y-2.5">
          {author.credentials.map((credential, i) => (
            <li key={i} className="flex gap-2.5 text-sm leading-relaxed text-warm-700">
              <BadgeCheck
                className="mt-0.5 h-4 w-4 shrink-0 text-brand-600"
                aria-hidden="true"
              />
              <span>{credential}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mx-auto max-w-3xl px-4 pt-8 sm:px-6">
        <h2 className="text-lg font-bold text-warm-900">Temas que cubre</h2>
        <ul className="mt-4 flex flex-wrap gap-2">
          {author.knowsAbout.map((topic) => (
            <li
              key={topic}
              className="rounded-full bg-warm-100 px-3 py-1 text-xs font-medium text-warm-700"
            >
              {topic}
            </li>
          ))}
        </ul>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
        <h2 className="flex items-center gap-2 text-lg font-bold text-warm-900">
          <FileText className="h-5 w-5 text-brand-600" aria-hidden="true" />
          Artículos de {author.name}
          <span className="text-sm font-normal text-[var(--text-secondary)]">
            ({posts.length})
          </span>
        </h2>
        <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {posts.map((post) => (
            <BlogCard key={post.slug} post={post} />
          ))}
        </div>
      </section>
    </div>
  )
}
