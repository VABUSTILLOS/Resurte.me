/**
 * Whitelist y validación de campos de producto, compartidos por
 * `PATCH /api/admin/products/update` (un producto) y
 * `POST /api/admin/products/bulk` (lote).
 *
 * Vive aquí para que la lista de campos aceptados y sus reglas de tipo sean
 * una sola fuente: antes el lote reenviaba N peticiones al endpoint de uno
 * solo, precisamente para no duplicar estas reglas.
 */

import { validateBarcode, validateSku } from "@/lib/sku"
import { isStockStatus } from "@/lib/stock"

/**
 * Campos que se guardan en la bitácora para el diff antes/después.
 * Nota: `related_product_ids` se audita desde la ronda 8 (faltaba).
 */
export const PRODUCT_AUDIT_FIELDS = [
  "price",
  "sale_price",
  "sale_starts_at",
  "sale_ends_at",
  "stock_status",
  "stock_quantity",
  "low_stock_threshold",
  "is_visible",
  "show_in_whatsapp",
  "name",
  "brand",
  "category_id",
  "sku",
  "barcode",
  "tags",
  "cost",
  "image_url",
  "seo_title",
  "seo_description",
  "related_product_ids",
] as const

/**
 * Campos actualizables. Nota: el slug NO está — regenerarlo al renombrar
 * rompería URLs ya indexadas/compartidas.
 */
export const PRODUCT_UPDATE_FIELDS = [
  "price",
  "sale_price",
  "stock_status",
  "is_visible",
  "show_in_whatsapp",
  "image_url",
  "name",
  "brand",
  "category_id",
  "description",
  "unit",
  "publish_at",
  "unpublish_at",
  "admin_note",
  "images",
  "stock_quantity",
  "cost",
  "seo_title",
  "seo_description",
  "sku",
  "barcode",
  "tags",
  "sale_starts_at",
  "sale_ends_at",
  "low_stock_threshold",
  "related_product_ids",
] as const

export type ProductUpdateField = (typeof PRODUCT_UPDATE_FIELDS)[number]

export type ProductPatch = Partial<Record<ProductUpdateField, unknown>>

export type PatchValidation =
  | { ok: true; updates: ProductPatch }
  | { ok: false; error: string; field?: string }

/** Máximo de productos relacionados por producto (migración 00109). */
const MAX_RELATED = 12
/** Máximo de etiquetas por producto. */
const MAX_TAGS = 20

/**
 * Valida y normaliza un patch de producto. Es puramente funcional: no toca la
 * base de datos, así que el lote puede validar cada id antes de agrupar
 * escrituras.
 *
 * `productId` hace falta para `related_product_ids` (un producto no puede
 * relacionarse consigo mismo).
 */
export function validateProductPatch(
  fields: Record<string, unknown>,
  opts: { productId: number }
): PatchValidation {
  const updates: ProductPatch = {}
  for (const field of PRODUCT_UPDATE_FIELDS) {
    if (field in fields) updates[field] = fields[field]
  }

  if ("name" in updates) {
    if (typeof updates.name !== "string" || !updates.name.trim()) {
      return { ok: false, error: "name no puede estar vacío", field: "name" }
    }
    updates.name = updates.name.trim()
  }
  if ("brand" in updates && updates.brand !== null && typeof updates.brand !== "string") {
    return { ok: false, error: "brand debe ser texto o null", field: "brand" }
  }
  if (
    "description" in updates &&
    updates.description !== null &&
    typeof updates.description !== "string"
  ) {
    return { ok: false, error: "description debe ser texto o null", field: "description" }
  }
  if ("unit" in updates && updates.unit !== null && typeof updates.unit !== "string") {
    return { ok: false, error: "unit debe ser texto o null", field: "unit" }
  }
  // publish_at / unpublish_at / ventana de oferta: ISO 8601 válido o null.
  for (const field of ["publish_at", "unpublish_at", "sale_starts_at", "sale_ends_at"] as const) {
    if (field in updates) {
      const v = updates[field]
      if (v !== null && (typeof v !== "string" || Number.isNaN(new Date(v).getTime()))) {
        return { ok: false, error: `${field} debe ser una fecha ISO válida o null`, field }
      }
    }
  }
  // Publicar/despublicar manual cancela la programación pendiente, salvo que la
  // misma petición fije una nueva fecha (p. ej. pausa temporal).
  if ("is_visible" in updates && !("publish_at" in updates) && !("unpublish_at" in updates)) {
    updates.publish_at = null
    updates.unpublish_at = null
  }
  if (
    "admin_note" in updates &&
    updates.admin_note !== null &&
    typeof updates.admin_note !== "string"
  ) {
    return { ok: false, error: "admin_note debe ser texto o null", field: "admin_note" }
  }
  // images: galería de URLs https públicas o rutas locales.
  if ("images" in updates) {
    const imgs = updates.images
    if (
      !Array.isArray(imgs) ||
      imgs.some((u) => typeof u !== "string" || (!u.startsWith("https://") && !u.startsWith("/")))
    ) {
      return { ok: false, error: "images debe ser un arreglo de URLs https o rutas locales", field: "images" }
    }
  }
  // Precios: número finito ≥ 0 o null (la oferta vencida no se borra: se filtra
  // al leer con resolveSalePrice, así el admin ve lo que programó).
  for (const field of ["price", "sale_price"] as const) {
    if (field in updates) {
      const v = updates[field]
      if (v !== null && (typeof v !== "number" || !Number.isFinite(v) || v < 0)) {
        return { ok: false, error: `${field} debe ser un número ≥ 0 o null`, field }
      }
    }
  }
  // SKU / código de barras (migración 00106).
  if ("sku" in updates) {
    const res = validateSku(updates.sku)
    if (!res.ok) return { ok: false, error: res.error, field: "sku" }
    updates.sku = res.value
  }
  if ("barcode" in updates) {
    const res = validateBarcode(updates.barcode)
    if (!res.ok) return { ok: false, error: res.error, field: "barcode" }
    updates.barcode = res.value
  }
  // tags: arreglo de etiquetas normalizadas (colecciones de la tienda).
  if ("tags" in updates) {
    const raw = updates.tags
    if (raw !== null && !Array.isArray(raw)) {
      return { ok: false, error: "tags debe ser un arreglo de etiquetas o null", field: "tags" }
    }
    if (raw === null) {
      updates.tags = []
    } else {
      const seen = new Set<string>()
      for (const t of raw as unknown[]) {
        if (typeof t !== "string") {
          return { ok: false, error: "cada etiqueta debe ser texto", field: "tags" }
        }
        const clean = t.trim().toLowerCase()
        if (!clean) continue
        if (clean.length > 40) {
          return { ok: false, error: "cada etiqueta admite hasta 40 caracteres", field: "tags" }
        }
        seen.add(clean)
      }
      if (seen.size > MAX_TAGS) {
        return { ok: false, error: `máximo ${MAX_TAGS} etiquetas por producto`, field: "tags" }
      }
      updates.tags = [...seen]
    }
  }
  // Umbral de stock bajo (migración 00108).
  if ("low_stock_threshold" in updates) {
    const v = updates.low_stock_threshold
    if (v !== null && (typeof v !== "number" || !Number.isInteger(v) || v < 0)) {
      return { ok: false, error: "low_stock_threshold debe ser un entero ≥ 0 o null", field: "low_stock_threshold" }
    }
  }
  // Productos relacionados (migración 00109): ids enteros, sin el propio.
  if ("related_product_ids" in updates) {
    const raw = updates.related_product_ids
    if (raw !== null && !Array.isArray(raw)) {
      return { ok: false, error: "related_product_ids debe ser un arreglo de ids o null", field: "related_product_ids" }
    }
    if (raw === null) {
      updates.related_product_ids = []
    } else {
      const ids: number[] = []
      for (const v of raw as unknown[]) {
        if (typeof v !== "number" || !Number.isInteger(v)) {
          return { ok: false, error: "cada producto relacionado debe ser un id entero", field: "related_product_ids" }
        }
        if (v !== opts.productId && !ids.includes(v)) ids.push(v)
      }
      if (ids.length > MAX_RELATED) {
        return { ok: false, error: `máximo ${MAX_RELATED} productos relacionados`, field: "related_product_ids" }
      }
      updates.related_product_ids = ids
    }
  }
  if ("stock_status" in updates && !isStockStatus(updates.stock_status)) {
    return { ok: false, error: "stock_status inválido", field: "stock_status" }
  }
  if ("stock_quantity" in updates) {
    const q = updates.stock_quantity
    if (q !== null && (typeof q !== "number" || !Number.isInteger(q) || q < 0)) {
      return { ok: false, error: "stock_quantity debe ser un entero ≥ 0 o null", field: "stock_quantity" }
    }
  }
  if ("cost" in updates) {
    const c = updates.cost
    if (c !== null && (typeof c !== "number" || !Number.isFinite(c) || c < 0)) {
      return { ok: false, error: "cost debe ser un número ≥ 0 o null", field: "cost" }
    }
  }
  for (const field of ["seo_title", "seo_description"] as const) {
    if (field in updates && updates[field] !== null && typeof updates[field] !== "string") {
      return { ok: false, error: `${field} debe ser texto o null`, field }
    }
  }
  if ("category_id" in updates) {
    const cid = updates.category_id
    if (cid !== null && (typeof cid !== "number" || !Number.isInteger(cid))) {
      return { ok: false, error: "category_id debe ser un entero o null", field: "category_id" }
    }
  }
  // image_url: URL https pública, ruta local del sitio, o null para quitarla.
  if ("image_url" in updates) {
    const url = updates.image_url
    if (
      url !== null &&
      (typeof url !== "string" || (!url.startsWith("https://") && !url.startsWith("/")))
    ) {
      return { ok: false, error: "image_url debe ser una URL https, una ruta local o null", field: "image_url" }
    }
  }

  return { ok: true, updates }
}
