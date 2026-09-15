import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { getPublicRestaurantBySlug } from "@/lib/foodos-public"
import { OrderTracking } from "./order-tracking"

interface PageProps {
  params: Promise<{ slug: string; id: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const data = await getPublicRestaurantBySlug(slug)
  return { title: `Estado de tu pedido · ${data?.restaurant.name ?? "Restaurante"}` }
}

/** /r/[slug]/pedido/[id] — tracking público del pedido para el cliente. */
export default async function OrderTrackingPage({ params }: PageProps) {
  const { slug, id } = await params
  const data = await getPublicRestaurantBySlug(slug)
  if (!data) notFound()

  return <OrderTracking slug={slug} orderId={id} restaurantName={data.restaurant.name} />
}
