// ============================================================
// /r/[slug]/catering — paquetes de catering por volumen (Fase 7).
//
// Vive aquí y no en el micrositio SEO de la Fase 6 porque es una acción del
// comensal (pedir una cotización), igual que `/r/[slug]/carta`. La gestión
// —paquetes, precios, confirmaciones— está en el panel, gateada por nivel
// Diamante; esta cara pública no tiene gate.
//
// Sin cookies ni headers: se prerenderiza por restaurante y se regenera cada
// 5 minutos.
// ============================================================

import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { getPublicCateringBySlug } from "@/lib/foodos-catering-public"
import { cateringPath, siteOrigin } from "@/lib/foodos-seo"

import { CateringView } from "./catering-view"

export const revalidate = 300

interface PageProps {
  params: Promise<{ slug: string }>
}

export async function generateStaticParams() {
  try {
    const { getPublicMarketplace } = await import("@/lib/foodos-public")
    const marketplace = await getPublicMarketplace()
    return marketplace
      .map((entry) => ({ slug: entry.restaurant.slug }))
      .filter((entry) => Boolean(entry.slug))
  } catch {
    return []
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const data = await getPublicCateringBySlug(slug)
  if (!data) return { title: "Catering no disponible", robots: { index: false } }

  return {
    title: `Catering y eventos · ${data.restaurant.name}`,
    description: `Paquetes de catering por volumen de ${data.restaurant.name}: grupos, empresas y celebraciones.`,
    alternates: { canonical: `${siteOrigin()}${cateringPath(slug)}` },
    openGraph: data.restaurant.logoUrl ? { images: [data.restaurant.logoUrl] } : undefined,
  }
}

export default async function CateringPage({ params }: PageProps) {
  const { slug } = await params
  const data = await getPublicCateringBySlug(slug)
  // Sin paquetes activos la página no tiene nada que ofrecer, y el micrositio
  // tampoco la enlaza en ese caso.
  if (!data) notFound()

  return <CateringView restaurant={data.restaurant} packages={data.packages} />
}
