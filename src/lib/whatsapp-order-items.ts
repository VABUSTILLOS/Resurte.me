// ============================================================
// Pedidos de WhatsApp: resolución retailer_id → producto
// ============================================================
// Un mensaje de pedido del catálogo de WhatsApp (type "order") trae
// `product_items[]` con el `product_retailer_id` de Meta, NO con el
// id de la tienda. Este módulo traduce esos ids a líneas de pedido
// listas para insertar, con el precio SIEMPRE recalculado contra la
// base de datos (el `item_price` que manda Meta es el precio del
// catálogo al momento del pedido y no es de confiar: misma
// invariante que el checkout web en POST /api/orders).
//
// Conviven DOS esquemas de retailer_id (ver plan-pedidos.md §3):
// 1. Feed CSV (el catálogo vivo "Resurte.me"): el id fijo de
//    `meta-feed-map.json` indexado por slug —118 de 268 se derivaron
//    del nombre VIEJO del producto, así que NO se puede invertir
//    parseando el id— o, para productos nuevos, slugify(categoría)
//    + "-" + slug. El índice se construye con las MISMAS funciones
//    de src/lib/meta-feed.ts que generan el feed publicado, sobre
//    la misma capa cacheada, así que nunca discrepa del feed.
// 2. Sync items_batch de la curaduría del admin (/admin/whatsapp):
//    retailer_id = String(products.id), puramente numérico.
//
// Los productos que Meta conserva pero la tienda ya no publica
// (los 7 de frutas y verduras sin página: el feed tiene el borrado
// deshabilitado) no están en el índice y NO resuelven: el llamador
// los tolera nombrándolos como no agregados.
//
// Módulo puro, sin I/O: toda la lectura de datos ocurre en
// src/lib/whatsapp-orders.ts.

import { metaFeedIdForNew, metaFeedMapEntry, metaFeedVariantId } from "@/lib/meta-feed"
import { activeVariantsOf, groupVariantsByProduct } from "@/lib/product-variants"
import type { Category, Product, ProductVariant } from "@/types"

/** Un ítem tal como llega en `order.product_items[]` de Meta. */
export interface MetaOrderProductItem {
  product_retailer_id: string
  quantity: number
  /** Precio del catálogo al momento del pedido. NUNCA se cobra. */
  item_price?: number
  currency?: string
}

/**
 * Fila de `products` leída fresca de la BD para un pedido: es la
 * fuente de verdad de precio y existencia (espejo de la lectura que
 * hace POST /api/orders).
 */
export interface OrderDbProduct {
  id: number
  price: number
  sale_price: number | null
  stock_status: string
  stock_quantity: number | null
}

/**
 * Fila de `product_variants` leída fresca de la BD para un pedido:
 * fuente de verdad de precio y existencia DE LA PRESENTACIÓN
 * (00232). Sin ella, una variante se cobraría al precio del padre.
 */
export interface OrderDbVariant {
  id: number
  product_id: number
  name: string
  price: number
  sale_price: number | null
  stock_status: string
  stock_quantity: number | null
  is_active: boolean
}

/** Línea de pedido lista para insertar en `order_items`. */
export interface ResolvedOrderLine {
  product_id: number
  /** Nombre vigente del producto (para respuestas y bitácora). */
  name: string
  quantity: number
  /** Precio efectivo de la BD (`sale_price ?? price`), nunca el de Meta. */
  unit_price: number
  /** Presentación comprada (00232); null = línea sin presentación. */
  variant_id: number | null
  /** Nombre de la presentación, en foto para `order_items`. */
  variant_name: string | null
}

export type UnresolvedReason =
  /** El retailer_id no corresponde a ningún producto visible de la tienda. */
  | "unknown"
  /** El producto existe pero está agotado (`out_of_stock` en BD). */
  | "out_of_stock"
  /** Cantidad no entera o menor a 1 tras saneamiento. */
  | "invalid_quantity"
  /** Resolvió en el índice pero no apareció en la lectura fresca de BD. */
  | "missing_in_db"
  /**
   * Es el artículo BASE de un producto que se vende por
   * presentación (00232): en el feed sale agotado a propósito, así
   * que esto solo llega si Meta conserva una copia vieja. El
   * cliente debe elegir la presentación en el catálogo.
   */
  | "variant_required"

export interface UnresolvedOrderItem {
  retailer_id: string
  /** Nombre si el índice lo conocía; null si ni siquiera resolvió. */
  name: string | null
  reason: UnresolvedReason
}

export interface ResolvedOrderItems {
  lines: ResolvedOrderLine[]
  unresolved: UnresolvedOrderItem[]
  /** Σ unit_price × quantity de las líneas resueltas, con precios de BD. */
  subtotal: number
}

/**
 * Índice retailer_id → producto, construido con la misma regla que
 * publica el feed (src/lib/meta-feed.ts): primero los ids fijos del
 * mapa (ganan siempre, como en el feed) y después los ids derivados
 * por slug para los productos sin entrada, sin pisar un id del mapa.
 */
export interface RetailerIdIndex {
  byRetailerId: Map<string, Product>
  byNumericId: Map<number, Product>
  /**
   * retailer_id de presentación → producto + variante (00232).
   * La llave es la MISMA que emite el feed (`metaFeedVariantId`):
   * si divergieran, el catálogo vendería artículos que la tienda
   * no sabe convertir. Un id de variante jamás pisa el de un
   * producto: los ids de producto ganan, como en el feed.
   */
  byVariantRetailerId: Map<string, { product: Product; variant: ProductVariant }>
  /** Productos que se venden por presentación (≥1 variante activa). */
  productIdsWithVariants: Set<number>
}

export function buildRetailerIdIndex(
  products: readonly Product[],
  categories: readonly Category[],
  variants: readonly ProductVariant[] = []
): RetailerIdIndex {
  const categoryNameById = new Map(categories.map((c) => [c.id, c.name]))
  const byRetailerId = new Map<string, Product>()
  const byNumericId = new Map<number, Product>()
  const feedIdByProduct = new Map<number, string>()

  for (const product of products) {
    byNumericId.set(product.id, product)
    const entry = metaFeedMapEntry(product.slug)
    if (entry) {
      byRetailerId.set(entry.id, product)
      feedIdByProduct.set(product.id, entry.id)
    }
  }
  for (const product of products) {
    if (metaFeedMapEntry(product.slug)) continue
    const categoryName = categoryNameById.get(product.category_id)
    if (!categoryName) continue
    const derivedId = metaFeedIdForNew(categoryName, product.slug)
    if (!byRetailerId.has(derivedId)) byRetailerId.set(derivedId, product)
    if (!feedIdByProduct.has(product.id)) feedIdByProduct.set(product.id, derivedId)
  }

  const byVariantRetailerId = new Map<string, { product: Product; variant: ProductVariant }>()
  const productIdsWithVariants = new Set<number>()
  const variantsByProduct = groupVariantsByProduct(variants)
  for (const product of products) {
    const feedId = feedIdByProduct.get(product.id)
    if (!feedId) continue
    for (const variant of activeVariantsOf(variantsByProduct.get(product.id) ?? [], product.id)) {
      productIdsWithVariants.add(product.id)
      const key = metaFeedVariantId(feedId, variant.slug)
      if (byRetailerId.has(key) || byVariantRetailerId.has(key)) continue
      byVariantRetailerId.set(key, { product, variant })
    }
  }

  return { byRetailerId, byNumericId, byVariantRetailerId, productIdsWithVariants }
}

/**
 * Resuelve UN retailer_id: todo dígitos → esquema numérico del
 * admin (`products.id` directo); si no, el índice del feed.
 */
export function resolveRetailerId(
  index: RetailerIdIndex,
  retailerId: string
): Product | undefined {
  const trimmed = retailerId.trim()
  if (/^\d+$/.test(trimmed)) {
    return index.byNumericId.get(Number(trimmed))
  }
  return index.byRetailerId.get(trimmed)
}

/** Resuelve un retailer_id de PRESENTACIÓN (00232), si lo es. */
export function resolveRetailerVariant(
  index: RetailerIdIndex,
  retailerId: string
): { product: Product; variant: ProductVariant } | undefined {
  return index.byVariantRetailerId.get(retailerId.trim())
}

const MIN_QUANTITY = 1
const MAX_QUANTITY = 99

/**
 * Traduce los `product_items` de Meta a líneas de pedido.
 *
 * Reglas (espejo del checkout web):
 * - La cantidad se sanea a entero; > 99 se topa a 99 (el rango que
 *   acepta POST /api/orders); < 1 o no numérica → no resuelve.
 * - Líneas repetidas del mismo producto se fusionan sumando
 *   cantidades (con el mismo tope), como el checkout agrupa por
 *   producto para validar existencia.
 * - Producto agotado en BD → no resuelve (motivo `out_of_stock`).
 * - El precio cobrado es el de la BD, jamás `item_price` de Meta.
 * - Presentaciones (00232): el retailer_id de una variante resuelve
 *   a ESA variante, con su precio y su existencia de la BD; dos
 *   variantes del mismo producto son dos líneas. El artículo base
 *   de un producto con variantes no resuelve (`variant_required`):
 *   en el feed sale agotado a propósito.
 */
export function resolveOrderItems(
  productItems: readonly MetaOrderProductItem[],
  index: RetailerIdIndex,
  dbProducts: ReadonlyMap<number, OrderDbProduct>,
  dbVariants: ReadonlyMap<number, OrderDbVariant> = new Map()
): ResolvedOrderItems {
  const unresolved: UnresolvedOrderItem[] = []
  const lineByKey = new Map<string, ResolvedOrderLine>()

  const mergeLine = (key: string, line: ResolvedOrderLine) => {
    const existing = lineByKey.get(key)
    if (existing) {
      existing.quantity = Math.min(MAX_QUANTITY, existing.quantity + line.quantity)
    } else {
      lineByKey.set(key, line)
    }
  }

  for (const item of productItems) {
    const retailerId = String(item.product_retailer_id ?? "")

    const rawQty = Number(item.quantity)
    const quantityValid = Number.isFinite(rawQty) && Math.floor(rawQty) >= MIN_QUANTITY
    const quantity = quantityValid ? Math.min(MAX_QUANTITY, Math.floor(rawQty)) : 0

    // ── Presentación (00232) ──────────────────────────────────
    const variantHit = resolveRetailerVariant(index, retailerId)
    if (variantHit) {
      const { product, variant } = variantHit
      const displayName = `${product.name} — ${variant.name}`
      if (!quantityValid) {
        unresolved.push({ retailer_id: retailerId, name: displayName, reason: "invalid_quantity" })
        continue
      }
      const dbVariant = dbVariants.get(variant.id)
      if (!dbVariant) {
        unresolved.push({ retailer_id: retailerId, name: displayName, reason: "missing_in_db" })
        continue
      }
      if (!dbVariant.is_active || dbVariant.stock_status === "out_of_stock") {
        unresolved.push({ retailer_id: retailerId, name: displayName, reason: "out_of_stock" })
        continue
      }
      mergeLine(`v:${variant.id}`, {
        product_id: product.id,
        name: product.name,
        quantity,
        unit_price: dbVariant.sale_price ?? dbVariant.price,
        variant_id: variant.id,
        variant_name: dbVariant.name,
      })
      continue
    }

    // ── Producto (como siempre) ───────────────────────────────
    const product = resolveRetailerId(index, retailerId)
    if (!product) {
      unresolved.push({ retailer_id: retailerId, name: null, reason: "unknown" })
      continue
    }

    if (!quantityValid) {
      unresolved.push({ retailer_id: retailerId, name: product.name, reason: "invalid_quantity" })
      continue
    }

    if (index.productIdsWithVariants.has(product.id)) {
      unresolved.push({ retailer_id: retailerId, name: product.name, reason: "variant_required" })
      continue
    }

    const db = dbProducts.get(product.id)
    if (!db) {
      unresolved.push({ retailer_id: retailerId, name: product.name, reason: "missing_in_db" })
      continue
    }
    if (db.stock_status === "out_of_stock") {
      unresolved.push({ retailer_id: retailerId, name: product.name, reason: "out_of_stock" })
      continue
    }

    mergeLine(`p:${product.id}`, {
      product_id: product.id,
      name: product.name,
      quantity,
      unit_price: db.sale_price ?? db.price,
      variant_id: null,
      variant_name: null,
    })
  }

  const lines = [...lineByKey.values()]
  const subtotal = lines.reduce((sum, line) => sum + line.unit_price * line.quantity, 0)
  return { lines, unresolved, subtotal }
}
