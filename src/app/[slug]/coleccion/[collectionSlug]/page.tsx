import { notFound } from "next/navigation"
import { MEXICO_CITIES } from "@/lib/cities"
import {
  getCachedCollectionBySlug,
  getCachedProductsByCollection,
  getCachedVisibleProducts,
} from "@/lib/catalog-cache"
import { Metadata } from "next"
import { CollectionPageClient } from "./collection-page-client"
import type { Product } from "@/types"

interface Props {
  params: Promise<{ slug: string; collectionSlug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, collectionSlug } = await params
  const city = MEXICO_CITIES.find((c) => c.slug === slug)

  const collection = await getCachedCollectionBySlug(collectionSlug)

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

  // Fetch collection metadata (cached)
  const collection = await getCachedCollectionBySlug(collectionSlug)

  if (!collection) notFound()

  // Fetch products matching this collection's tags (cached full catalog)
  const tags = collection.tags || []

  // Productos de esta colección: la capa de datos filtra por intersección de
  // tags (getProductsByCollection).
  let products: Product[] = []
  // Full visible catalog used for recipe ingredient → product matching.
  // Ingredients like "Sal", "Aceite vegetal" or "Pan brioche" may not be tagged
  // with this collection, so we match against the whole store, not just the
  // collection-filtered grid.
  const allProducts = await getCachedVisibleProducts()
  if (tags.length > 0) {
    products = await getCachedProductsByCollection(collectionSlug)
  }

  return (
    <CollectionPageClient
      citySlug={slug}
      cityName={city.name}
      collection={collection}
      products={products}
      allProducts={allProducts}
    />
  )
}
