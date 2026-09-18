/**
 * Repetir un pedido — la fuente única del plan de rehidratación del carrito.
 *
 * POR QUÉ EXISTE ESTE MÓDULO
 * --------------------------
 * «Repetir pedido» ya existía, pero sólo en la LISTA de pedidos
 * (`mis-pedidos/page.tsx`), con la lógica escrita en línea dentro del
 * componente. Las dos superficies donde el cliente PUEDE cancelar —el detalle
 * del pedido y el seguimiento— no ofrecían ninguna salida: al cancelar
 * mostraban «contacta a soporte» y ahí terminaba el recorrido.
 *
 * Eso dejaba la tarea del cliente a medias. «Modificar un pedido» no se puede
 * resolver editando el pedido ya hecho (movería los totales, exigiría
 * re-reservar stock —no sólo liberarlo—, podría invalidar el cupón y, si ya
 * está cobrado, necesitaría una devolución que este repo no sabe hacer:
 * `payments.ts` no tiene ninguna coincidencia de `refund`). La vía honesta es
 * cancelar y volver a pedir, y esa vía tiene que estar disponible justo donde
 * el cliente acaba de cancelar.
 *
 * Al extraer el cálculo aquí, la lista y las dos superficies de cancelación
 * comparten UNA sola definición de «qué se puede volver a agregar y a qué
 * precio». Antes eran cero definiciones compartidas y una copia en línea.
 *
 * LA REGLA DE PRECIO (no obvia, y ya costó un bug)
 * -----------------------------------------------
 * Se rehidrata con el catálogo ACTUAL, no con el precio congelado de la orden.
 * El servidor recalcula el subtotal contra la base y rechaza la orden si no
 * coincide al centavo, así que agregar con el precio histórico hacía fallar
 * «Repetir» en cuanto cambiaba cualquier precio. El snapshot histórico es
 * SÓLO el último recurso, para cuando el catálogo no responde: mejor agregar
 * algo con un precio que el servidor corregirá/rechazará que no agregar nada.
 */

import type { CartItem } from "@/types"

export type ReorderStockStatus = "in_stock" | "low_stock" | "out_of_stock"

/** Una partida tal como viene de la orden (snapshot histórico). */
export interface ReorderSourceItem {
  product_id: number
  quantity: number
  unit_price: number
  product_name?: string | null
  product_image?: string | null
}

/** Un producto tal como está HOY en el catálogo. */
export interface ReorderCatalogProduct {
  id: number
  name: string
  slug: string
  image_url: string | null
  price: number
  sale_price: number | null
  stock_status: ReorderStockStatus
  brand: string | null
}

export interface ReorderPlan {
  /** Lo que se agregará al carrito, con precios vigentes. */
  items: CartItem[]
  /** Partidas que NO se agregaron por estar fuera de catálogo o agotadas. */
  skipped: number
  /** `true` cuando el catálogo no respondió y se usó el snapshot histórico. */
  catalogFailed: boolean
}

/**
 * Columnas del catálogo que se piden a Supabase. Vive aquí para que la
 * consulta y el tipo no puedan desincronizarse: si alguien añade un campo al
 * tipo, el `select` es el mismo string que se prueba en `order-reorder.test.ts`.
 */
export const REORDER_CATALOG_COLUMNS =
  "id, name, slug, image_url, price, sale_price, stock_status, brand"

/**
 * Resuelve UNA partida contra el catálogo actual.
 *
 * Devuelve `null` cuando el producto ya no está en el catálogo: con el precio
 * histórico el servidor rechazaría el pedido, así que no hay nada válido que
 * agregar. (Cuando `catalog` es `null` la consulta FALLÓ, no que el producto
 * falte, y se cae al snapshot: mejor agregar algo que el servidor corregirá o
 * rechazará que no agregar nada.)
 *
 * Conserva `stock_status: "out_of_stock"` en lugar de descartarlo, para que las
 * superficies que muestran el producto agotado puedan deshabilitarlo.
 */
export function resolveReorderItem(
  item: ReorderSourceItem,
  catalog: ReadonlyMap<number, ReorderCatalogProduct> | null,
): CartItem | null {
  const current = catalog?.get(item.product_id)

  if (!current) {
    if (catalog !== null) return null
    return {
      product_id: item.product_id,
      name: item.product_name || `Producto #${item.product_id}`,
      slug: `producto-${item.product_id}`,
      image_url: item.product_image || "",
      brand: "",
      price: item.unit_price,
      sale_price: null,
      quantity: item.quantity,
      stock_status: "in_stock",
    }
  }

  return {
    product_id: item.product_id,
    name: current.name || item.product_name || `Producto #${item.product_id}`,
    slug: current.slug || `producto-${item.product_id}`,
    image_url: current.image_url || item.product_image || "",
    brand: current.brand ?? "",
    price: current.price,
    sale_price: current.sale_price,
    quantity: item.quantity,
    stock_status: current.stock_status,
  }
}

/**
 * Construye el plan de rehidratación.
 *
 * @param orderItems partidas de la orden
 * @param catalog    catálogo actual indexado por id, o `null` si la consulta
 *                   falló (en ese caso se cae al snapshot histórico)
 */
export function buildReorderPlan(
  orderItems: readonly ReorderSourceItem[],
  catalog: ReadonlyMap<number, ReorderCatalogProduct> | null,
): ReorderPlan {
  const catalogFailed = catalog === null
  const items: CartItem[] = []
  let skipped = 0

  for (const item of orderItems) {
    const resolved = resolveReorderItem(item, catalog)
    // Fuera de catálogo (el servidor lo rechazaría con ese precio) o agotado:
    // no se agrega y se le dice al cliente cuántos quedaron fuera.
    if (resolved === null || resolved.stock_status === "out_of_stock") {
      skipped += 1
      continue
    }
    items.push(resolved)
  }

  return { items, skipped, catalogFailed }
}

/**
 * El mensaje para el cliente. Devuelve `null` cuando no hay nada que decir
 * (ni se agregó nada ni se saltó nada: la orden venía vacía).
 *
 * Los textos son los mismos que ya se mostraban desde la lista de pedidos.
 */
export function reorderFeedback(plan: ReorderPlan): string | null {
  const added = plan.items.length
  const { skipped } = plan

  if (skipped > 0) {
    if (added === 0) {
      return "Estos productos ya no están disponibles por ahora"
    }
    return `${skipped} producto${skipped !== 1 ? "s" : ""} ya no ${
      skipped !== 1 ? "están" : "está"
    } disponible${skipped !== 1 ? "s" : ""} y no se agregó`
  }

  if (added > 0) {
    return `${added} producto${added !== 1 ? "s" : ""} ${
      added !== 1 ? "agregados" : "agregado"
    } al carrito`
  }

  return null
}
