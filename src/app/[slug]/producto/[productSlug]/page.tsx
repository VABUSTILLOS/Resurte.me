import { notFound } from "next/navigation"
import { MEXICO_CITIES } from "@/lib/cities"
import { Metadata } from "next"
import {
  getCachedCategoryById,
  getCachedProductBySlug,
  getCachedProductsByCategory,
  getCachedVisibleProducts,
} from "@/lib/catalog-cache"
import { ProductDetailClient } from "./product-detail-client"
import { getBreadcrumbSchema, getProductSchema } from "@/lib/structured-data"

// ISR: revalidate product pages every hour for fresh pricing
export const revalidate = 3600

interface Props {
  params: Promise<{ slug: string; productSlug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, productSlug } = await params
  const city = MEXICO_CITIES.find((c) => c.slug === slug)
  if (!city) return { title: "Producto no encontrado — Resurte.me" }

  const product = await getCachedProductBySlug(productSlug)

  if (!product) return { title: "Producto no encontrado — Resurte.me" }

  return {
    title: `${product.name} en ${city.name} — Resurte.me`,
    description: product.description?.slice(0, 160) ?? `${product.name} por mayoreo en ${city.name}.`,
    openGraph: {
      title: `${product.name} en ${city.name}`,
      description: product.description?.slice(0, 160) ?? `${product.name} por mayoreo en ${city.name}.`,
      images: product.image_url ? [product.image_url] : [],
      url: `https://resurte.me/${city.slug}/producto/${productSlug}`,
      siteName: "Resurte.me",
      locale: "es_MX",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: `${product.name} en ${city.name}`,
      description: product.description?.slice(0, 160) ?? `${product.name} por mayoreo en ${city.name}.`,
      images: product.image_url ? [product.image_url] : [],
    },
    alternates: {
      canonical: `https://resurte.me/${city.slug}/producto/${productSlug}`,
    },
  }
}

export default async function ProductPage({ params }: Props) {
  const { slug, productSlug } = await params
  const city = MEXICO_CITIES.find((c) => c.slug === slug)
  if (!city) notFound()

  // Fetch product with category (cached)
  const product = await getCachedProductBySlug(productSlug)

  if (!product) notFound()

  // Fetch category info (cached)
  const category = await getCachedCategoryById(product.category_id)

  // Fetch related products (same category, excluding current)
  const relatedSameCategory = (await getCachedProductsByCategory(product.category_id)).filter(
    (p) => p.id !== product.id
  )

  const related = relatedSameCategory.slice(0, 4)

  // If fewer than 4 from same category, fill with products from other categories
  if (related.length < 4) {
    const existingIds = new Set([product.id, ...related.map((p) => p.id)])
    const otherProducts = (await getCachedVisibleProducts()).filter(
      (p) => p.id !== product.id && !existingIds.has(p.id)
    )

    if (otherProducts.length) related.push(...otherProducts.slice(0, 4 - related.length))
  }

  const url = `https://resurte.me/${slug}/producto/${productSlug}`
  const jsonLd = [
    getProductSchema(
      product.name,
      product.description?.slice(0, 300) ?? `${product.name} por mayoreo en ${city.name}.`,
      product.brand || "Resurte.me",
      product.sale_price ?? product.price,
      product.stock_status
    ),
    getBreadcrumbSchema([
      { name: city.name, url: `https://resurte.me/${slug}` },
      { name: category?.name ?? "Catálogo", url: category ? `https://resurte.me/${slug}/categoria/${category.slug}` : `https://resurte.me/${slug}/catalogo` },
      { name: product.name, url },
    ]),
  ]

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <ProductDetailClient
        product={product}
        category={category ?? undefined}
        relatedProducts={related}
        citySlug={slug}
        cityName={city.name}
      />
    </>
  )
}
