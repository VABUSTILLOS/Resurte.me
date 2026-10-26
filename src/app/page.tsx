import { CityLanding } from "@/components/city/city-landing"
import { logger } from "@/lib/logger"
import {
  getCachedCategories,
  getCachedVisibleProducts,
} from "@/lib/catalog-cache"
import { buildLandingPreview } from "@/lib/catalog-preview"
import type { Category, Product } from "@/types"
import type { Metadata } from "next"
import { FREE_SHIPPING_MXN, formatMxn } from "@/lib/commercial-facts"

// ISR: la sesión se detecta en el cliente (CityLanding); leer cookies aquí
// convertía la landing en SSR por request.
export const revalidate = 300

export const metadata: Metadata = {
  title: "Resurte.me — Central de Abastos Digital en Chihuahua",
  description:
    `Proveeduría para restaurantes, fondas y negocios en Chihuahua. Frutas, verduras, carnes y abarrotes por mayoreo con envío gratis desde ${formatMxn(FREE_SHIPPING_MXN)}. Sin membresía.`,
  keywords: [
    "central de abastos Chihuahua",
    "proveeduría restaurantes Chihuahua",
    "abarrotes por mayoreo Chihuahua",
    "frutas y verduras mayoreo Chihuahua",
    "distribuidor de alimentos Chihuahua",
    "insumos para restaurantes Chihuahua",
  ],
  alternates: {
    canonical: "https://resurte.me",
  },
  openGraph: {
    title: "Resurte.me — Central de Abastos Digital en Chihuahua",
    description:
      `Frutas, verduras, carnes y abarrotes por mayoreo para tu negocio en Chihuahua. Envío gratis desde ${formatMxn(FREE_SHIPPING_MXN)}.`,
    url: "https://resurte.me",
    siteName: "Resurte.me",
    locale: "es_MX",
    type: "website",
  },
}

export default async function Home() {
  let categories: Category[] = []
  let products: Product[] = []

  try {
    const [cats, prods] = await Promise.all([
      getCachedCategories(),
      getCachedVisibleProducts(),
    ])
    categories = cats
    products = prods
  } catch (error) {
    // Sin Supabase configurado (dev local/preview sin secrets) la landing
    // renderiza vacía en lugar de fallar. Los errores reales de la DB no se
    // silencian: `createClient` solo lanza cuando faltan las env vars.
    if (error instanceof Error && error.message.includes("Supabase no está configurado")) {
      logger.warn("Home renderizó sin Supabase (env no configurado).")
    } else {
      throw error
    }
  }

  return (
    <CityLanding
      citySlug={undefined}
      categories={categories}
      preview={buildLandingPreview(products, categories)}
      totalCount={products.length}
    />
  )
}

