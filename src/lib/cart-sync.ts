/**
 * Merge carrito local (localStorage) ↔ carrito servidor (user_carts).
 *
 * Estrategia last-write-wins comparando timestamps; si el local no tiene
 * timestamp (carrito legacy sin updatedAt) gana el local: es el estado
 * actual del dispositivo del usuario y subirlo no pierde nada visible.
 *
 * Extraído del CartProvider para testabilidad.
 */

import type { Cart, CartItem, AppliedCoupon } from "@/types"

export interface LocalCartSnapshot {
  cart: Cart
  coupon: AppliedCoupon | null
  /** epoch ms del último cambio local; null = legacy sin timestamp */
  updatedAt: number | null
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
