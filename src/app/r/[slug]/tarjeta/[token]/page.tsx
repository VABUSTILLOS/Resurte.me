import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { appleWalletConfig } from "@/lib/foodos-wallet/apple"
import { googleWalletConfig } from "@/lib/foodos-wallet/google"
import { loadWalletCardByToken } from "@/lib/foodos-wallet/passes"
import { createServiceClient } from "@/lib/supabase/service"
import { WalletCardView } from "./wallet-card-view"

export const revalidate = 60

interface PageProps {
  params: Promise<{ slug: string; token: string }>
}

/**
 * /r/[slug]/tarjeta/[token] — tarjeta de lealtad pública.
 *
 * El token es una capability URL: quien lo tiene ve la tarjeta y su QR, y nada
 * más. No hay sesión, no hay cookies ni headers —así la página se puede
 * regenerar en caché— y la respuesta no revela nada del restaurante que no
 * esté ya en su micrositio.
 */
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { token } = await params
  const supabase = await createServiceClient()
  const context = await loadWalletCardByToken(supabase, token)
  if (!context) return { title: "Tarjeta no encontrada" }
  return {
    title: `Tarjeta de lealtad · ${context.restaurant.name}`,
    description: `Consulta tus puntos y tu recompensa en ${context.restaurant.name}.`,
    robots: { index: false, follow: false },
  }
}

export default async function WalletCardPage({ params }: PageProps) {
  const { slug, token } = await params

  const supabase = await createServiceClient()
  const context = await loadWalletCardByToken(supabase, token)
  if (!context) notFound()

  // El slug de la URL manda: si no coincide con el de la tarjeta, el enlace
  // está mal armado y es mejor no mostrar una tarjeta bajo otro nombre.
  if (context.restaurant.slug !== slug) notFound()

  return (
    <WalletCardView
      slug={slug}
      token={context.pass.token}
      serial={context.pass.serial}
      restaurantName={context.restaurant.name}
      logoUrl={context.restaurant.logo_url}
      themeColor={context.restaurant.theme_color}
      customerName={context.customer.name}
      points={context.pass.points}
      pointValue={context.program?.point_value ?? 0}
      rewardLabel={context.program?.reward_label ?? null}
      rewardThreshold={context.program?.reward_points ?? null}
      cardUrl={context.cardUrl}
      appleEnabled={appleWalletConfig() !== null}
      googleEnabled={googleWalletConfig() !== null}
    />
  )
}
