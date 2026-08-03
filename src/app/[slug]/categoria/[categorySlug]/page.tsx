import { notFound } from "next/navigation"
import { MEXICO_CITIES } from "@/lib/cities"
import { createClient } from "@/lib/supabase/server"
import { Metadata } from "next"
import { CategoryPageClient } from "./category-page-client"

interface Props {
  params: Promise<{ slug: string; categorySlug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, categorySlug } = await params
  const city = MEXICO_CITIES.find((c) => c.slug === slug)

  const supabase = await createClient()
  const { data: category } = await supabase
    .from("categories")
    .select("name")
    .eq("slug", categorySlug)
    .single()

  if (!city || !category) {
    return { title: "Categoría no encontrada — Resurte.me" }
  }

  const title = `${category.name} en ${city.name} — Resurte.me`
  const description = `Compra ${category.name.toLowerCase()} por mayoreo en ${city.name}, ${city.state}. Precios de central de abastos, entrega en 24-48h.`

  return {
    title,
    description,
    alternates: { canonical: `https://resurte.me/${city.slug}/categoria/${categorySlug}` },
    openGraph: { title, description, url: `https://resurte.me/${city.slug}/categoria/${categorySlug}`, siteName: "Resurte.me", locale: "es_MX", type: "website" },
  }
}

export default async function CategoryPage({ params }: Props) {
  const { slug, categorySlug } = await params
  const city = MEXICO_CITIES.find((c) => c.slug === slug)
  if (!city) notFound()

  const supabase = await createClient()

  // Fetch category
  const { data: category } = await supabase
    .from("categories")
    .select("id, name, slug, icon, parent_id")
    .eq("slug", categorySlug)
    .single()

  if (!category) notFound()

  // Fetch products in this category with pricing from store 1 (Resurte.me) — default view
  const { data: products } = await supabase
    .from("products")
    .select(`
      id, name, slug, description, image_url, brand, category_id, unit,
      show_in_whatsapp, whatsapp_product_id,
      product_stores!inner(store_id, price, sale_price, is_available, stock_status)
    `)
    .eq("category_id", category.id)
    .eq("product_stores.store_id", 1)
    .order("name")

  return (
    <CategoryPageClient
      citySlug={slug}
      cityName={city.name}
      category={category}
      products={products ?? []}
    />
  )
}
