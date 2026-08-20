import { notFound } from "next/navigation"
import { MEXICO_CITIES } from "@/lib/cities"
import {
  getCachedCategories,
  getCachedCategoryBySlug,
  getCachedProductsByCategory,
} from "@/lib/catalog-cache"
import { Metadata } from "next"
import { CategoryPageClient } from "./category-page-client"

// ISR: catálogo revalidado cada 5 min (alineado con src/lib/catalog-cache.ts).
export const revalidate = 300

// Next 16: sin generateStaticParams el segmento dinámico cae a SSR por request.
// Pre-render de las categorías de la ciudad por defecto; el resto de ciudades
// se genera bajo demanda y queda cacheado (dynamicParams=true por defecto).
export async function generateStaticParams() {
  const categories = await getCachedCategories()
  return categories.map((c) => ({
    slug: "chihuahua",
    categorySlug: c.slug,
  }))
}

interface Props {
  params: Promise<{ slug: string; categorySlug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, categorySlug } = await params
  const city = MEXICO_CITIES.find((c) => c.slug === slug)

  const category = await getCachedCategoryBySlug(categorySlug)

  if (!city || !category) {
    return { title: "Categoría no encontrada — Resurte.me" }
  }

  const title = `${category.name} en ${city.name} — Resurte.me`
  const description = `Compra ${category.name.toLowerCase()} por mayoreo en ${city.name}, ${city.state}. Precios de central de abastos, entrega el mismo día.`

  return {
    title,
    description,
    alternates: { canonical: `https://resurte.me/${city.slug}/categoria/${categorySlug}` },
    openGraph: { title, description, url: `https://resurte.me/${city.slug}/categoria/${categorySlug}`, siteName: "Resurte.me", locale: "es_MX", type: "website" },
  }
}

export default async function CategoryPage({ params }: Props) {
  const { slug, categorySlug } = await params
  const city = MEXICO_CITIES.find((c) => c.slug === slug)
  if (!city) notFound()

  // Fetch category (cached)
  const category = await getCachedCategoryBySlug(categorySlug)

  if (!category) notFound()

  // Fetch products in this category (cached)
  const products = await getCachedProductsByCategory(category.id)

  return (
    <CategoryPageClient
      citySlug={slug}
      cityName={city.name}
      category={category}
      products={products}
    />
  )
}
