import { notFound } from "next/navigation"
import { MEXICO_CITIES } from "@/lib/cities"
import { Metadata } from "next"
import { SearchPageClient } from "@/components/search/search-page-client"
import { Suspense } from "react"
import { createClient } from "@/lib/supabase/server"
import { getProductsPaginated } from "@/lib/data"

interface Props {
  params: Promise<{ slug: string }>
}

export const revalidate = 300 // ISR: revalidate every 5 minutes

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

const INITIAL_PAGE_SIZE = 24

export default async function SearchPage({ params }: Props) {
  const { slug } = await params
  const city = MEXICO_CITIES.find((c) => c.slug === slug)
  if (!city) notFound()

  const supabase = await createClient()

  const categoriesPromise = supabase
    .from("categories")
    .select("id, name, slug, icon, parent_id")
    .order("id")

  const productsPromise = getProductsPaginated(0, INITIAL_PAGE_SIZE)

  const [{ data: categories }, { products, total }] = await Promise.all([
    categoriesPromise,
    productsPromise,
  ])

  return (
    <Suspense fallback={<div className="p-8 text-center text-[#999893]">Cargando...</div>}>
      <SearchPageClient
        citySlug={slug}
        cityName={city.name}
        products={products}
        categories={categories ?? []}
        totalProducts={total}
        pageSize={INITIAL_PAGE_SIZE}
      />
    </Suspense>
  )
}
