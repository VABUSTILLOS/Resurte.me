import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { getPublicRestaurantBySlug } from "@/lib/foodos-public"
import { FoodosStorefront } from "./storefront"

interface PageProps {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const data = await getPublicRestaurantBySlug(slug)
  if (!data) return { title: "Restaurante no encontrado" }
  return {
    title: `${data.restaurant.name} · Pide en línea`,
    description: data.restaurant.description ?? undefined,
    openGraph: data.restaurant.logo_url
      ? { images: [data.restaurant.logo_url] }
      : undefined,
  }
}

export default async function StorefrontPage({ params }: PageProps) {
  const { slug } = await params
  const data = await getPublicRestaurantBySlug(slug)
  if (!data) notFound()

  const itemsAvailable = data.items.filter((i) => i.is_available)
  const combosActive = data.combos.filter((c) => c.is_active)

  return (
    <FoodosStorefront
      restaurant={data.restaurant}
      branches={data.branches}
      categories={data.categories}
      items={itemsAvailable}
      combos={combosActive}
      rules={data.rules.filter((r) => r.is_active)}
    />
  )
}
