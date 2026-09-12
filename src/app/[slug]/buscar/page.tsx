import { notFound } from "next/navigation"
import { MEXICO_CITIES } from "@/lib/cities"
import { Metadata } from "next"
import { SearchPageClient } from "@/components/search/search-page-client"
import { Suspense } from "react"
import {
  filterByCityAvailability,
  getCachedCategories,
  getCachedProductsPaginated,
  getCityAvailabilityForSlug,
} from "@/lib/catalog-cache"

// ISR: catálogo revalidado cada 5 min (alineado con src/lib/catalog-cache.ts).
export const revalidate = 300

// Next 16: un segmento dinámico sin generateStaticParams cae a render dinámico
// por request. Pre-render de las 20 ciudades (los slugs inválidos dan 404).
export function generateStaticParams() {
  return MEXICO_CITIES.map((c) => ({ slug: c.slug }))
}

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const city = MEXICO_CITIES.find((c) => c.slug === slug)
  if (!city)
    return {
      title: "Búsqueda — Resurte.me",
      robots: { index: false, follow: false },
    }

  const title = `Buscar productos en ${city.name} — Resurte.me`
  const description = `Busca productos por mayoreo en ${city.name}, ${city.state}. Encuentra frutas, verduras, carnes, abarrotes y más.`

  return {
    title,
    description,
    // Resultados de búsqueda interna: noindex (directriz de Google para
    // search pages) pero follow para que el crawler llegue a los productos.
    robots: { index: false, follow: true },
    alternates: {
      canonical: `https://resurte.me/${city.slug}/buscar`,
    },
    openGraph: {
      title,
      description,
      url: `https://resurte.me/${city.slug}/buscar`,
      siteName: "Resurte.me",
      locale: "es_MX",
      type: "website",
    },
  }
}

const INITIAL_PAGE_SIZE = 24

export default async function SearchPage({ params }: Props) {
  const { slug } = await params
  const city = MEXICO_CITIES.find((c) => c.slug === slug)
  if (!city) notFound()

  const categoriesPromise = getCachedCategories()

  const productsPromise = getCachedProductsPaginated(0, INITIAL_PAGE_SIZE)

  // Selector por ciudad (migración 00065): null = sin filtro.
  const availabilityPromise = getCityAvailabilityForSlug(slug)

  const [categories, { products: pageProducts, total }, availableIds] = await Promise.all([
    categoriesPromise,
    productsPromise,
    availabilityPromise,
  ])

  const products = filterByCityAvailability(pageProducts, availableIds)
  // Con filtro activo, el total real es el universo disponible en la ciudad.
  const totalInCity = availableIds ? availableIds.length : total

  return (
    <Suspense fallback={<div className="p-8 text-center text-[var(--text-secondary)]">Cargando...</div>}>
      <SearchPageClient
        citySlug={slug}
        cityName={city.name}
        products={products}
        categories={categories}
        totalProducts={totalInCity}
        pageSize={INITIAL_PAGE_SIZE}
      />
    </Suspense>
  )
}
