// ============================================================
// Lectura pública del micrositio /r/[slug].
// Usa el cliente anónimo (RLS): solo se exponen restaurantes
// activos, su menú, sucursales, combos y reglas de cross-sell.
// ============================================================

import { unstable_cache } from "next/cache"
import { createPublicClient } from "@/lib/supabase/public"
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

export interface PublicMarketplaceEntry {
  restaurant: FoodosRestaurant
  branches: FoodosBranch[]
  categories: FoodosMenuCategory[]
  items: FoodosMenuItem[]
}

async function fetchPublicRestaurantBySlug(slug: string): Promise<PublicFoodosData | null> {
  const supabase = createPublicClient()
  if (!supabase) return null

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

// Caché por slug: el micrositio /r/[slug] es público (RLS anónimo) y reune 6
// queries. El slug es parte de la key del caché automáticamente (argumento).
export const getPublicRestaurantBySlug = unstable_cache(
  fetchPublicRestaurantBySlug,
  ["foodos-public-restaurant"],
  { revalidate: 300, tags: ["foodos", "foodos-public"] }
)

async function fetchPublicMarketplace(): Promise<PublicMarketplaceEntry[]> {
  const supabase = createPublicClient()
  if (!supabase) return []

  const { data: restaurants, error } = await supabase
    .from("foodos_restaurants")
    .select("*")
    .eq("status", "active")
    .order("created_at", { ascending: false })

  if (error || !restaurants || restaurants.length === 0) return []

  const ids = (restaurants as FoodosRestaurant[]).map((r) => r.id)

  const [branches, categories, items] = await Promise.all([
    supabase
      .from("foodos_branches")
      .select("*")
      .in("restaurant_id", ids)
      .order("name"),
    supabase
      .from("foodos_menu_categories")
      .select("*")
      .in("restaurant_id", ids)
      .order("sort_order"),
    supabase
      .from("foodos_menu_items")
      .select("*")
      .in("restaurant_id", ids)
      .eq("is_available", true),
  ])

  const branchesByRestaurant = groupBy(
    (branches.data as FoodosBranch[]) ?? [],
    (b) => b.restaurant_id
  )
  const categoriesByRestaurant = groupBy(
    (categories.data as FoodosMenuCategory[]) ?? [],
    (c) => c.restaurant_id
  )
  const itemsByRestaurant = groupBy(
    (items.data as FoodosMenuItem[]) ?? [],
    (i) => i.restaurant_id
  )

  return (restaurants as FoodosRestaurant[]).map((restaurant) => ({
    restaurant,
    branches: branchesByRestaurant.get(restaurant.id) ?? [],
    categories: categoriesByRestaurant.get(restaurant.id) ?? [],
    items: itemsByRestaurant.get(restaurant.id) ?? [],
  }))
}

// El directorio /comer también es público: caché global con TTL de 60s.
export const getPublicMarketplace = unstable_cache(
  fetchPublicMarketplace,
  ["foodos-public-marketplace"],
  { revalidate: 60, tags: ["foodos", "foodos-public"] }
)

function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>()
  for (const row of rows) {
    const k = key(row)
    const list = map.get(k)
    if (list) list.push(row)
    else map.set(k, [row])
  }
  return map
}
