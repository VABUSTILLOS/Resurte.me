import { notFound } from "next/navigation"
import { MEXICO_CITIES } from "@/lib/cities"
import { createClient } from "@/lib/supabase/server"
import { Metadata } from "next"
import { CollectionPageClient } from "./collection-page-client"
import type { Product } from "@/types"

interface Props {
  params: Promise<{ slug: string; collectionSlug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, collectionSlug } = await params
  const city = MEXICO_CITIES.find((c) => c.slug === slug)

  const supabase = await createClient()
  const { data: collection } = await supabase
    .from("restaurant_collections")
    .select("name")
    .eq("slug", collectionSlug)
    .eq("is_active", true)
    .single()

  if (!city || !collection) {
    return { title: "Colección no encontrada — Resurte.me" }
  }

  const title = `${collection.name} — Insumos por mayoreo en ${city.name} | Resurte.me`
  const description = `Insumos curados para ${collection.name.toLowerCase()} en ${city.name}, ${city.state}. Precios institucionales, facturación incluida, entrega el mismo día.`

  return {
    title,
    description,
    alternates: { canonical: `https://resurte.me/${city.slug}/coleccion/${collectionSlug}` },
    openGraph: { title, description, url: `https://resurte.me/${city.slug}/coleccion/${collectionSlug}`, siteName: "Resurte.me", locale: "es_MX", type: "website" },
  }
}

export default async function CollectionPage({ params }: Props) {
  const { slug, collectionSlug } = await params
  const city = MEXICO_CITIES.find((c) => c.slug === slug)
  if (!city) notFound()

  const supabase = await createClient()

  // Fetch collection metadata
  const { data: collection } = await supabase
    .from("restaurant_collections")
    .select("*")
    .eq("slug", collectionSlug)
    .eq("is_active", true)
    .single()

  if (!collection) notFound()

  // Fetch products matching this collection's tags
  const tags = (collection as { tags: string[] }).tags || []

  let products: Record<string, unknown>[] = []
  if (tags.length > 0) {
    const { data } = await supabase
      .from("products")
      .select("*")
      .eq("is_visible", true)
      .order("name")

    const allProducts = (data ?? []) as Record<string, unknown>[]
    products = allProducts.filter((p) => {
      const productTags: string[] = Array.isArray(p.tags) ? (p.tags as string[]) : []
      return productTags.some((t: string) => tags.includes(t))
    })
  }

  return (
    <CollectionPageClient
      citySlug={slug}
      cityName={city.name}
      collection={collection as { id: number; name: string; slug: string; description: string | null; image_url: string | null; tags: string[] }}
      products={products as unknown as Product[]}
    />
  )
}
