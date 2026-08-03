import { notFound } from "next/navigation"
import { MEXICO_CITIES } from "@/lib/cities"
import { Metadata } from "next"
import { createClient } from "@/lib/supabase/server"
import { ProductDetailClient } from "./product-detail-client"

interface Props {
  params: Promise<{ slug: string; productSlug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, productSlug } = await params
  const city = MEXICO_CITIES.find((c) => c.slug === slug)
  if (!city) return { title: "Producto no encontrado — Resurte.me" }

  const supabase = await createClient()
  const { data: product } = await supabase
    .from("products")
    .select("name, description, image_url")
    .eq("slug", productSlug)
    .single()

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

  const supabase = await createClient()

  // Fetch product with store data and category
  const { data: product } = await supabase
    .from("products")
    .select(`
      id, name, slug, description, image_url, images, brand, category_id, unit,
      show_in_whatsapp, whatsapp_product_id,
      product_stores!inner(store_id, price, sale_price, is_available, stock_status)
    `)
    .eq("slug", productSlug)
    .eq("product_stores.store_id", 1)
    .single()

  if (!product) notFound()

  // Fetch category info
  const { data: category } = await supabase
    .from("categories")
    .select("id, name, slug, icon, parent_id")
    .eq("id", product.category_id)
    .single()

  // Fetch related products (same category, excluding current)
  const { data: relatedSameCategory } = await supabase
    .from("products")
    .select(`
      id, name, slug, description, image_url, images, brand, category_id, unit,
      show_in_whatsapp, whatsapp_product_id,
      product_stores!inner(store_id, price, sale_price, is_available, stock_status)
    `)
    .eq("category_id", product.category_id)
    .neq("id", product.id)
    .eq("product_stores.store_id", 1)
    .limit(4)
    .order("name")

  const related = relatedSameCategory ?? []

  // If fewer than 4 from same category, fill with products from other categories
  if (related.length < 4) {
    const existingIds = [product.id, ...related.map((p) => p.id)]
    const { data: otherProducts } = await supabase
      .from("products")
      .select(`
        id, name, slug, description, image_url, images, brand, category_id, unit,
        show_in_whatsapp, whatsapp_product_id,
        product_stores!inner(store_id, price, sale_price, is_available, stock_status)
      `)
      .not("id", "in", `(${existingIds.join(",")})`)
      .eq("product_stores.store_id", 1)
      .limit(4 - related.length)
      .order("name")

    if (otherProducts) related.push(...otherProducts)
  }

  // Fetch category names for related products
  const relatedCategoryIds = [...new Set(related.map((p) => p.category_id))]
  const { data: relatedCategories } = relatedCategoryIds.length > 0
    ? await supabase
        .from("categories")
        .select("id, name, slug, icon, parent_id")
        .in("id", relatedCategoryIds)
    : { data: [] }

  const categoryMap = new Map((relatedCategories ?? []).map((c) => [c.id, c]))

  return (
    <ProductDetailClient
      product={product}
      category={category ?? undefined}
      relatedProducts={related}
      relatedCategoryMap={categoryMap}
      citySlug={slug}
      cityName={city.name}
    />
  )
}
