import { notFound } from "next/navigation"
import { MEXICO_CITIES } from "@/lib/cities"
import { Metadata } from "next"
import { CityLanding } from "@/components/city/city-landing"
import { getCityLandingSchema } from "@/lib/structured-data"
import { createClient } from "@/lib/supabase/server"
import type { Category, Product, RestaurantCollection } from "@/types"

// ISR: revalidate every hour so new collections/products appear without manual deploy
export const revalidate = 3600

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const city = MEXICO_CITIES.find((c) => c.slug === slug)

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
          url: "https://resurte.me/og-image.png",
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
      images: ["https://resurte.me/og-image.png"],
    },
  }
}

export default async function CityPage({ params }: Props) {
  const { slug } = await params
  const city = MEXICO_CITIES.find((c) => c.slug === slug)

  if (!city) notFound()

  // Check auth + fetch catalog. Sin Supabase configurado (dev local/preview)
  // la ciudad renderiza vacía en lugar de fallar.
  let user: unknown = null
  let categories: Category[] = []
  let products: Product[] = []
  let collections: RestaurantCollection[] = []

  try {
    const supabase = await createClient()
    const { data: { user: currentUser } } = await supabase.auth.getUser()
    user = currentUser

    const [cats, prods, colls] = await Promise.all([
      supabase
        .from("categories")
        .select("id, name, slug, icon, parent_id")
        .order("id"),
      supabase
        .from("products")
        .select("*")
        .eq("is_visible", true)
        .order("name"),
      supabase
        .from("restaurant_collections")
        .select("*")
        .eq("is_active", true)
        .order("display_order"),
    ])
    categories = (cats.data as Category[]) ?? []
    products = (prods.data as Product[]) ?? []
    collections = (colls.data as RestaurantCollection[]) ?? []
  } catch (error) {
    if (error instanceof Error && error.message.includes("Supabase no está configurado")) {
      console.warn(`CityPage(${slug}) renderizó sin Supabase (env no configurado).`)
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
        isLoggedIn={!!user}
      />
    </>
  )
}
