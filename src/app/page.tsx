import { CityLanding } from "@/components/city/city-landing"
import { createClient } from "@/lib/supabase/server"

export default async function Home() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: categories } = await supabase
    .from("categories")
    .select("id, name, slug, icon, parent_id")
    .order("id")

  const { data: products } = await supabase
    .from("products")
    .select(`
      id, name, slug, description, image_url, images, brand, category_id, unit,
      show_in_whatsapp, whatsapp_product_id,
      product_stores!inner(store_id, price, sale_price, is_available, stock_status)
    `)
    .eq("product_stores.store_id", 1)
    .order("name")

  return (
    <CityLanding
      citySlug={undefined}
      categories={categories ?? []}
      products={products ?? []}
      isLoggedIn={!!user}
    />
  )
}

