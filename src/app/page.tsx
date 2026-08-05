import { CityLanding } from "@/components/city/city-landing"
import { createClient } from "@/lib/supabase/server"
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
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [categories, products] = await Promise.all([
    supabase
      .from("categories")
      .select("id, name, slug, icon, parent_id")
      .order("id")
      .then(({ data }) => data ?? []),
    supabase
      .from("products")
      .select(`
        id, name, slug, description, image_url, images, brand, category_id, unit,
        show_in_whatsapp, whatsapp_product_id,
        product_stores!inner(store_id, price, sale_price, is_available, stock_status)
      `)
      .eq("product_stores.store_id", 1)
      .order("name")
      .then(({ data }) => data ?? []),
  ])

  return (
    <CityLanding
      citySlug={undefined}
      categories={categories}
      products={products}
      isLoggedIn={!!user}
    />
  )
}

