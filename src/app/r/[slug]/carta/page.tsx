// ============================================================
// /r/[slug]/carta — página indexable del menú (Fase 6).
//
// Por qué existe si ya hay `/r/[slug]`: el micrositio es una app (estado,
// carrito, checkout) y Google indexa mal una app. Esta página es HTML plano
// con el menú completo, los precios, los horarios y las preguntas frecuentes,
// más los datos estructurados `Restaurant`, `Menu`, `FAQPage` y
// `BreadcrumbList` que alimentan los resultados enriquecidos.
//
// Sin cookies ni headers: se prerenderiza por restaurante y se regenera cada
// 5 minutos, igual que el micrositio.
// ============================================================

import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { generateFaq } from "@/lib/foodos-ai/seo"
import { formatMoney } from "@/lib/foodos"
import {
  buildBreadcrumbSchema,
  buildFaqSchema,
  buildMenuSchema,
  buildRestaurantSchema,
  menuPath,
  restaurantPath,
  seoDescription,
  seoPagePath,
  seoTitle,
  siteOrigin,
  type SeoFaqItem,
} from "@/lib/foodos-seo"
import { getPublicSeoData } from "@/lib/foodos-seo-public"

export const revalidate = 300

interface PageProps {
  params: Promise<{ slug: string }>
}

export async function generateStaticParams() {
  try {
    const { getPublicMarketplace } = await import("@/lib/foodos-public")
    const marketplace = await getPublicMarketplace()
    return marketplace
      .map((entry) => ({ slug: entry.restaurant.slug }))
      .filter((entry) => Boolean(entry.slug))
  } catch {
    return []
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const data = await getPublicSeoData(slug)
  if (!data) return { title: "Restaurante no encontrado", robots: { index: false } }

  const origin = siteOrigin()
  const url = `${origin}${menuPath(slug)}`
  const city = data.branches.find((b) => b.city)?.city ?? null

  return {
    title: seoTitle(data.profile, city),
    description: seoDescription(data.profile),
    keywords: data.profile.seo_keywords?.length ? data.profile.seo_keywords : undefined,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      title: seoTitle(data.profile, city),
      description: seoDescription(data.profile),
      url,
      images: data.profile.logo_url ? [data.profile.logo_url] : undefined,
    },
    // El manifest es por restaurante: instalarlo crea una app que abre directo
    // en su menú, no en el marketplace.
    manifest: `/r/${slug}/manifest.webmanifest`,
  }
}

export default async function CartaPage({ params }: PageProps) {
  const { slug } = await params
  const data = await getPublicSeoData(slug)
  if (!data) notFound()

  const { profile, branches, hours, categories, items, rating, pages } = data
  const origin = siteOrigin()
  const url = `${origin}${menuPath(slug)}`
  const city = branches.find((b) => b.city)?.city ?? null
  const theme = profile.theme_color?.trim() || "#0E7A0E"

  // La FAQ se toma de la página publicada si existe; si no, se arma con los
  // datos reales (envío, recolección, pago). Nunca hay una página sin FAQ.
  const faqPage = pages.find((page) => page.kind === "faq")
  const faq: SeoFaqItem[] = faqPage?.faq.length
    ? faqPage.faq
    : generateFaq({ restaurantName: profile.name, branches, city }).items

  const aboutPage = pages.find((page) => page.kind === "about")
  const about = aboutPage?.body.trim() || profile.about?.trim() || profile.description?.trim() || ""

  const grouped = categories
    .map((category) => ({
      category,
      items: items.filter((item) => item.category_id === category.id),
    }))
    .filter((group) => group.items.length > 0)
  const uncategorized = items.filter(
    (item) => !item.category_id || !categories.some((c) => c.id === item.category_id)
  )

  const schemas: object[] = [
    buildRestaurantSchema({
      profile,
      branches,
      hours,
      rating,
      url,
    }),
    buildMenuSchema({ profile, items, url }),
    buildFaqSchema(faq, url),
    buildBreadcrumbSchema([
      { name: "Inicio", url: origin },
      { name: "Hoy qué comemos", url: `${origin}/comer` },
      { name: profile.name, url: `${origin}${restaurantPath(slug)}` },
      { name: "Carta", url },
    ]),
  ].filter((schema): schema is object => schema !== null)

  const orderHref = restaurantPath(slug)
  const otherPages = pages.filter((page) => page.kind !== "menu" && page.slug !== faqPage?.slug)

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
        className="border-b border-black/5 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-4"
        style={{ backgroundColor: `${theme}0F` }}
      >
        <nav aria-label="Ruta" className="mx-auto max-w-3xl">
          <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-[#5B5F66]">
            <li>
              <Link href="/comer" className="underline-offset-2 hover:underline">
                Hoy qué comemos
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li>
              <Link href={orderHref} className="underline-offset-2 hover:underline">
                {profile.name}
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li aria-current="page" className="font-medium text-[#242529]">
              Carta
            </li>
          </ol>
        </nav>

        <div className="mx-auto mt-4 flex max-w-3xl items-start gap-3">
          {profile.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.logo_url}
              alt=""
              width={56}
              height={56}
              className="size-14 shrink-0 rounded-xl object-cover"
            />
          ) : null}
          <div className="min-w-0">
            <h1 className="text-2xl font-bold leading-tight sm:text-3xl">
              {profile.name}
            </h1>
            {profile.tagline ? (
              <p className="mt-1 text-sm text-[#5B5F66]">{profile.tagline}</p>
            ) : null}
            <p className="mt-1 text-xs text-[#5B5F66]">
              {[city, `${items.length} platillos`].filter(Boolean).join(" · ")}
              {rating && rating.count > 0
                ? ` · ${rating.value.toFixed(1)} ★ (${rating.count})`
                : ""}
            </p>
          </div>
        </div>

        <div className="mx-auto mt-4 max-w-3xl">
          <Link
            href={orderHref}
            className="touch-target inline-flex min-h-11 items-center justify-center rounded-xl px-5 text-sm font-semibold text-white"
            style={{ backgroundColor: theme }}
          >
            Pedir en línea
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 pb-24">
        {about ? (
          <section className="mt-6">
            <h2 className="text-lg font-semibold">Sobre {profile.name}</h2>
            <div className="mt-2 space-y-3 text-sm leading-relaxed text-[#3F4348]">
              {about.split(/\n{2,}/).map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
            </div>
          </section>
        ) : null}

        <section className="mt-8" id="menu">
          <h2 className="text-lg font-semibold">Carta y precios</h2>

          {grouped.length === 0 && uncategorized.length === 0 ? (
            <p className="mt-2 text-sm text-[#5B5F66]">
              Este restaurante todavía no publicó su menú.
            </p>
          ) : null}

          {grouped.map((group) => (
            <div key={group.category.id} className="mt-6">
              <h3 className="text-base font-semibold text-[#242529]">
                {group.category.name}
              </h3>
              <ul className="mt-2 divide-y divide-black/5 rounded-2xl bg-white">
                {group.items.map((item) => (
                  <li key={item.id} className="flex gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{item.name}</p>
                      {item.description ? (
                        <p className="mt-0.5 text-xs leading-relaxed text-[#5B5F66]">
                          {item.description}
                        </p>
                      ) : null}
                    </div>
                    <p className="shrink-0 text-sm font-semibold tabular-nums">
                      {formatMoney(item.price)}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {uncategorized.length > 0 ? (
            <div className="mt-6">
              <h3 className="text-base font-semibold text-[#242529]">Más platillos</h3>
              <ul className="mt-2 divide-y divide-black/5 rounded-2xl bg-white">
                {uncategorized.map((item) => (
                  <li key={item.id} className="flex gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{item.name}</p>
                      {item.description ? (
                        <p className="mt-0.5 text-xs leading-relaxed text-[#5B5F66]">
                          {item.description}
                        </p>
                      ) : null}
                    </div>
                    <p className="shrink-0 text-sm font-semibold tabular-nums">
                      {formatMoney(item.price)}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>

        {faq.length > 0 ? (
          <section className="mt-8" id="faq">
            <h2 className="text-lg font-semibold">Preguntas frecuentes</h2>
            <div className="mt-2 space-y-2">
              {faq.map((entry, index) => (
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

        <section className="mt-8">
          <h2 className="text-lg font-semibold">Dónde y cuándo</h2>
          <ul className="mt-2 space-y-2">
            {branches.map((branch, index) => (
              <li key={index} className="rounded-2xl bg-white px-4 py-3">
                <p className="text-sm font-medium">{branch.name}</p>
                <p className="mt-0.5 text-xs text-[#5B5F66]">
                  {[branch.address, branch.city].filter(Boolean).join(", ") || "Sin dirección"}
                </p>
                {branch.phone ? (
                  <a
                    href={`tel:${branch.phone}`}
                    className="mt-1 inline-block text-xs font-medium underline-offset-2 hover:underline"
                    style={{ color: theme }}
                  >
                    {branch.phone}
                  </a>
                ) : null}
                <p className="mt-1 text-xs text-[#5B5F66]">
                  {[
                    branch.delivery_active ? "Envío a domicilio" : null,
                    branch.pickup_active ? "Para llevar" : null,
                    branch.dine_in_active ? "En el local" : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </li>
            ))}
          </ul>
        </section>

        {otherPages.length > 0 ? (
          <section className="mt-8">
            <h2 className="text-lg font-semibold">Más sobre {profile.name}</h2>
            <ul className="mt-2 flex flex-wrap gap-2">
              {otherPages.map((page) => (
                <li key={page.id}>
                  <Link
                    href={seoPagePath(slug, page.slug)}
                    className="touch-target inline-flex min-h-11 items-center rounded-xl bg-white px-4 text-sm font-medium"
                  >
                    {page.title}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </main>

      <footer className="border-t border-black/5 px-4 py-6 text-center text-xs text-[#5B5F66]">
        <p>
          Carta de {profile.name} publicada en{" "}
          <Link href="/comer" className="font-medium underline-offset-2 hover:underline">
            Resurte.me
          </Link>
          . Pedidos directos, sin comisiones de intermediarios.
        </p>
      </footer>
    </div>
  )
}
