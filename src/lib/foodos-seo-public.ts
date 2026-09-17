// ============================================================
// Lectura pública del sitio IA (`/r/[slug]/carta` y `/r/[slug]/p/*`).
//
// Usa el cliente anónimo (RLS): solo restaurantes activos, su menú y sus
// páginas **publicadas**. Sin cookies ni headers, así que todo esto se
// prerenderiza y se puede cachear por slug.
//
// Deliberadamente separado de `getPublicRestaurantBySlug`: el micrositio de
// pedidos es el camino caliente y no debe pagar las consultas del sitio SEO.
// ============================================================

import { unstable_cache } from "next/cache"

import { createPublicClient } from "@/lib/supabase/public"
import { loadSeoProfile, listPublishedSeoPages, type SeoPageRow, type SeoProfileContext } from "@/lib/foodos-seo-pages"

export interface PublicSeoCategory {
  id: string
  name: string
  sort_order: number
}

export interface PublicSeoItem {
  id: string
  name: string
  description: string | null
  price: number
  category_id: string | null
  image_url: string | null
  tags: string[]
}

export interface PublicSeoData {
  profile: SeoProfileContext["restaurant"]
  branches: SeoProfileContext["branches"]
  hours: SeoProfileContext["hours"]
  rating: SeoProfileContext["rating"]
  categories: PublicSeoCategory[]
  items: PublicSeoItem[]
  pages: SeoPageRow[]
}

function text(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed === "" ? null : trimmed
}

function num(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

async function fetchPublicSeoData(slug: string): Promise<PublicSeoData | null> {
  const supabase = createPublicClient()
  if (!supabase) return null

  const { data: row, error } = await supabase
    .from("foodos_restaurants")
    .select("id")
    .eq("slug", slug)
    .eq("status", "active")
    .maybeSingle()
  if (error || !row) return null

  const restaurantId = String((row as Record<string, unknown>).id ?? "")
  if (!restaurantId) return null

  const [profile, categories, items, pages] = await Promise.all([
    loadSeoProfile(supabase, restaurantId),
    supabase
      .from("foodos_menu_categories")
      .select("id, name, sort_order")
      .eq("restaurant_id", restaurantId)
      .order("sort_order"),
    supabase
      .from("foodos_menu_items")
      .select("id, name, description, price, category_id, image_url, tags, is_available, sort_order")
      .eq("restaurant_id", restaurantId)
      .eq("is_available", true)
      .order("sort_order"),
    listPublishedSeoPages(supabase, restaurantId),
  ])

  if (!profile) return null

  return {
    profile: profile.restaurant,
    branches: profile.branches,
    hours: profile.hours,
    rating: profile.rating,
    categories: ((categories.data as unknown[]) ?? []).map((entry) => {
      const c = entry as Record<string, unknown>
      return {
        id: String(c.id ?? ""),
        name: text(c.name) ?? "",
        sort_order: num(c.sort_order),
      }
    }),
    items: ((items.data as unknown[]) ?? []).map((entry) => {
      const i = entry as Record<string, unknown>
      return {
        id: String(i.id ?? ""),
        name: text(i.name) ?? "",
        description: text(i.description),
        price: num(i.price),
        category_id: text(i.category_id),
        image_url: text(i.image_url),
        tags: Array.isArray(i.tags) ? (i.tags as unknown[]).map((t) => String(t)) : [],
      }
    }),
    pages,
  }
}

export const getPublicSeoData = unstable_cache(
  fetchPublicSeoData,
  ["foodos-seo-public"],
  // Tag propio: publicar una página invalida solo el sitio IA, sin tirar el
  // caché del micrositio de pedidos (que es el camino caliente).
  { revalidate: 300, tags: ["foodos", "foodos-seo"] }
)
