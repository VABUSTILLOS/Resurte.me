import type { Metadata } from "next"
import { getPublicMarketplace } from "@/lib/foodos-public"
import { MarketplaceDirectory } from "@/components/marketplace/marketplace-directory"

export const metadata: Metadata = {
  title: "Hoy qué comemos · Pide directo a tu restaurante favorito",
  description:
    "Directorio de restaurantes para pedir en línea sin comisiones. Cada restaurante atiende su propio menú, con envío o para llevar. Un canal de Resurte.me para competir con las apps de delivery.",
  alternates: {
    canonical: "https://resurte.me/comer",
  },
}

export const revalidate = 60

export default async function ComerPage() {
  let entries: Awaited<ReturnType<typeof getPublicMarketplace>> = []

  try {
    entries = await getPublicMarketplace()
  } catch (error) {
    if (error instanceof Error && error.message.includes("Supabase no está configurado")) {
      console.warn("Marketplace renderizó sin Supabase (env no configurado).")
    } else {
      throw error
    }
  }

  return <MarketplaceDirectory entries={entries} />
}
