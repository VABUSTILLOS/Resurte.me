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
    // Fetch all available products and filter by tags server-side.
    // (PostgREST jsonb overlap via "ov" has type-casting issues.)
    const { data } = await supabase
      .from("products")
      .select(`
        id, name, slug, description, image_url, images, brand, category_id, unit,
        show_in_whatsapp, whatsapp_product_id, tags,
        product_stores!inner(store_id, price, sale_price, is_available, stock_status)
      `)
      .eq("product_stores.store_id", 1)
      .eq("product_stores.is_available", true)
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
      products={products as unknown as (Product & { product_stores: { store_id: number; price: number; sale_price: number | null; is_available: boolean; stock_status: string }[] })[]}
    />
  )
}
