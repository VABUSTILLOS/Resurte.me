"use client"

import { ArrowLeft, ShoppingCart, Trash2, Minus, Plus, Package, RefreshCw } from "lucide-react"
import { useCart } from "@/contexts/cart-context"
import { useCity, DEFAULT_CITY_SLUG } from "@/contexts/city-context"
import { createClient } from "@/lib/supabase/client"
import Link from "next/link"
import { useState, useEffect } from "react"
import { CouponInput } from "@/components/cart/coupon-input"
import { FreeShippingProgress } from "@/components/cart/FreeShippingProgress"
import { calcCheckoutTotals, FREE_SHIPPING_THRESHOLD, DELIVERY_FEE_FLAT } from "@/lib/checkout-config"
import { BumpCards } from "@/components/checkout/BumpCards"
import { useSelectedBumps } from "@/hooks/use-selected-bumps"

export default function CartPage() {
  const { cart, itemCount, subtotal, coupon, removeItem, updateQuantity, clearCart, addItem, isLoaded } = useCart()
  const { city } = useCity()
  const [confirmClear, setConfirmClear] = useState(false)
  const [restoreStatus, setRestoreStatus] = useState<"idle" | "loading" | "done" | "error">("idle")
  // Order bumps (cross-sell estilo ThriveCart). Estado compartido con el drawer
  // móvil y /{ciudad}/carrito vía sessionStorage + evento global; se persiste
  // para que /checkout la incluya en la orden al pagar.
  const { selectedBumps, setSelectedBumps } = useSelectedBumps()
  const bumpsSubtotal = selectedBumps.reduce((sum, b) => sum + b.unitPrice * b.quantity, 0)
  // Totales unificados (misma fórmula que el checkout y el servidor).
  const totals = calcCheckoutTotals(
    subtotal,
    bumpsSubtotal,
    coupon,
    itemCount,
    selectedBumps.length,
    DELIVERY_FEE_FLAT
  )
  const deliveryFee = totals.deliveryFee
  const bumpsTotal = totals.total

  // Restaura el carrito desde el enlace "restore=<order_id>" del email de
  // carrito abandonado. Solo funciona si el usuario tiene sesión (RLS exige
  // ser dueño de la orden); si no, se ignora sin romper la página.
  useEffect(() => {
    let cancelled = false
    const params = new URLSearchParams(window.location.search)
    const orderId = params.get("restore")
    if (!orderId || isNaN(Number(orderId))) return

    const supabase = createClient()
    if (!supabase) return

    ;(async () => {
      setRestoreStatus("loading")
      try {
        const { data, error } = await supabase
          .from("orders")
          .select("id, order_items(*, products(id, name, image_url, slug))")
          .eq("id", Number(orderId))
          .maybeSingle()

        if (cancelled) return
        if (error || !data) {
          setRestoreStatus("error")
          return
        }

        const items: Array<{
          product_id: number
          quantity: number
          unit_price: number
          products: { id: number; name: string; image_url: string; slug: string } | null
        }> = ((data as { order_items?: unknown }).order_items ?? []) as Array<{
          product_id: number
          quantity: number
          unit_price: number
          products: { id: number; name: string; image_url: string; slug: string } | null
        }>
        if (items.length === 0) {
          setRestoreStatus("error")
          return
        }

        items.forEach((item) => {
          addItem({
            product_id: item.product_id,
            name: item.products?.name || `Producto #${item.product_id}`,
            slug: item.products?.slug || `producto-${item.product_id}`,
            image_url: item.products?.image_url || "",
            brand: "",
            price: Number(item.unit_price),
            sale_price: null,
            quantity: item.quantity,
            stock_status: "in_stock",
          })
        })

        setRestoreStatus("done")
        // Limpia el query param sin recargar la página
        window.history.replaceState({}, "", window.location.pathname)
      } catch {
        if (!cancelled) setRestoreStatus("error")
      }
    })()

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleClear = () => {
    if (confirmClear) {
      clearCart()
      setConfirmClear(false)
    } else {
      setConfirmClear(true)
      setTimeout(() => setConfirmClear(false), 4000)
    }
  }

  // El carrito persistido se carga en el cliente tras la hidratación
  // (cart-context: SSR-safe). Hasta entonces se muestra un skeleton para no
  // pestañear el estado "vacío" en recargas con carrito guardado.
  if (!isLoaded) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-6 sm:py-10">
        <div className="h-6 w-40 bg-[#F7F5F0] rounded mb-6 animate-pulse" />
        <div className="h-4 w-64 bg-[#F7F5F0] rounded mb-4 animate-pulse" />
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="bg-white rounded-xl border border-[#e0dbd2] p-4 flex gap-4 animate-pulse"
            >
              <div className="w-20 h-20 rounded-lg bg-[#F7F5F0] shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-3/4 bg-[#F7F5F0] rounded" />
                <div className="h-4 w-1/4 bg-[#F7F5F0] rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Empty state
  if (!cart.items.length) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center px-4">
        <Link
          href={`/${city?.slug ?? DEFAULT_CITY_SLUG}`}
          className="self-start inline-flex items-center gap-1.5 text-sm text-[var(--text-secondary)] hover:text-[#0E7A0E] transition-colors mb-8"
        >
          <ArrowLeft className="w-4 h-4" />
          Seguir comprando
        </Link>
        <div className="w-20 h-20 rounded-full bg-[#F7F5F0] flex items-center justify-center mb-6">
          <ShoppingCart className="w-10 h-10 text-[#D9D7D2]" />
        </div>
        <h1 className="text-2xl font-bold text-[#242529] mb-2">Tu carrito está vacío</h1>
        <p className="text-[var(--text-secondary)] text-center max-w-sm mb-8">
          Agrega productos desde el catálogo para comenzar tu pedido.
        </p>
        <Link
          href={`/${city?.slug ?? DEFAULT_CITY_SLUG}`}
          className="inline-flex items-center gap-2 px-6 py-3 bg-[#0E7A0E] text-white font-semibold rounded-xl hover:bg-[#0D720D] transition-colors"
        >
          Explorar productos
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 sm:py-10 pb-28 sm:pb-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link
            href={`/${city?.slug ?? DEFAULT_CITY_SLUG}`}
            className="inline-flex items-center gap-1.5 text-sm text-[var(--text-secondary)] hover:text-[#0E7A0E] transition-colors mb-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Seguir comprando
          </Link>
          <h1 className="text-2xl font-bold text-[#242529]">Tu carrito</h1>
          <p className="text-sm text-[var(--text-secondary)]">{itemCount} {itemCount === 1 ? "producto" : "productos"}</p>
        </div>
        <button
          onClick={handleClear}
          className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
            confirmClear
              ? "bg-[#de3534] text-white"
              : "text-[#de3534] hover:bg-red-50 border border-transparent hover:border-red-200"
          }`}
        >
          <Trash2 className="w-4 h-4" />
          {confirmClear ? "¿Confirmar?" : "Vaciar"}
        </button>
      </div>

      {/* Restore status (desde el email de carrito abandonado) */}
      {restoreStatus === "loading" && (
        <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)] bg-[#F7F5F0] rounded-xl px-4 py-3 mb-4">
          <RefreshCw className="w-4 h-4 animate-spin text-[#0E7A0E]" />
          Restaurando tu pedido anterior…
        </div>
      )}
      {restoreStatus === "done" && (
        <div className="flex items-center gap-2 text-sm text-[#0D720D] bg-green-50 border border-green-200 rounded-xl px-4 py-3 mb-4">
          <Package className="w-4 h-4 text-[#0E7A0E]" />
          Restauramos los productos de tu último pedido. ¡Continúa tu compra!
        </div>
      )}
      {restoreStatus === "error" && (
        <div className="flex items-center gap-2 text-sm text-[#b3261e] bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4">
          <Package className="w-4 h-4 text-[#de3534]" />
          No pudimos restaurar tu pedido anterior.
        </div>
      )}

      {/* Barra de progreso hacia envío gratis (mecánica ThriveCart).
          El subtotal pagable incluye descuento + bumps para que la barra
          avance en tiempo real al seleccionar un order bump. */}
      <div className="mb-4">
        <FreeShippingProgress
          payableSubtotal={totals.payableSubtotal}
        />
      </div>

      {/* Cart items */}
      <div className="space-y-3 mb-8">
        {cart.items.map((item) => {
          const itemPrice = item.sale_price ?? item.price
          const itemTotal = itemPrice * item.quantity

          return (
            <div
              key={item.product_id}
              className="bg-white rounded-xl border border-[#e0dbd2] p-4 flex gap-4 items-center"
            >
              {/* Image */}
              <Link
                href={`/${city?.slug ?? DEFAULT_CITY_SLUG}/producto/${item.slug}`}
                className="w-20 h-20 rounded-lg bg-[#faf8f5] flex items-center justify-center overflow-hidden shrink-0"
              >
                {item.image_url ? (
                  <img
                    src={item.image_url}
                    alt={item.name}
                    loading="lazy"
                    width={80}
                    height={80}
                    className="w-full h-full object-contain p-1.5"
                  />
                ) : (
                  <Package className="w-8 h-8 text-[#D9D7D2]" />
                )}
              </Link>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <Link
                  href={`/${city?.slug ?? DEFAULT_CITY_SLUG}/producto/${item.slug}`}
                  className="font-semibold text-[#242529] text-sm line-clamp-2 hover:text-[#0E7A0E] transition-colors"
                >
                  {item.name}
                </Link>
                {item.brand && (
                  <p className="text-xs text-[#B0B3B8] mt-0.5">{item.brand}</p>
                )}
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-sm font-bold text-[#1a1a1a]">
                    ${itemPrice.toFixed(2)}
                  </span>
                  {item.sale_price && item.sale_price < item.price && (
                    <span className="text-xs text-[#B0B3B8] line-through">
                      ${item.price.toFixed(2)}
                    </span>
                  )}
                </div>
              </div>

              {/* Quantity + Remove */}
              <div className="flex flex-col items-end gap-2 shrink-0">
                <button
                  onClick={() => removeItem(item.product_id)}
                  className="text-[#B0B3B8] hover:text-[#de3534] transition-colors p-2.5 sm:p-1 touch-target"
                  aria-label={`Eliminar ${item.name}`}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <div className="flex items-center gap-1.5 bg-[#F7F5F0] rounded-lg p-1">
                  <button
                    onClick={() => updateQuantity(item.product_id, item.quantity - 1)}
                    className="w-9 h-9 sm:w-7 sm:h-7 flex items-center justify-center rounded-md text-[var(--text-secondary)] hover:bg-white hover:text-[#1a1a1a] transition-colors touch-target"
                    aria-label="Reducir cantidad"
                  >
                    <Minus className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                  </button>
                  <span className="w-7 text-center text-sm font-semibold text-[#1a1a1a] tabular-nums">
                    {item.quantity}
                  </span>
                  <button
                    onClick={() => updateQuantity(item.product_id, item.quantity + 1)}
                    className="w-9 h-9 sm:w-7 sm:h-7 flex items-center justify-center rounded-md text-[var(--text-secondary)] hover:bg-white hover:text-[#0E7A0E] transition-colors touch-target"
                    aria-label="Aumentar cantidad"
                  >
                    <Plus className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                  </button>
                </div>
                <span className="text-sm font-semibold text-[#1a1a1a] tabular-nums">
                  ${itemTotal.toFixed(2)}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Cross-sell: order bumps inteligentes (mecánica ThriveCart). Mismo
          componente que el drawer móvil — visible también en desktop.
          Ubicados DESPUÉS de la lista de items para que el usuario primero
          revise sus productos y luego vea las sugerencias complementarias. */}
      <BumpCards
        cartItems={cart.items.map((i) => ({ product_id: i.product_id, quantity: i.quantity }))}
        selected={selectedBumps}
        onChange={setSelectedBumps}
      />

      {/* Summary */}
      <div className="bg-white rounded-xl border border-[#e0dbd2] p-5">
        <h2 className="font-bold text-[#242529] mb-4">Resumen del pedido</h2>

        <div className="space-y-2 text-sm mb-4">
          <div className="flex justify-between text-[var(--text-secondary)]">
            <span>Subtotal ({itemCount} productos)</span>
            <span className="tabular-nums">${subtotal.toFixed(2)}</span>
          </div>
          {bumpsSubtotal > 0 && (
            <div className="flex justify-between text-[var(--text-secondary)]">
              <span>Artículos especiales</span>
              <span className="tabular-nums">${bumpsSubtotal.toFixed(2)}</span>
            </div>
          )}
          {totals.discountAmount > 0 && (
            <div className="flex justify-between text-[#0E7A0E]">
              <span>Descuento {coupon ? `(${coupon.code})` : ""}</span>
              <span className="tabular-nums">-${totals.discountAmount.toFixed(2)}</span>
            </div>
          )}
          {itemCount > 0 && (
            <div className="flex justify-between text-[var(--text-secondary)]">
              <span>Envío</span>
              <span className="tabular-nums">
                {deliveryFee === 0 ? "Gratis 🎉" : `$${deliveryFee.toFixed(2)}`}
              </span>
            </div>
          )}
        </div>

        <div className="flex justify-between items-center pt-4 border-t border-[#e0dbd2]">
          <span className="text-base font-bold text-[#242529]">Total</span>
          <span className="text-xl font-bold text-[#1a1a1a] tabular-nums">
            ${bumpsTotal.toFixed(2)}
          </span>
        </div>

        <div className="mt-4">
          <CouponInput />
        </div>

        <p className="text-xs text-[#B0B3B8] mt-2">
          {deliveryFee === 0
            ? "¡Tienes envío gratis en este pedido! 🎉"
            : `Envío de $${DELIVERY_FEE_FLAT.toFixed(2)} · gratis desde $${FREE_SHIPPING_THRESHOLD.toFixed(0)} de compra. Aplican restricciones por zona.`}
        </p>
      </div>

      {/* Actions */}
      <div className="mt-6 flex flex-col sm:flex-row gap-3">
        <a
          href={`https://wa.me/${process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "5216145337486"}?text=${encodeURIComponent(
            "🛒 *Pedido desde Resurte.me*\n\n" +
              cart.items
                .map(
                  (item, i) =>
                    `${i + 1}. ${item.quantity}× ${item.name} — $${((item.sale_price ?? item.price) * item.quantity).toFixed(2)}`
                )
                .join("\n") +
              `\n\n*Total: $${bumpsTotal.toFixed(2)} MXN*\n\n¿Me confirman disponibilidad y tiempo de entrega?`
          )}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 inline-flex items-center justify-center gap-2 px-6 py-3.5 bg-green-500 text-white font-semibold rounded-xl hover:bg-green-600 transition-colors"
        >
          <Package className="w-5 h-5" />
          Pedir por WhatsApp
        </a>
        <Link
          href={`/${city?.slug ?? DEFAULT_CITY_SLUG}/checkout`}
          className="flex-1 inline-flex items-center justify-center gap-2 px-6 py-3.5 bg-[#0E7A0E] text-white font-semibold rounded-xl hover:bg-[#0D720D] transition-colors"
        >
          Ir a checkout
        </Link>
      </div>

      {/* Trust signals */}
      <div className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
        {trustSignals.map((signal) => (
          <div key={signal.label} className="bg-white rounded-xl border border-[#e0dbd2] p-3">
            <span className="text-lg">{signal.icon}</span>
            <p className="text-xs font-semibold text-[#242529] mt-1">{signal.label}</p>
            <p className="text-[10px] text-[#B0B3B8]">{signal.desc}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

const trustSignals = [
  { icon: "🔒", label: "Pago Seguro", desc: "Stripe y Conekta" },
  { icon: "🚚", label: "Envío Rápido", desc: "Tarifa fija de $35" },
  { icon: "📄", label: "Factura (CFDI)", desc: "Para tu negocio" },
  { icon: "⭐", label: "Calidad Garantizada", desc: "O te devolvemos tu dinero" },
]
