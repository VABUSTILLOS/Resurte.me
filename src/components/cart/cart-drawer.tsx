"use client"

import { useState, useEffect } from "react"
import { useCart } from "@/contexts/cart-context"
import { useCity } from "@/contexts/city-context"
import {
  X,
  ShoppingBag,
  Minus,
  Plus,
  Trash2,
  Truck,
  ArrowRight,
} from "lucide-react"
import Link from "next/link"
import { AnalyticsEvents } from "@/lib/analytics"
import { CHECKOUT_DRAWER_EVENT } from "@/components/checkout/CheckoutDrawer"
import { BumpCards, type SelectedBump } from "@/components/checkout/BumpCards"

// Global event bus to control drawer from header
export const CART_DRAWER_EVENT = "resurte:toggle-cart-drawer"

export function CartDrawer() {
  const [isOpen, setIsOpen] = useState(false)
  const { cart, itemCount, subtotal, removeItem, updateQuantity, clearCart } = useCart()
  const { city } = useCity()
  // Order bumps seleccionados en el cross-sell del carrito; se transfieren al
  // CheckoutDrawer vía detail.bumps al presionar "Ir a Checkout".
  const [selectedBumps, setSelectedBumps] = useState<SelectedBump[]>([])

  // Listen for toggle events from header
  useEffect(() => {
    const handler = () => setIsOpen((prev) => !prev)
    window.addEventListener(CART_DRAWER_EVENT, handler)
    return () => window.removeEventListener(CART_DRAWER_EVENT, handler)
  }, [])

  // Lock body scroll when open
  useEffect(() => {
    document.body.style.overflow = isOpen ? "hidden" : ""
    return () => { document.body.style.overflow = "" }
  }, [isOpen])

  const handleCheckout = () => {
    AnalyticsEvents.beginCheckout(
      subtotal,
      cart.items.length,
      cart.items.map((i) => ({
        item_id: String(i.product_id),
        item_name: i.name,
        price: i.price,
        quantity: i.quantity,
      }))
    )
    setIsOpen(false)
    // Abrir el checkout completo dentro del drawer (mecánica SamCart) en vez
    // de navegar a /{city}/checkout. La ruta sigue funcionando como fallback.
    // Los bumps seleccionados en el cross-sell viajan en detail.bumps para que
    // CheckoutDrawer los inicialice (retrocompatible: si no llegan, se vacían).
    window.dispatchEvent(
      new CustomEvent(CHECKOUT_DRAWER_EVENT, { detail: { bumps: selectedBumps } })
    )
  }

  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[65] bg-black/30 backdrop-blur-sm transition-opacity"
        onClick={() => setIsOpen(false)}
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 bottom-0 z-[70] w-full max-w-md bg-white shadow-2xl flex flex-col animate-slide-in-right">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E8E9EB]">
          <div className="flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-[#0E7A0E]" />
            <h2 className="text-lg font-bold text-[#242529]">
              Mi Carrito
            </h2>
            {itemCount > 0 && (
              <span className="text-sm text-[var(--text-secondary)]">
                ({itemCount} {itemCount === 1 ? "producto" : "productos"})
              </span>
            )}
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="p-2 rounded-[10px] hover:bg-[#F7F5F0] transition-colors"
          >
            <X className="w-5 h-5 text-[var(--text-secondary)]" />
          </button>
        </div>

        {/* Cart header */}
        <div className="px-5 py-2.5 bg-[#F6FDF6] border-b border-brand-100 hidden">
          <p className="text-xs text-brand-700 flex items-center gap-1">
            <ShoppingBag className="w-3.5 h-3.5" />
            Tu pedido Resurte.me
          </p>
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto px-5">
          {cart.items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-[var(--text-secondary)] gap-3 pb-12">
            <ShoppingBag className="w-16 h-16 text-[#E8E9EB]" />
            <p className="text-lg font-medium text-[var(--text-secondary)]">Tu carrito está vacío</p>
              <p className="text-sm">
                Agrega productos desde el catálogo de tu ciudad.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-[#E8E9EB]">
              {cart.items.map((item) => (
                <li key={item.product_id} className="py-4 group">
                  <div className="flex gap-3">
                    {/* Product image placeholder */}
                    <div className="w-16 h-16 rounded-[10px] bg-[#F7F5F0] flex items-center justify-center shrink-0">
                      {item.image_url ? (
                        <img
                          src={item.image_url}
                          alt={item.name}
                          loading="lazy"
                          width={64}
                          height={64}
                          className="w-full h-full object-contain p-1 rounded-[10px]"
                        />
                      ) : (
                        <ShoppingBag className="w-6 h-6 text-[#C7C8CD]" />
                      )}
                    </div>

                    {/* Details */}
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between gap-2">
                        <h4 className="text-sm font-semibold text-[#242529] truncate">
                          {item.name}
                        </h4>
                        <button
                          onClick={() => removeItem(item.product_id)}
                          aria-label={`Eliminar ${item.name} del carrito`}
                          className="p-2.5 sm:p-1 rounded-md hover:bg-red-50 md:opacity-0 md:group-hover:opacity-100 transition-all touch-target"
                        >
                          <Trash2 className="w-4 h-4 sm:w-3.5 sm:h-3.5 text-red-400" />
                        </button>
                      </div>
                      <p className="text-xs text-[var(--text-secondary)]">{item.brand}</p>

                      {item.stock_status === "low_stock" && (
                        <span className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded font-medium">
                          Pocas unidades
                        </span>
                      )}

                      {/* Price + quantity */}
                      <div className="flex items-center justify-between mt-1.5">
                        <div>
                          {item.sale_price ? (
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm font-bold text-[#0E7A0E]">
                                ${item.sale_price}
                              </span>
                              <span className="text-xs text-[var(--text-secondary)] line-through">
                                ${item.price}
                              </span>
                            </div>
                          ) : (
                            <span className="text-sm font-bold text-[#242529]">
                              ${item.price}
                            </span>
                          )}
                        </div>

                        {/* Quantity controls */}
                        <div className="flex items-center gap-0.5 border border-[#E8E9EB] rounded-[10px]">
                          <button
                            onClick={() =>
                              updateQuantity(item.product_id, item.quantity - 1)
                            }
                            aria-label={`Reducir cantidad de ${item.name}`}
                            className="p-2.5 sm:p-1.5 rounded-md hover:bg-[#F7F5F0] transition-colors touch-target"
                          >
                            <Minus className="w-4 h-4 sm:w-3.5 sm:h-3.5 text-[var(--text-secondary)]" />
                          </button>
                          <span className="w-8 text-center text-sm font-medium text-[#242529]">
                            {item.quantity}
                          </span>
                          <button
                            onClick={() =>
                              updateQuantity(item.product_id, item.quantity + 1)
                            }
                            aria-label={`Aumentar cantidad de ${item.name}`}
                            className="p-2.5 sm:p-1.5 rounded-md hover:bg-[#F7F5F0] transition-colors touch-target"
                          >
                            <Plus className="w-4 h-4 sm:w-3.5 sm:h-3.5 text-[var(--text-secondary)]" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer */}
        {cart.items.length > 0 && (
          <div className="border-t border-[#E8E9EB] bg-white px-5 pt-3 pb-[calc(1.25rem+env(safe-area-inset-bottom))] space-y-3">
            {/* Subtotal */}
            <div className="flex items-center justify-between text-sm">
              <span className="text-[var(--text-secondary)]">Subtotal</span>
              <span className="font-semibold text-[#242529]">${subtotal.toFixed(2)}</span>
            </div>

            {/* Cross-sell: order bumps inteligentes (2-3 tarjetas simultáneas) */}
            <BumpCards
              cartItems={cart.items.map((i) => ({
                product_id: i.product_id,
                quantity: i.quantity,
              }))}
              selected={selectedBumps}
              onChange={setSelectedBumps}
            />

            {/* Cross-sell: "Restaurantes también compran" hints */}
            <div className="bg-[#FDF8F3] rounded-xl border border-[#F0E5D8] p-3">
              <p className="text-[11px] font-semibold text-[#B87A3A] uppercase tracking-wide mb-2">
                🔥 Restaurantes también compran
              </p>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                Complementa tu pedido con{" "}
                <Link
                  href={city ? `/${city.slug}/categoria/limpieza-cocina` : "#"}
                  onClick={() => setIsOpen(false)}
                  className="text-[#0E7A0E] font-semibold hover:underline"
                >
                  insumos de limpieza
                </Link>
                ,{" "}
                <Link
                  href={city ? `/${city.slug}/categoria/bebidas` : "#"}
                  onClick={() => setIsOpen(false)}
                  className="text-[#0E7A0E] font-semibold hover:underline"
                >
                  bebidas
                </Link>{" "}
                y{" "}
                <Link
                  href={city ? `/${city.slug}/categoria/botanas-dulces` : "#"}
                  onClick={() => setIsOpen(false)}
                  className="text-[#0E7A0E] font-semibold hover:underline"
                >
                  botanas
                </Link>{" "}
                para maximizar tu ticket.
              </p>
            </div>

            {/* Delivery fee note (flat $35, server-side) */}
            <div className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
              <Truck className="w-3.5 h-3.5" />
              <span>
                Envío a domicilio: <span className="font-semibold text-[#242529]">$35 MXN</span> por pedido
              </span>
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-1">
              <button
                onClick={clearCart}
                className="px-4 py-2.5 text-sm text-[var(--text-secondary)] hover:text-red-600 hover:bg-red-50 rounded-[10px] transition-colors shrink-0"
              >
                Vaciar
              </button>
              <button
                onClick={handleCheckout}
                className="flex-1 flex items-center justify-center gap-2 px-6 py-2.5 bg-[#0E7A0E] text-white font-semibold rounded-[10px] hover:bg-[#0D720D] transition-colors text-sm"
              >
                Ir a Checkout
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>

            {/* Continue shopping link */}
            {city && (
              <div className="flex items-center justify-center gap-4 text-xs">
                <Link
                  href={`/${city.slug}`}
                  onClick={() => setIsOpen(false)}
                  className="text-[#0E7A0E] hover:text-[#0D720D]"
                >
                  ← Seguir comprando
                </Link>
                <span className="text-[#E8E9EB]" aria-hidden="true">|</span>
                <Link
                  href="/cart"
                  onClick={() => setIsOpen(false)}
                  className="text-[#0E7A0E] font-medium hover:text-[#0D720D]"
                >
                  Ver carrito completo →
                </Link>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  )
}

/**
 * Sticky bottom bar that appears when cart has items.
 * Shows two CTAs: "Ver más productos" and "Hacer Checkout".
 * Works on both mobile and desktop.
 */
export function MobileCartBar() {
  const { itemCount, subtotal } = useCart()
  const [mounted] = useState(true)
  const { city } = useCity()

  if (!mounted || itemCount === 0) return null

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 animate-slide-up">
      <div className="flex items-center gap-3 px-4 pt-3.5 pb-[calc(0.875rem+env(safe-area-inset-bottom))] bg-white border-t border-[#E8E9EB] shadow-[0_-4px_24px_rgba(0,0,0,0.1)]">
        {/* Tap to open drawer — always visible */}
        <button
          onClick={() => window.dispatchEvent(new Event(CART_DRAWER_EVENT))}
          className="flex items-center gap-2.5 min-w-0"
        >
          <span className="bg-[#0E7A0E] text-white rounded-full w-7 h-7 flex items-center justify-center text-sm font-bold shrink-0">
            {itemCount}
          </span>
          <span className="text-sm text-[var(--text-secondary)] truncate hidden md:inline">
            Ver carrito · ${subtotal.toFixed(2)}
          </span>
          <span className="font-semibold text-sm text-[#242529] md:hidden">Ver carrito</span>
        </button>

        {/* Buttons */}
        <div className="flex items-center gap-2 ml-auto">
          <Link
            href={city ? `/${city.slug}/buscar` : "#"}
            className="px-3 sm:px-5 py-2.5 text-sm font-semibold text-[#242529] bg-[#F7F5F0] hover:bg-[#EDEAE4] rounded-[10px] transition-colors whitespace-nowrap touch-target"
          >
            Ver más productos
          </Link>
          <button
            onClick={() => window.dispatchEvent(new Event(CHECKOUT_DRAWER_EVENT))}
            className="flex items-center gap-1.5 px-3 sm:px-5 py-2.5 text-sm font-semibold text-white bg-[#0E7A0E] hover:bg-[#0D720D] rounded-[10px] transition-colors whitespace-nowrap touch-target"
          >
            Hacer Checkout
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
