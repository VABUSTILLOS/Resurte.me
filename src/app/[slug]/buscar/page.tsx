import { notFound } from "next/navigation"
import { MEXICO_CITIES } from "@/lib/cities"
import { Metadata } from "next"
import { SearchPageClient } from "@/components/search/search-page-client"
import { Suspense } from "react"
import { createClient } from "@/lib/supabase/server"

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const city = MEXICO_CITIES.find((c) => c.slug === slug)
  if (!city) return { title: "Búsqueda — Resurte.me" }

  const title = `Buscar productos en ${city.name} — Resurte.me`
  const description = `Busca productos por mayoreo en ${city.name}, ${city.state}. Encuentra frutas, verduras, carnes, abarrotes y más.`

  return {
    title,
    description,
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

export default async function SearchPage({ params }: Props) {
  const { slug } = await params
  const city = MEXICO_CITIES.find((c) => c.slug === slug)
  if (!city) notFound()

  const supabase = await createClient()

  const { data: products } = await supabase
    .from("products")
    .select(`
      id, name, slug, description, image_url, brand, category_id, unit,
      show_in_whatsapp, whatsapp_product_id,
      product_stores!inner(store_id, price, sale_price, is_available, stock_status)
    `)
    .eq("product_stores.store_id", 1)
    .order("name")

  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-400">Cargando...</div>}>
      <SearchPageClient citySlug={slug} cityName={city.name} products={products ?? []} />
    </Suspense>
  )
}
