import { notFound } from "next/navigation"
import { MEXICO_CITIES } from "@/lib/cities"
import { Metadata } from "next"
import { CityLanding } from "@/components/city/city-landing"
import { logger } from "@/lib/logger"
import {
  getCachedActiveCollections,
  getCachedCategories,
  getCachedVisibleProducts,
} from "@/lib/catalog-cache"
import { getCityLandingSchema } from "@/lib/structured-data"
import { getCityBySlug } from "@/lib/data"
import type { Category, Product, RestaurantCollection, City } from "@/types"

// ISR: la página se genera en build y se revalida cada 5 minutos (alineado con
// `unstable_cache` de src/lib/catalog-cache.ts). Antes leía `headers()` para el
// nonce CSP por request, lo que la convertía en SSR por visita y disparaba el
// consumo de Fluid Active CPU en Vercel. La CSP ahora es estática
// (src/lib/csp.ts) y la sesión se detecta en el cliente (CityLanding).
export const revalidate = 300

export function generateStaticParams() {
  return MEXICO_CITIES.map((city) => ({ slug: city.slug }))
}

interface Props {
  params: Promise<{ slug: string }>
}

/**
 * Resuelve la ciudad con datos de la tabla `cities` de Supabase cuando está
 * disponible (lat/lng/state actualizados en DB), degradando al catálogo
 * estático cuando no hay Supabase o la ciudad no existe en DB.
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

  if (!city) return { title: "Ciudad no encontrada — Resurte.me" }

  const title = `Resurte.me en ${city.name} — Central de Abastos Digital`
  const description = `Central de abastos en línea para tu negocio en ${city.name}, ${city.state}. Abarrotes, frutas, verduras y carnes por mayoreo. Sin membresía, envío gratis desde $2,500 MXN.`

  return {
    title,
    description,
    alternates: {
      canonical: `https://resurte.me/${city.slug}`,
    },
    openGraph: {
      title,
      description,
      url: `https://resurte.me/${city.slug}`,
      siteName: "Resurte.me",
      locale: "es_MX",
      type: "website",
      images: [
        {
          url: "https://resurte.me/opengraph-image",
          width: 1200,
          height: 630,
          alt: `Resurte.me en ${city.name}`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ["https://resurte.me/opengraph-image"],
    },
  }
}

export default async function CityPage({ params }: Props) {
  const { slug } = await params
  const city = await resolveCity(slug)

  if (!city) notFound()

  // Fetch de catálogo. Sin Supabase configurado (dev local/preview)
  // la ciudad renderiza vacía en lugar de fallar.
  let categories: Category[] = []
  let products: Product[] = []
  let collections: RestaurantCollection[] = []

  try {
    const [cats, prods, colls] = await Promise.all([
      getCachedCategories(),
      getCachedVisibleProducts(),
      getCachedActiveCollections(),
    ])
    categories = cats
    products = prods
    collections = colls
  } catch (error) {
    if (error instanceof Error && error.message.includes("Supabase no está configurado")) {
      logger.warn(`CityPage(${slug}) renderizó sin Supabase (env no configurado).`)
    } else {
      throw error
    }
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(getCityLandingSchema(city.name, city.state, city.lat, city.lng)),
        }}
      />
      <CityLanding
        citySlug={slug}
        categories={categories}
        products={products}
        collections={collections}
      />
    </>
  )
}
