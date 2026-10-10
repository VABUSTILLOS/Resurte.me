/**
 * Merge carrito local (localStorage) ↔ carrito servidor (user_carts).
 *
 * Estrategia last-write-wins comparando timestamps; si el local no tiene
 * timestamp (carrito legacy sin updatedAt) gana el local: es el estado
 * actual del dispositivo del usuario y subirlo no pierde nada visible.
 *
 * Caso propio: el carrito **vacío**. Un vacío local solo gana si el dispositivo
 * registró un vaciado deliberado (`clearedAt`) más reciente que el servidor
 * (`isDeliberateClear`); si no, el servidor manda — un navegador nuevo no puede
 * borrar el carrito de la cuenta.
 *
 * Extraído del CartProvider para testabilidad.
 */

import type { Cart, CartItem, AppliedCoupon } from "@/types"

export interface LocalCartSnapshot {
  cart: Cart
  coupon: AppliedCoupon | null
  /** epoch ms del último cambio local; null = legacy sin timestamp */
  updatedAt: number | null
  /**
   * epoch ms del último vaciado **deliberado** en este dispositivo, o `null` si
   * nunca lo hubo. Es la única forma de distinguir "aquí se vació el carrito a
   * propósito" de "este dispositivo no tiene carrito" (un navegador nuevo, un
   * invitado que llega por primera vez): sin la marca, ambos son un carrito
   * vacío y el servidor ganaría siempre.
   */
  clearedAt?: number | null
}

export interface ServerCartSnapshot {
  items: CartItem[]
  coupon: AppliedCoupon | null
  /** ISO string del servidor; null si no hay fila */
  updated_at: string | null
}

export type CartMergeDecision =
  | { action: "use-server"; cart: Cart; coupon: AppliedCoupon | null }
  | { action: "upload-local" }
  | { action: "none" }

/**
 * ¿El vacío local es un estado **más reciente** que la fila del servidor?
 *
 * Solo cuando el dispositivo registró un vaciado deliberado (`clearedAt`) que no
 * es anterior a la última escritura del servidor. Un carrito vacío **sin** marca
 * es un dispositivo sin datos, y ahí el servidor es la única fuente posible:
 * entrar desde otro navegador no puede borrar el carrito de la cuenta.
 */
function isDeliberateClear(
  local: LocalCartSnapshot,
  server: ServerCartSnapshot | null
): boolean {
  const clearedAt = local.clearedAt ?? null
  if (clearedAt === null || !Number.isFinite(clearedAt)) return false
  const serverTs = server?.updated_at ? Date.parse(server.updated_at) : NaN
  // Sin timestamp del servidor no hay nada más reciente que respetar.
  if (Number.isNaN(serverTs)) return true
  return clearedAt >= serverTs
}

export function mergeCarts(
  local: LocalCartSnapshot,
  server: ServerCartSnapshot | null
): CartMergeDecision {
  const localCount = local.cart.items.length
  const serverItems = server?.items ?? []
  const serverCount = Array.isArray(serverItems) ? serverItems.length : 0

  if (localCount === 0 && serverCount === 0) return { action: "none" }
  if (serverCount === 0) {
    return localCount > 0 ? { action: "upload-local" } : { action: "none" }
  }
  if (localCount === 0) {
    // El carrito se vació aquí a propósito (o lo vació el post-pago): se sube el
    // vacío en vez de resucitar los artículos del pedido anterior. Sin esta
    // rama, el pedido recién cerrado volvía al carrito en la siguiente visita.
    if (isDeliberateClear(local, server)) return { action: "upload-local" }
    return { action: "use-server", cart: { items: serverItems }, coupon: server?.coupon ?? null }
  }

  // Ambos tienen items: gana el más reciente.
  if (local.updatedAt === null) return { action: "upload-local" } // legacy local
  const serverTs = server?.updated_at ? Date.parse(server.updated_at) : NaN
  if (Number.isNaN(serverTs)) return { action: "upload-local" }
  if (serverTs > local.updatedAt) {
    return { action: "use-server", cart: { items: serverItems }, coupon: server?.coupon ?? null }
  }
  return { action: "upload-local" }
}
