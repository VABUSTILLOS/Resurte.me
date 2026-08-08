import { CityLanding } from "@/components/city/city-landing"
import {
  getCachedCategories,
  getCachedVisibleProducts,
} from "@/lib/catalog-cache"
import { hasSessionCookie } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import type { Category, Product } from "@/types"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Resurte.me — Central de Abastos Digital para tu Negocio",
  description:
    "Proveeduría para restaurantes, fondas y negocios. Frutas, verduras, carnes y abarrotes por mayoreo con envío gratis desde $2,500 MXN. Sin membresía.",
  alternates: {
    canonical: "https://resurte.me",
  },
}

export default async function Home() {
  let user: unknown = null
  let categories: Category[] = []
  let products: Product[] = []

  try {
    // Solo consultamos la sesión si el request trae cookie de Supabase.
    // Visitantes anónimos ahorran un roundtrip de red a getUser().
    if (await hasSessionCookie()) {
      user = await getCurrentUser()
    }

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
      console.warn("Home renderizó sin Supabase (env no configurado).")
    } else {
      throw error
    }
  }

  return (
    <CityLanding
      citySlug={undefined}
      categories={categories}
      products={products}
      isLoggedIn={!!user}
    />
  )
}

