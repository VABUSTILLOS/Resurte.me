// ============================================================
// Multi-catálogo WhatsApp de la plataforma: helpers de orden,
// secciones product_list y resolución de credenciales por
// catálogo (propias o WABA plataforma por defecto).
// ============================================================

import type { SupabaseClient } from "@supabase/supabase-js"
import type { CatalogProductInfo, WhatsAppConfig, WhatsAppProduct } from "@/lib/whatsapp"
import { parseMetaPriceToMajor } from "@/lib/whatsapp"
import { decryptToken } from "@/lib/foodos-whatsapp"

export interface WaCatalog {
  id: string
  slug: string
  name: string
  city_id: number | null
  phone_number_id: string | null
  waba_id: string | null
  catalog_id: string | null
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

/** Mapea un producto admin a producto WhatsApp (null si precio inválido). */
export function toWhatsAppProduct(
  p: AdminProduct & { stock_status?: string | null }
): WhatsAppProduct | null {
  const price = p.sale_price ?? p.price ?? 0
  if (price <= 0) return null
  return {
    id: String(p.id),
    name: p.name,
    description: [p.brand, p.unit].filter(Boolean).join(" · ") || undefined,
    image_url: p.image_url ?? undefined,
    price,
    currency: "MXN",
    sale_price: p.sale_price ?? null,
    availability: p.stock_status === "out_of_stock" ? "out of stock" : "in stock",
  }
}

export interface InvalidCatalogProduct {
  id: string
  name: string
  reasons: string[]
}

/** Límites de Meta Commerce para items de catálogo. */
export const META_NAME_MAX = 150
export const META_DESCRIPTION_MAX = 5000

/**
 * Validación previa al sync (WA7): separa productos aptos de los que Meta
 * rechazaría, con motivos legibles para listarlos en el admin.
 */
export function validateCatalogProducts(products: WhatsAppProduct[]): {
  valid: WhatsAppProduct[]
  invalid: InvalidCatalogProduct[]
} {
  const valid: WhatsAppProduct[] = []
  const invalid: InvalidCatalogProduct[] = []
  for (const p of products) {
    const reasons: string[] = []
    if (!p.name.trim()) reasons.push("nombre vacío")
    if (p.name.length > META_NAME_MAX) reasons.push(`nombre > ${META_NAME_MAX} caracteres`)
    if (p.price <= 0) reasons.push("precio debe ser mayor a 0")
    if (p.description && p.description.length > META_DESCRIPTION_MAX) {
      reasons.push(`descripción > ${META_DESCRIPTION_MAX} caracteres`)
    }
    if (p.image_url && !p.image_url.startsWith("https://")) {
      reasons.push("imagen debe ser una URL pública https")
    }
    if (reasons.length > 0) {
      invalid.push({ id: p.id, name: p.name || p.id, reasons })
    } else {
      valid.push(p)
    }
  }
  return { valid, invalid }
}

export interface WaCatalogSyncDiff {
  /** retailer_ids en la tienda pero no en Meta (se crearán). */
  toCreate: string[]
  /** retailer_ids en ambos lados (se actualizarán). */
  toUpdate: string[]
  /** retailer_ids en Meta pero no en la tienda (NO se borran sin confirmación). */
  stale: string[]
}

/**
 * Diff puro entre la curaduría deseada y el catálogo actual de Meta.
 * Base del sync seguro (WA2) y de la previsualización en el admin (WA6).
 */
export function buildCatalogSyncDiff(
  desired: WhatsAppProduct[],
  metaProducts: { retailer_id: string }[]
): WaCatalogSyncDiff {
  const metaIds = new Set(metaProducts.map((p) => p.retailer_id).filter(Boolean))
  const desiredIds = new Set(desired.map((p) => p.id))
  return {
    toCreate: desired.filter((p) => !metaIds.has(p.id)).map((p) => p.id),
    toUpdate: desired.filter((p) => metaIds.has(p.id)).map((p) => p.id),
    stale: [...metaIds].filter((id) => !desiredIds.has(id)),
  }
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
    .select("id, slug, name, city_id, phone_number_id, waba_id, catalog_id, access_token_enc, is_active")
    .eq("id", catalogId)
    .maybeSingle()
  if (!catalog) return { config: null, catalog: null }

  const cat = catalog as WaCatalog & { access_token_enc: string | null }
  const catalogIdMeta = cat.catalog_id ?? undefined
  if (cat.phone_number_id && cat.waba_id && cat.access_token_enc) {
    return {
      catalog: cat,
      config: {
        accessToken: decryptToken(cat.access_token_enc),
        phoneNumberId: cat.phone_number_id,
        wabaId: cat.waba_id,
        catalogId: catalogIdMeta,
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
      catalogId: catalogIdMeta,
    },
  }
}

// ============================================================
// WD2 — Comparador tienda vs Meta (explorador del catálogo)
// ============================================================

export type MetaStoreMatchStatus =
  | "match"
  | "price_diff"
  | "sale_price_diff"
  | "image_missing_meta"
  | "only_meta"
  | "only_store"

export interface MetaStoreComparison {
  retailer_id: string
  status: MetaStoreMatchStatus
  metaPrice: number | null
  storePrice: number | null
  metaSalePrice: number | null
  storeSalePrice: number | null
  metaImageUrl: string | null
  storeImageUrl: string | null
  metaAvailability: string | null
  metaReviewStatus: string | null
}

/** ¿Mismo precio? Tolerancia de 1 centavo por redondeos de centavos. */
function samePrice(a: number | null, b: number | null): boolean {
  if (a == null && b == null) return true
  if (a == null || b == null) return false
  return Math.abs(a - b) < 0.011
}

/**
 * Cruza el catálogo vivo de Meta con los productos de la tienda.
 * Prioridad de estado: only_* > price_diff > sale_price_diff >
 * image_missing_meta > match.
 */
export function compareMetaVsStore(
  meta: CatalogProductInfo[],
  store: WhatsAppProduct[]
): MetaStoreComparison[] {
  const storeById = new Map(store.map((p) => [p.id, p]))
  const metaById = new Map(meta.filter((p) => p.retailer_id).map((p) => [p.retailer_id, p]))
  const result: MetaStoreComparison[] = []

  for (const [retailerId, mp] of metaById) {
    const sp = storeById.get(retailerId)
    const base: MetaStoreComparison = {
      retailer_id: retailerId,
      status: "match",
      metaPrice: parseMetaPriceToMajor(mp.price),
      storePrice: sp?.price ?? null,
      metaSalePrice: parseMetaPriceToMajor(mp.sale_price),
      storeSalePrice: sp?.sale_price ?? null,
      metaImageUrl: mp.image_url ?? null,
      storeImageUrl: sp?.image_url ?? null,
      metaAvailability: mp.availability ?? null,
      metaReviewStatus: mp.review_status ?? null,
    }
    if (!sp) {
      result.push({ ...base, status: "only_meta" })
      continue
    }
    if (!samePrice(base.metaPrice, base.storePrice)) {
      result.push({ ...base, status: "price_diff" })
      continue
    }
    if (!samePrice(base.metaSalePrice, base.storeSalePrice)) {
      result.push({ ...base, status: "sale_price_diff" })
      continue
    }
    if (base.storeImageUrl && !base.metaImageUrl) {
      result.push({ ...base, status: "image_missing_meta" })
      continue
    }
    result.push(base)
  }

  for (const [retailerId, sp] of storeById) {
    if (metaById.has(retailerId)) continue
    result.push({
      retailer_id: retailerId,
      status: "only_store",
      metaPrice: null,
      storePrice: sp.price,
      metaSalePrice: null,
      storeSalePrice: sp.sale_price ?? null,
      metaImageUrl: null,
      storeImageUrl: sp.image_url ?? null,
      metaAvailability: null,
      metaReviewStatus: null,
    })
  }

  return result
}

// ============================================================
// WE3 — Salud del catálogo (score + issues por severidad)
// ============================================================

export type CatalogIssueSeverity = "alta" | "media" | "info"

export interface CatalogHealthIssue {
  retailer_id: string
  kind: MetaStoreMatchStatus
  severity: CatalogIssueSeverity
}

export interface CatalogHealth {
  /** 0–100: % de ítems sanos (match) sobre el total comparado. */
  score: number
  total: number
  healthy: number
  issues: CatalogHealthIssue[]
}

const ISSUE_SEVERITY: Record<Exclude<MetaStoreMatchStatus, "match">, CatalogIssueSeverity> = {
  price_diff: "alta",
  sale_price_diff: "alta",
  image_missing_meta: "media",
  only_store: "media",
  only_meta: "info",
}

/** Severidad de un estado de comparación (pure). */
export function issueSeverity(status: MetaStoreMatchStatus): CatalogIssueSeverity | null {
  return status === "match" ? null : ISSUE_SEVERITY[status]
}

/** Salud del catálogo a partir de la comparación tienda vs Meta (pure). */
export function computeCatalogHealth(comparison: MetaStoreComparison[]): CatalogHealth {
  const issues: CatalogHealthIssue[] = []
  let healthy = 0
  for (const row of comparison) {
    const severity = issueSeverity(row.status)
    if (severity === null) {
      healthy++
    } else {
      issues.push({ retailer_id: row.retailer_id, kind: row.status, severity })
    }
  }
  const total = comparison.length
  return {
    score: total === 0 ? 100 : Math.round((healthy / total) * 100),
    total,
    healthy,
    issues,
  }
}
