// ============================================================
// Lectura pública del catering (`/r/[slug]/catering`).
//
// Usa el cliente anónimo (RLS): la política de `foodos_catering_packages`
// expone solo los paquetes activos, y las solicitudes —que llevan el teléfono
// y el correo de un comensal— no las ve nadie desde aquí.
//
// Sin cookies ni headers, así que se prerenderiza y se cachea por slug. Está
// separado de `getPublicRestaurantBySlug` a propósito: el micrositio de pedidos
// es el camino caliente y no debe pagar las consultas del catering.
// ============================================================

import { unstable_cache } from "next/cache"

import { listCateringPackages } from "@/lib/foodos-catering-data"
import type { CateringPackage } from "@/lib/foodos-catering"
import { createPublicClient } from "@/lib/supabase/public"

export interface PublicCateringRestaurant {
  id: string
  name: string
  slug: string
  currency: string
  logoUrl: string | null
  themeColor: string | null
}

export interface PublicCateringData {
  restaurant: PublicCateringRestaurant
  packages: CateringPackage[]
}

function text(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed === "" ? null : trimmed
}

async function fetchPublicCateringBySlug(slug: string): Promise<PublicCateringData | null> {
  const supabase = createPublicClient()
  if (!supabase) return null

  const { data, error } = await supabase
    .from("foodos_restaurants")
    .select("id, name, slug, currency, logo_url, theme_color")
    .eq("slug", slug)
    .eq("status", "active")
    .maybeSingle()

  if (error || !data) return null

  const row = data as Record<string, unknown>
  const id = text(row.id)
  const name = text(row.name)
  if (!id || !name) return null

  const packages = await listCateringPackages(supabase, id, { onlyActive: true })
  if (packages.length === 0) return null

  return {
    restaurant: {
      id,
      name,
      slug,
      currency: text(row.currency) ?? "MXN",
      logoUrl: text(row.logo_url),
      themeColor: text(row.theme_color),
    },
    packages,
  }
}

/**
 * `null` cuando el restaurante no existe, no está activo o no tiene paquetes
 * activos. El micrositio usa ese `null` para no ofrecer un enlace que llevaría
 * a una página vacía.
 */
export const getPublicCateringBySlug = unstable_cache(
  fetchPublicCateringBySlug,
  ["foodos-catering-public"],
  { revalidate: 300, tags: ["foodos", "foodos-catering"] }
)
