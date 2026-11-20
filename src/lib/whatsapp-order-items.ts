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

import { metaFeedIdForNew, metaFeedMapEntry } from "@/lib/meta-feed"
import type { Category, Product } from "@/types"

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

/** Línea de pedido lista para insertar en `order_items`. */
export interface ResolvedOrderLine {
  product_id: number
  /** Nombre vigente del producto (para respuestas y bitácora). */
  name: string
  quantity: number
  /** Precio efectivo de la BD (`sale_price ?? price`), nunca el de Meta. */
  unit_price: number
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
}

export function buildRetailerIdIndex(
  products: readonly Product[],
  categories: readonly Category[]
): RetailerIdIndex {
  const categoryNameById = new Map(categories.map((c) => [c.id, c.name]))
  const byRetailerId = new Map<string, Product>()
  const byNumericId = new Map<number, Product>()

  for (const product of products) {
    byNumericId.set(product.id, product)
    const entry = metaFeedMapEntry(product.slug)
    if (entry) byRetailerId.set(entry.id, product)
  }
  for (const product of products) {
    if (metaFeedMapEntry(product.slug)) continue
    const categoryName = categoryNameById.get(product.category_id)
    if (!categoryName) continue
    const derivedId = metaFeedIdForNew(categoryName, product.slug)
    if (!byRetailerId.has(derivedId)) byRetailerId.set(derivedId, product)
  }

  return { byRetailerId, byNumericId }
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
 */
export function resolveOrderItems(
  productItems: readonly MetaOrderProductItem[],
  index: RetailerIdIndex,
  dbProducts: ReadonlyMap<number, OrderDbProduct>
): ResolvedOrderItems {
  const unresolved: UnresolvedOrderItem[] = []
  const lineByProduct = new Map<number, ResolvedOrderLine>()

  for (const item of productItems) {
    const retailerId = String(item.product_retailer_id ?? "")
    const product = resolveRetailerId(index, retailerId)
    if (!product) {
      unresolved.push({ retailer_id: retailerId, name: null, reason: "unknown" })
      continue
    }

    const rawQty = Number(item.quantity)
    if (!Number.isFinite(rawQty) || Math.floor(rawQty) < MIN_QUANTITY) {
      unresolved.push({ retailer_id: retailerId, name: product.name, reason: "invalid_quantity" })
      continue
    }
    const quantity = Math.min(MAX_QUANTITY, Math.floor(rawQty))

    const db = dbProducts.get(product.id)
    if (!db) {
      unresolved.push({ retailer_id: retailerId, name: product.name, reason: "missing_in_db" })
      continue
    }
    if (db.stock_status === "out_of_stock") {
      unresolved.push({ retailer_id: retailerId, name: product.name, reason: "out_of_stock" })
      continue
    }

    const unitPrice = db.sale_price ?? db.price
    const existing = lineByProduct.get(product.id)
    if (existing) {
      existing.quantity = Math.min(MAX_QUANTITY, existing.quantity + quantity)
    } else {
      lineByProduct.set(product.id, {
        product_id: product.id,
        name: product.name,
        quantity,
        unit_price: unitPrice,
      })
    }
  }

  const lines = [...lineByProduct.values()]
  const subtotal = lines.reduce((sum, line) => sum + line.unit_price * line.quantity, 0)
  return { lines, unresolved, subtotal }
}
