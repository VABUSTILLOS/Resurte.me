import { CityLanding } from "@/components/city/city-landing"
import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"
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

  // Auto-fix: ensure all products have product_stores entries
  const serviceClient = await createServiceClient()
  try {
    const { data: allProducts } = await serviceClient.from("products").select("id")
    const { data: allStores } = await serviceClient.from("product_stores").select("product_id")
    if (allProducts && allStores) {
      const storeIds = new Set(allStores.map((s: any) => s.product_id))
      const missingIds = allProducts.filter((p: any) => !storeIds.has(p.id)).map((p: any) => p.id)
      if (missingIds.length > 0) {
        await serviceClient.from("product_stores").insert(
          missingIds.map((id: number) => ({ product_id: id, store_id: 1, price: 0 }))
        )
      }
    }
  } catch (_) { /* non-critical */ }

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

