/**
 * Reglas puras de la edición masiva de productos
 * (`POST /api/admin/products/bulk`).
 *
 * Viven aquí y no en el `route.ts` porque Next.js solo admite exports de
 * handler en un archivo de ruta, y porque así se pueden probar sin levantar
 * el endpoint.
 */

import type { ProductPatch, ProductUpdateField } from "@/lib/product-patch"

/** Tope de ids por llamada: acota el trabajo de una petición y el tamaño del
 *  payload. El panel trocea por encima de esto. */
export const MAX_BULK_IDS = 2000

/** Ids por sentencia UPDATE. El filtro `id=in.(...)` viaja en la URL, así que
 *  el trozo debe quedar muy por debajo del límite de longitud. */
export const BULK_CHUNK = 200

/**
 * Campos aceptados en lote. Es un subconjunto estricto de los de `update`
 * (misma validación por campo, vía `validateProductPatch`): se excluyen los
 * que no tiene sentido forzar a muchos productos a la vez.
 *
 * - `name`, `sku`, `barcode`: valores únicos — un mismo valor para N productos
 *   chocaría con los índices de unicidad o los volvería indistinguibles.
 * - `related_product_ids`: la lista incluiría los propios ids del lote.
 * - `publish_at` / `unpublish_at`: programar N productos para el mismo instante
 *   es una acción de catálogo, no de edición masiva; se hace producto a producto.
 */
export const BULK_FIELDS = [
  "price",
  "sale_price",
  "sale_starts_at",
  "sale_ends_at",
  "stock_status",
  "stock_quantity",
  "low_stock_threshold",
  "is_visible",
  "show_in_whatsapp",
  "category_id",
  "unit",
  "tags",
  "cost",
  "seo_title",
  "seo_description",
  "image_url",
  "images",
  "brand",
  "description",
  "admin_note",
] as const satisfies readonly ProductUpdateField[]

export interface BulkFailure {
  id: number
  reason: string
}

/** Ids válidos (enteros > 0) sin repetir, o el motivo del rechazo. */
export function normalizeBulkIds(
  raw: unknown
): { ok: true; ids: number[] } | { ok: false; error: string } {
  if (!Array.isArray(raw)) return { ok: false, error: "ids debe ser un arreglo" }
  if (raw.length === 0) return { ok: false, error: "ids no puede estar vacío" }
  const seen = new Set<number>()
  for (const value of raw) {
    if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
      return { ok: false, error: "cada id debe ser un entero positivo" }
    }
    seen.add(value)
  }
  if (seen.size > MAX_BULK_IDS) {
    return { ok: false, error: `máximo ${MAX_BULK_IDS} productos por llamada` }
  }
  return { ok: true, ids: [...seen] }
}

/** Campos del patch fuera de la whitelist de lote. */
export function rejectedBulkFields(patch: Record<string, unknown>): string[] {
  const allowed = new Set<string>(BULK_FIELDS)
  return Object.keys(patch).filter((field) => !allowed.has(field))
}

export function chunkList<T>(items: T[], size: number = BULK_CHUNK): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

/**
 * Agrupa ids por parche idéntico. La mayoría de las acciones de lote producen
 * un parche único (1 grupo → 1 sentencia por trozo), pero derivar
 * `stock_status` desde `stock_quantity` genera hasta 3 grupos y así cada uno
 * sigue resolviéndose con un solo UPDATE.
 */
export function groupByPatch(
  ids: number[],
  patchById: Map<number, ProductPatch>
): Map<string, { patch: ProductPatch; ids: number[] }> {
  const groups = new Map<string, { patch: ProductPatch; ids: number[] }>()
  for (const id of ids) {
    const patch = patchById.get(id)
    if (!patch) continue
    const key = JSON.stringify(patch)
    const group = groups.get(key)
    if (group) group.ids.push(id)
    else groups.set(key, { patch, ids: [id] })
  }
  return groups
}
