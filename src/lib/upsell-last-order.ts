/**
 * Actualiza sessionStorage.last_order tras un upsell 1-click para que la
 * página de confirmación muestre el total consolidado (base + upsells) en
 * el evento `purchase`. No muta la orden en la BD — el webhook ya la marcó
 * pagada. Extraído del UpsellModal para testabilidad.
 */

interface LastOrderOfferLike {
  productId: number
  quantity: number
  price: number
  product: { name: string }
}

export function updateLastOrder(offer: LastOrderOfferLike, amount: number): void {
  if (typeof window === "undefined") return
  try {
    const raw = window.sessionStorage.getItem("last_order")
    const previous = raw ? JSON.parse(raw) : {}
    const existingItems = Array.isArray(previous.items) ? previous.items : []
    const upsellItem = {
      id: String(offer.productId),
      name: offer.product.name,
      quantity: offer.quantity,
      price: offer.price,
    }
    window.sessionStorage.setItem(
      "last_order",
      JSON.stringify({
        ...previous,
        total: Number(previous.total ?? 0) + amount,
        items: [...existingItems, upsellItem],
      }),
    )
  } catch {
    // sessionStorage puede no estar disponible — no bloquear la navegación.
  }
}
