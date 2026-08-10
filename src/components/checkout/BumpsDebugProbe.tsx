"use client"

import { useEffect } from "react"
import { useCart } from "@/contexts/cart-context"

/**
 * Sonda de diagnóstico para los order bumps.
 *
 * `window.__resurteBumpsDebug` se inicializa aquí GLOBALMENTE en cada página
 * para que el usuario pueda ejecutar
 *   copy(JSON.stringify(window.__resurteBumpsDebug, null, 2))
 * desde cualquier ruta (home, catálogo, carrito, checkout) y SIEMPRE obtener
 * un objeto con información, en lugar de `undefined`.
 *
 * Cuando `BumpCards` está montado, ese componente sobrescribe la propiedad con
 * el estado real del fetch (status: idle|loading|ok|empty). Aquí exponemos:
 *   - mounted: false → BumpCards NO está montado en esta vista (drawer cerrado,
 *     sin items, o ruta sin bumps). Explica el `undefined` histórico.
 *   - pageUrl: ruta exacta donde se ejecutó el comando.
 *   - cart: items del carrito en este origen (resurte.me vs www.resurte.me son
 *     orígenes distintos con localStorage distinto).
 */
export function BumpsDebugProbe() {
  const { cart } = useCart()

  useEffect(() => {
    const cartItems = cart.items.map((i) => ({
      product_id: i.product_id,
      quantity: i.quantity,
      name: i.name,
    }))
    window.__resurteBumpsDebug = {
      mounted: false,
      status: "empty",
      cartKey: cart.items.map((i) => `${i.product_id}:${i.quantity}`).join("|"),
      bumpCount: 0,
      note: "BumpCards no está montado en esta vista/estado. Abre el carrito con items o ve a /carrito.",
      pageUrl: window.location.pathname,
      cartCount: cart.items.length,
      cartItems,
      ts: new Date().toISOString(),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart.items.length])

  return null
}
