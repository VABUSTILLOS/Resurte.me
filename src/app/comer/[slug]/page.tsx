import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { getPublicMarketplace, getPublicRestaurantBySlug } from "@/lib/foodos-public"
import { getPublicCateringBySlug } from "@/lib/foodos-catering-public"
import { restaurantPath, siteOrigin } from "@/lib/foodos-seo"
import { FoodosStorefront } from "@/app/r/[slug]/storefront"

// ISR: mismo catálogo que el micrositio, revalidado cada 5 min.
export const revalidate = 300

// Pre-render de los restaurantes del directorio; si Supabase no está disponible
// en build se degradan a render bajo demanda (`dynamicParams` por defecto).
export async function generateStaticParams() {
  try {
    const marketplace = await getPublicMarketplace()
    return marketplace
      .map((entry) => ({ slug: entry.restaurant.slug }))
      .filter((entry) => Boolean(entry.slug))
  } catch {
    return []
  }
}

interface PageProps {
  params: Promise<{ slug: string }>
}

/**
 * Metadata de la ficha del directorio.
 *
 * `canonical` apunta al micrositio (`/r/[slug]`), no a esta URL: es el mismo
 * menú servido en dos superficies, y la que ya está indexada, tiene manifest
 * propio, carta, catering y enlaces entrantes es la del restaurante. Sin esto
 * Google vería contenido duplicado compitiendo consigo mismo.
 *
 * No se enlaza el manifest aquí a propósito: su `start_url` y su `scope` son
 * `/r/[slug]`, así que instalarlo desde el directorio abriría el micrositio y no
 * esta superficie.
 */
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const data = await getPublicRestaurantBySlug(slug)
  if (!data) return { title: "Restaurante no encontrado" }
  return {
    title: `${data.restaurant.name} · Pide en línea en HoyQuéComemos`,
    description: data.restaurant.description ?? undefined,
    alternates: { canonical: `${siteOrigin()}${restaurantPath(slug)}` },
    openGraph: data.restaurant.logo_url
      ? { images: [data.restaurant.logo_url] }
      : undefined,
  }
}

export default async function ComerRestaurantPage({ params }: PageProps) {
  const { slug } = await params
  const data = await getPublicRestaurantBySlug(slug)
  if (!data) notFound()

  const itemsAvailable = data.items.filter((i) => i.is_available)
  const combosActive = data.combos.filter((c) => c.is_active)
  // El enlace a catering solo se muestra si hay paquetes activos: la página
  // pública responde 404 cuando no los hay.
  const catering = await getPublicCateringBySlug(slug)

  return (
    <FoodosStorefront
      origin="marketplace"
      restaurant={data.restaurant}
      branches={data.branches}
      categories={data.categories}
      items={itemsAvailable}
      combos={combosActive}
      rules={data.rules.filter((r) => r.is_active)}
      optionGroups={data.optionGroups}
      optionValues={data.optionValues}
      branchHours={data.branchHours}
      overrides={data.overrides}
      reviews={data.reviews}
      hasCatering={Boolean(catering)}
    />
  )
}
