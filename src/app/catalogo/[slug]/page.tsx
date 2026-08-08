import { notFound } from "next/navigation"
import { Metadata } from "next"
import { MEXICO_CITIES } from "@/lib/cities"
import { CityPageClient } from "@/components/city/city-page-client"
import {
  getCachedCategories,
  getCachedVisibleProducts,
} from "@/lib/catalog-cache"
import { getCityBySlug } from "@/lib/data"
import type { Category, Product, City } from "@/types"

interface Props {
  params: Promise<{ slug: string }>
}

export const revalidate = 3600 // ISR: revalidate every hour like the landing

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

  const title = `Catálogo completo en ${city.name} — Resurte.me`
  const description = `Catálogo completo de productos por mayoreo en ${city.name}, ${city.state}. Frutas, verduras, carnes, abarrotes y más, con búsqueda y categorías.`

  return {
    title,
    description,
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

  // Sin Supabase configurado (dev local/preview) el catálogo renderiza vacío
  // en lugar de fallar, igual que la landing.
  let categories: Category[] = []
  let products: Product[] = []

  try {
    const [cats, prods] = await Promise.all([
      getCachedCategories(),
      getCachedVisibleProducts(),
    ])
    categories = cats
    products = prods
  } catch (error) {
    if (error instanceof Error && error.message.includes("Supabase no está configurado")) {
      console.warn(`CatalogPage(${slug}) renderizó sin Supabase (env no configurado).`)
    } else {
      throw error
    }
  }

  return (
    <CityPageClient slug={slug} categories={categories} products={products} />
  )
}
