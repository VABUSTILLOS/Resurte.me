import { notFound } from "next/navigation"
import { MEXICO_CITIES } from "@/lib/cities"
import { createClientOrNotFound } from "@/lib/supabase/server"
import { Metadata } from "next"
import { CategoryPageClient } from "./category-page-client"

interface Props {
  params: Promise<{ slug: string; categorySlug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, categorySlug } = await params
  const city = MEXICO_CITIES.find((c) => c.slug === slug)

  const supabase = await createClientOrNotFound()
  const { data: category } = await supabase
    .from("categories")
    .select("name")
    .eq("slug", categorySlug)
    .single()

  if (!city || !category) {
    return { title: "Categoría no encontrada — Resurte.me" }
  }

  const title = `${category.name} en ${city.name} — Resurte.me`
  const description = `Compra ${category.name.toLowerCase()} por mayoreo en ${city.name}, ${city.state}. Precios de central de abastos, entrega el mismo día.`

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

  const supabase = await createClientOrNotFound()

  // Fetch category
  const { data: category } = await supabase
    .from("categories")
    .select("id, name, slug, icon, parent_id")
    .eq("slug", categorySlug)
    .single()

  if (!category) notFound()

  // Fetch products in this category
  const { data: products } = await supabase
    .from("products")
    .select("*")
    .eq("category_id", category.id)
    .eq("is_visible", true)
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
