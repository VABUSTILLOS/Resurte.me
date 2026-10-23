import { notFound } from "next/navigation"
import { Metadata } from "next"
import { MEXICO_CITIES, isCityActive } from "@/lib/cities"
import { CityPageClient } from "@/components/city/city-page-client"
import { ComingSoonCity } from "@/components/city/coming-soon-city"
import { logger } from "@/lib/logger"
import {
  filterByCityAvailability,
  getCachedCategories,
  getCachedVisibleProducts,
  getCityAvailabilityForSlug,
} from "@/lib/catalog-cache"
import { getCityBySlug } from "@/lib/data"
import { buildCatalogPreview } from "@/lib/catalog-preview"
import type { Category, Product, City } from "@/types"

// ISR: catálogo revalidado cada 5 min (alineado con src/lib/catalog-cache.ts).
export const revalidate = 300

// Next 16: sin generateStaticParams el segmento dinámico cae a SSR por request.
// Pre-render de las 20 ciudades conocidas.
export function generateStaticParams() {
  return MEXICO_CITIES.map((c) => ({ slug: c.slug }))
}

interface Props {
  params: Promise<{ slug: string }>
}

/**
 * Resuelve la ciudad con datos de la tabla `cities` de Supabase cuando está
 * disponible, degradando al catálogo estático cuando no hay Supabase.
 */
async function resolveCity(slug: string): Promise<City | undefined> {
  const staticCity = MEXICO_CITIES.find((c) => c.slug === slug)
  try {
    const dbCity = await getCityBySlug(slug)
    if (dbCity) return dbCity
  } catch {
    // Sin Supabase — usar catálogo estático
  }
  return staticCity
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const city = await resolveCity(slug)
  if (!city) return { title: "Catálogo — Resurte.me" }

  const active = isCityActive(city.slug)
  const title = active
    ? `Catálogo completo en ${city.name} — Resurte.me`
    : `Próximamente en ${city.name} — Resurte.me`
  const description = active
    ? `Catálogo completo de productos por mayoreo en ${city.name}, ${city.state}. Frutas, verduras, carnes, abarrotes y más, con búsqueda y categorías.`
    : `Muy pronto en ${city.name}, ${city.state}. Por ahora Resurte.me opera solo en Chihuahua, Chihuahua.`

  return {
    title,
    description,
    ...(active ? {} : { robots: { index: false, follow: true } }),
    alternates: {
      canonical: `https://resurte.me/catalogo/${city.slug}`,
    },
    openGraph: {
      title,
      description,
      url: `https://resurte.me/catalogo/${city.slug}`,
      siteName: "Resurte.me",
      locale: "es_MX",
      type: "website",
    },
  }
}

export default async function CatalogPage({ params }: Props) {
  const { slug } = await params
  const city = await resolveCity(slug)
  if (!city) notFound()

  if (!isCityActive(city.slug)) return <ComingSoonCity city={city} />

  // Sin Supabase configurado (dev local/preview) el catálogo renderiza vacío
  // en lugar de fallar, igual que la landing.
  let categories: Category[] = []
  let products: Product[] = []

  try {
    const [cats, prods, availableIds] = await Promise.all([
      getCachedCategories(),
      getCachedVisibleProducts(),
      // Selector por ciudad (migración 00065): null = sin filtro.
      getCityAvailabilityForSlug(slug),
    ])
    categories = cats
    products = filterByCityAvailability(prods, availableIds)
  } catch (error) {
    if (error instanceof Error && error.message.includes("Supabase no está configurado")) {
      logger.warn(`CatalogPage(${slug}) renderizó sin Supabase (env no configurado).`)
    } else {
      throw error
    }
  }

  // Solo se serializa un preview por categoría; el catálogo completo se
  // carga en el cliente cuando el usuario busca o filtra (ver CityPageClient).
  return (
    <CityPageClient
      slug={slug}
      categories={categories}
      preview={buildCatalogPreview(products)}
      totalCount={products.length}
    />
  )
}
