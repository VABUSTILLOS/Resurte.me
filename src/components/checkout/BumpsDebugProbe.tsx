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
 * La definición se hace en DOS momentos:
 *   1. EAGER (ámbito del módulo): en cuanto el chunk se ejecuta en el navegador,
 *      antes de que React hidrate. Así es IMPOSIBLE obtener `undefined` si el
 *      bundle nuevo está cargado, incluso si la hidratación falla (p. ej. un
 *      error de React al estar logueado impediría que corrieran los useEffect).
 *   2. EN useEffect: se re-escribe con los datos reales del carrito una vez
 *      hidratado, para que siempre refleje el estado actual.
 */
function initDebugProbe() {
  if (typeof window === "undefined") return
  try {
    window.__resurteBumpsDebug = {
      mounted: false,
      status: "empty",
      cartKey: "",
      bumpCount: 0,
      note: "Bundle nuevo cargado, pero React aún no hidrata (o la hidratación falló).",
      pageUrl: window.location.pathname,
      cartCount: 0,
      cartItems: [],
      ts: new Date().toISOString(),
    }
  } catch {
    // window disponible pero read-only en contextos raros; ignorar
  }
}

// Eager: se ejecuta al cargar el chunk, antes de la hidratación de React.
initDebugProbe()

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
