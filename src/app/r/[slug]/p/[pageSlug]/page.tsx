// ============================================================
// /r/[slug]/p/[pageSlug] — páginas de contenido del sitio IA.
//
// Solo sirve páginas **publicadas** (`status = 'published'`): la RLS anónima
// filtra los borradores, así que un enlace filtrado a un borrador da 404 y no
// una página a medio aprobar.
//
// Sin cookies ni headers: prerenderizable y cacheable por slug.
// ============================================================

import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import {
  buildBreadcrumbSchema,
  buildFaqSchema,
  menuPath,
  restaurantPath,
  seoDescription,
  seoPagePath,
  siteOrigin,
  truncate,
} from "@/lib/foodos-seo"
import { getPublicSeoData } from "@/lib/foodos-seo-public"

export const revalidate = 300

interface PageProps {
  params: Promise<{ slug: string; pageSlug: string }>
}

export async function generateStaticParams() {
  try {
    const { getPublicMarketplace } = await import("@/lib/foodos-public")
    const { createPublicClient } = await import("@/lib/supabase/public")
    const { listPublishedSeoPages } = await import("@/lib/foodos-seo-pages")

    const marketplace = await getPublicMarketplace()
    const supabase = createPublicClient()
    if (!supabase) return []

    const pairs: { slug: string; pageSlug: string }[] = []
    for (const entry of marketplace.slice(0, 50)) {
      const pages = await listPublishedSeoPages(supabase, entry.restaurant.id, 20)
      for (const page of pages) {
        if (page.slug) pairs.push({ slug: entry.restaurant.slug, pageSlug: page.slug })
      }
    }
    return pairs
  } catch {
    return []
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug, pageSlug } = await params
  const data = await getPublicSeoData(slug)
  const page = data?.pages.find((entry) => entry.slug === pageSlug)
  if (!data || !page) return { title: "Página no encontrada", robots: { index: false } }

  const url = `${siteOrigin()}${seoPagePath(slug, page.slug)}`
  const description = page.summary?.trim()
    ? truncate(page.summary, 155)
    : seoDescription(data.profile)

  return {
    title: truncate(page.title, 60),
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "article",
      title: page.title,
      description,
      url,
      images: data.profile.logo_url ? [data.profile.logo_url] : undefined,
    },
    manifest: `/r/${slug}/manifest.webmanifest`,
  }
}

export default async function SeoContentPage({ params }: PageProps) {
  const { slug, pageSlug } = await params
  const data = await getPublicSeoData(slug)
  const page = data?.pages.find((entry) => entry.slug === pageSlug)
  if (!data || !page) notFound()

  const { profile } = data
  const origin = siteOrigin()
  const url = `${origin}${seoPagePath(slug, page.slug)}`
  const theme = profile.theme_color?.trim() || "#0E7A0E"

  const schemas: object[] = [
    buildFaqSchema(page.faq, url),
    buildBreadcrumbSchema([
      { name: "Inicio", url: origin },
      { name: "Hoy qué comemos", url: `${origin}/comer` },
      { name: profile.name, url: `${origin}${restaurantPath(slug)}` },
      { name: "Carta", url: `${origin}${menuPath(slug)}` },
      { name: page.title, url },
    ]),
  ].filter((schema): schema is object => schema !== null)

  const paragraphs = page.body
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)

  return (
    <div className="min-h-dvh bg-[#F7F5F0] text-[#242529]">
      {schemas.map((schema, index) => (
        <script
          key={index}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
        />
      ))}

      <header
        className="border-b border-black/5 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-5"
        style={{ backgroundColor: `${theme}0F` }}
      >
        <nav aria-label="Ruta" className="mx-auto max-w-3xl">
          <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-[#5B5F66]">
            <li>
              <Link href={menuPath(slug)} className="underline-offset-2 hover:underline">
                Carta de {profile.name}
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li aria-current="page" className="font-medium text-[#242529]">
              {page.title}
            </li>
          </ol>
        </nav>
        <div className="mx-auto mt-3 max-w-3xl">
          <h1 className="text-2xl font-bold leading-tight sm:text-3xl">{page.title}</h1>
          {page.summary ? (
            <p className="mt-2 text-sm text-[#5B5F66]">{page.summary}</p>
          ) : null}
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 pb-24">
        {paragraphs.length > 0 ? (
          <div className="mt-6 space-y-4 text-[15px] leading-relaxed text-[#3F4348]">
            {paragraphs.map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
          </div>
        ) : null}

        {page.faq.length > 0 ? (
          <section className="mt-8" id="faq">
            <h2 className="text-lg font-semibold">Preguntas frecuentes</h2>
            <div className="mt-2 space-y-2">
              {page.faq.map((entry, index) => (
                <details
                  key={index}
                  className="rounded-2xl bg-white px-4 py-3 [&_summary]:cursor-pointer"
                >
                  <summary className="text-sm font-medium marker:content-none">
                    {entry.q}
                  </summary>
                  <p className="mt-2 text-sm leading-relaxed text-[#5B5F66]">{entry.a}</p>
                </details>
              ))}
            </div>
          </section>
        ) : null}

        <div className="mt-8 flex flex-wrap gap-2">
          <Link
            href={restaurantPath(slug)}
            className="touch-target inline-flex min-h-11 items-center justify-center rounded-xl px-5 text-sm font-semibold text-white"
            style={{ backgroundColor: theme }}
          >
            Pedir en línea
          </Link>
          <Link
            href={menuPath(slug)}
            className="touch-target inline-flex min-h-11 items-center justify-center rounded-xl bg-white px-5 text-sm font-semibold"
          >
            Ver la carta completa
          </Link>
        </div>

        {data.pages.filter((entry) => entry.slug !== page.slug).length > 0 ? (
          <section className="mt-8">
            <h2 className="text-lg font-semibold">Más sobre {profile.name}</h2>
            <ul className="mt-2 flex flex-wrap gap-2">
              {data.pages
                .filter((entry) => entry.slug !== page.slug)
                .map((entry) => (
                  <li key={entry.id}>
                    <Link
                      href={seoPagePath(slug, entry.slug)}
                      className="touch-target inline-flex min-h-11 items-center rounded-xl bg-white px-4 text-sm font-medium"
                    >
                      {entry.title}
                    </Link>
                  </li>
                ))}
            </ul>
          </section>
        ) : null}
      </main>

      <footer className="border-t border-black/5 px-4 py-6 text-center text-xs text-[#5B5F66]">
        <p>
          Contenido publicado por {profile.name} en{" "}
          <Link href="/comer" className="font-medium underline-offset-2 hover:underline">
            Resurte.me
          </Link>
          .
        </p>
      </footer>
    </div>
  )
}
