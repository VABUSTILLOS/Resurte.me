// ============================================================
// Lectura pública del micrositio /r/[slug].
// Usa el cliente anónimo (RLS): solo se exponen restaurantes
// activos, su menú, sucursales, combos y reglas de cross-sell.
// ============================================================

import { createClient } from "@/lib/supabase/server"
import type {
  FoodosRestaurant,
  FoodosBranch,
  FoodosMenuCategory,
  FoodosMenuItem,
  FoodosCombo,
  FoodosUpsellRule,
} from "@/types/foodos"

export interface PublicFoodosData {
  restaurant: FoodosRestaurant
  branches: FoodosBranch[]
  categories: FoodosMenuCategory[]
  items: FoodosMenuItem[]
  combos: FoodosCombo[]
  rules: FoodosUpsellRule[]
}

export async function getPublicRestaurantBySlug(slug: string): Promise<PublicFoodosData | null> {
  const supabase = await createClient()

  const { data: restaurant, error } = await supabase
    .from("foodos_restaurants")
    .select("*")
    .eq("slug", slug)
    .eq("status", "active")
    .maybeSingle()

  if (error || !restaurant) return null

  const [branches, categories, items, combos, rules] = await Promise.all([
    supabase.from("foodos_branches").select("*").eq("restaurant_id", restaurant.id).order("name"),
    supabase
      .from("foodos_menu_categories")
      .select("*")
      .eq("restaurant_id", restaurant.id)
      .order("sort_order"),
    supabase
      .from("foodos_menu_items")
      .select("*")
      .eq("restaurant_id", restaurant.id)
      .order("sort_order"),
    supabase.from("foodos_combos").select("*").eq("restaurant_id", restaurant.id),
    supabase.from("foodos_upsell_rules").select("*").eq("restaurant_id", restaurant.id),
  ])

  return {
    restaurant: restaurant as FoodosRestaurant,
    branches: (branches.data as FoodosBranch[]) ?? [],
    categories: (categories.data as FoodosMenuCategory[]) ?? [],
    items: (items.data as FoodosMenuItem[]) ?? [],
    combos: (combos.data as FoodosCombo[]) ?? [],
    rules: (rules.data as FoodosUpsellRule[]) ?? [],
  }
}
