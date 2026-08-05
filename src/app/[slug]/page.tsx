import { notFound } from "next/navigation"
import { MEXICO_CITIES } from "@/lib/cities"
import { Metadata } from "next"
import { CityLanding } from "@/components/city/city-landing"
import { getCityLandingSchema } from "@/lib/structured-data"
import { createClient } from "@/lib/supabase/server"

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

  // Check auth
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: categories } = await supabase
    .from("categories")
    .select("id, name, slug, icon, parent_id")
    .order("id")

  const { data: products } = await supabase
    .from("products")
    .select(`
      id, name, slug, description, image_url, images, brand, category_id, unit,
      show_in_whatsapp, whatsapp_product_id,
      product_stores!inner(store_id, price, sale_price, is_available, stock_status)
    `)
    .eq("product_stores.store_id", 1)
    .order("name")

  // Fetch active restaurant collections
  const { data: collections } = await supabase
    .from("restaurant_collections")
    .select("*")
    .eq("is_active", true)
    .order("display_order")

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
        categories={categories ?? []}
        products={products ?? []}
        collections={collections ?? []}
        isLoggedIn={!!user}
      />
    </>
  )
}
