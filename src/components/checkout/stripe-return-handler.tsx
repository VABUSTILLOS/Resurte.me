"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useCart } from "@/contexts/cart-context"
import { useCity, DEFAULT_CITY_SLUG } from "@/contexts/city-context"
import { useSelectedBumps } from "@/hooks/use-selected-bumps"
import {
  DELIVERY_FEE_FLAT,
  calcCheckoutTotals,
  countBumpUnits,
} from "@/lib/checkout-config"
import { clearCheckoutStep } from "@/lib/checkout-resume"
import { withoutQueryParams } from "@/lib/url-params"
import {
  STRIPE_RETURN_PARAMS,
  clearPendingCardPayment,
  isReturnOfPendingPayment,
  readPendingCardPayment,
} from "@/lib/payment-return"

/**
 * Cierra el post-pago de un cobro con tarjeta que salió del navegador.
 *
 * Con CoDi o un 3DS que el banco no resuelve inline, Stripe se lleva al cliente
 * y lo devuelve a la misma página con `redirect_status=succeeded`: el checkout
 * se recargó, su estado murió y el post-pago (`onPaid`) **nunca corre**, así que
 * el carrito se quedaba con los artículos del pedido ya pagado. Aquí se reclama
 * esa vuelta —solo si es del intent que dejó esta pestaña— y se hace lo que
 * `onPaid` habría hecho: limpiar carrito y bumps, olvidar el paso del checkout,
 * dejar `last_order` para la confirmación y navegar a ella.
 *
 * Vive en `layout.tsx` (vía `CheckoutOverlays`) porque la vuelta puede caer en
 * cualquier ruta: la `return_url` del checkout es la página donde estaba el
 * cliente. No se dispara en cobros ajenos: sin marca no hace nada.
 */
export function StripeReturnHandler() {
  const { cart, coupon, subtotal, itemCount, clearCart } = useCart()
  const { selectedBumps, setSelectedBumps } = useSelectedBumps()
  const { city } = useCity()
  const router = useRouter()

  useEffect(() => {
    // La ciudad se resuelve en el cliente; navegar antes llevaría a la
    // confirmación de la ciudad por defecto. El efecto se repite cuando llega.
    if (!city) return
    const pending = readPendingCardPayment()
    if (!isReturnOfPendingPayment(window.location.search, pending)) return

    // Consumir antes de tocar nada: si el efecto se repite (re-render, StrictMode)
    // ya no hay marca ni parámetros que reclamar.
    clearPendingCardPayment()
    window.history.replaceState(
      null,
      "",
      withoutQueryParams(window.location.href, STRIPE_RETURN_PARAMS)
    )

    // `last_order` es el contrato con la confirmación (orderId, método, total e
    // ítems). El total sale de la fuente única `calcCheckoutTotals`, la misma
    // que usa el checkout para cobrar.
    const bumpsSubtotal = selectedBumps.reduce((sum, b) => sum + b.unitPrice * b.quantity, 0)
    const totals = calcCheckoutTotals(
      subtotal,
      bumpsSubtotal,
      coupon,
      itemCount,
      countBumpUnits(selectedBumps),
      DELIVERY_FEE_FLAT
    )
    try {
      window.sessionStorage.setItem(
        "last_order",
        JSON.stringify({
          orderId: pending?.orderId ?? null,
          trackingToken: null,
          paymentMethod: "card",
          total: totals.total,
          cashbackCredits: 0,
          cashbackTier: null,
          repurchaseCoupon: null,
          items: [
            ...cart.items.map((i) => ({
              id: String(i.product_id),
              name: i.name,
              quantity: i.quantity,
              price: i.sale_price ?? i.price,
            })),
            ...selectedBumps.map((b) => ({
              id: String(b.productId),
              name: b.name ?? `Artículo especial #${b.productId}`,
              quantity: b.quantity,
              price: b.unitPrice,
            })),
          ],
        })
      )
    } catch {
      // Sin sessionStorage la confirmación se muestra genérica; el pedido está cobrado.
    }

    clearCheckoutStep()
    clearCart()
    // Los bumps ya viajaron dentro de la orden: no pueden sobrevivir al pedido.
    setSelectedBumps([])
    router.replace(`/${city.slug ?? DEFAULT_CITY_SLUG}/pedido-confirmado`)
  }, [
    city,
    cart.items,
    coupon,
    subtotal,
    itemCount,
    selectedBumps,
    clearCart,
    setSelectedBumps,
    router,
  ])

  return null
}
