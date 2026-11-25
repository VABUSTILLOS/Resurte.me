import type { CartItem } from "@/types"

/**
 * Precio unitario vigente de una línea del carrito (Ola 5).
 *
 * Orden de precedencia, una sola definición para todas las
 * superficies (subtotal del contexto, payload del checkout,
 * listas y textos de confirmación):
 *
 * 1. `customer_price` — el precio especial del cliente con
 *    sesión (00234), que el CartProvider reaplica desde
 *    /api/customer-prices y que el servidor recalcula en
 *    POST /api/orders. Solo vive en líneas SIN presentación:
 *    la presentación cobra la suya.
 * 2. `sale_price` — la oferta vigente del catálogo.
 * 3. `price` — el precio público.
 */
export function cartItemUnitPrice(
  item: Pick<CartItem, "price" | "sale_price" | "customer_price">
): number {
  return item.customer_price ?? item.sale_price ?? item.price
}
