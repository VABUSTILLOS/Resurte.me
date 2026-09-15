// ============================================================
// Multi-catálogo WhatsApp de la plataforma: helpers de orden,
// secciones product_list y resolución de credenciales por
// catálogo (propias o WABA plataforma por defecto).
// ============================================================

import type { SupabaseClient } from "@supabase/supabase-js"
import type { WhatsAppConfig, WhatsAppProduct } from "@/lib/whatsapp"
import { decryptToken } from "@/lib/foodos-whatsapp"

export interface WaCatalog {
  id: string
  slug: string
  name: string
  city_id: number | null
  phone_number_id: string | null
  waba_id: string | null
  is_active: boolean
}

export interface WaCatalogItemRow {
  catalog_id: string
  product_id: number
  position: number
  is_visible: boolean
}

export interface AdminProduct {
  id: number
  name: string
  brand: string | null
  category_id: number | null
  category_name?: string | null
  image_url: string | null
  price: number | null
  sale_price: number | null
  unit: string | null
}

/** Ordena la curaduría: visibles por posición, luego por nombre. */
export function orderCatalogItems<T extends { position: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.position - b.position)
}

/** Mapea la curaduría (items visibles ordenados) a productos de WhatsApp. */
export function buildAdminCatalogProducts(
  curated: WaCatalogItemRow[],
  products: AdminProduct[]
): WhatsAppProduct[] {
  const byId = new Map(products.map((p) => [p.id, p]))
  const result: WhatsAppProduct[] = []
  for (const item of orderCatalogItems(curated.filter((i) => i.is_visible))) {
    const p = byId.get(item.product_id)
    if (!p) continue
    const price = p.sale_price ?? p.price ?? 0
    if (price <= 0) continue
    result.push({
      id: String(p.id),
      name: p.name,
      description: [p.brand, p.unit].filter(Boolean).join(" · ") || undefined,
      image_url: p.image_url ?? undefined,
      price,
      currency: "MXN",
      sale_price: p.sale_price ?? null,
    })
  }
  return result
}

export interface AdminProductListSection {
  title: string
  product_items: { product_retailer_id: string }[]
}

/**
 * Secciones product_list agrupadas por categoría (máx 30 ítems), con el
 * ORDEN EXACTO de la curaduría del admin.
 */
export function buildAdminProductListSections(
  curated: WaCatalogItemRow[],
  products: AdminProduct[]
): AdminProductListSection[] {
  const byId = new Map(products.map((p) => [p.id, p]))
  const byCat = new Map<string, { product_retailer_id: string }[]>()
  let count = 0
  for (const item of orderCatalogItems(curated.filter((i) => i.is_visible))) {
    if (count >= 30) break
    const p = byId.get(item.product_id)
    if (!p) continue
    count++
    const title = p.category_name ?? "Catálogo"
    const list = byCat.get(title) ?? []
    list.push({ product_retailer_id: String(p.id) })
    byCat.set(title, list)
  }
  return [...byCat.entries()].map(([title, product_items]) => ({
    title: title.slice(0, 24),
    product_items,
  }))
}

/**
 * Credenciales WhatsApp del catálogo: propias si las tiene (descifradas),
 * o la WABA de la plataforma (env) como fallback.
 */
export async function getCatalogWhatsAppConfig(
  supabase: SupabaseClient,
  catalogId: string
): Promise<{ config: WhatsAppConfig | null; catalog: WaCatalog | null }> {
  const { data: catalog } = await supabase
    .from("whatsapp_catalogs")
    .select("id, slug, name, city_id, phone_number_id, waba_id, access_token_enc, is_active")
    .eq("id", catalogId)
    .maybeSingle()
  if (!catalog) return { config: null, catalog: null }

  const cat = catalog as WaCatalog & { access_token_enc: string | null }
  if (cat.phone_number_id && cat.waba_id && cat.access_token_enc) {
    return {
      catalog: cat,
      config: {
        accessToken: decryptToken(cat.access_token_enc),
        phoneNumberId: cat.phone_number_id,
        wabaId: cat.waba_id,
      },
    }
  }

  // Fallback: WABA de la plataforma (env)
  const platformToken = process.env.WHATSAPP_ACCESS_TOKEN || ""
  const platformPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID || ""
  const platformWaba = process.env.WHATSAPP_WABA_ID || ""
  if (!platformToken || !platformPhoneId || !platformWaba) {
    return { config: null, catalog: cat }
  }
  return {
    catalog: cat,
    config: {
      accessToken: platformToken,
      phoneNumberId: platformPhoneId,
      wabaId: platformWaba,
    },
  }
}
