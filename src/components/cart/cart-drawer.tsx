"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useCart } from "@/contexts/cart-context"
import { useCity } from "@/contexts/city-context"
import {
  X,
  ShoppingBag,
  Minus,
  Plus,
  Trash2,
  Clock,
  ArrowRight,
} from "lucide-react"
import Link from "next/link"

// Global event bus to control drawer from header
export const CART_DRAWER_EVENT = "resurte:toggle-cart-drawer"

export function CartDrawer() {
  const [isOpen, setIsOpen] = useState(false)
  const { cart, itemCount, subtotal, removeItem, updateQuantity, clearCart } = useCart()
  const { city } = useCity()
  const router = useRouter()

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
    setIsOpen(false)
    if (city) router.push(`/${city.slug}/checkout`)
  }

  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm transition-opacity"
        onClick={() => setIsOpen(false)}
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-md bg-white shadow-2xl flex flex-col animate-slide-in-right">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E8E9EB]">
          <div className="flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-[#108910]" />
            <h2 className="text-lg font-bold text-[#242529]">
              Mi Carrito
            </h2>
            {itemCount > 0 && (
              <span className="text-sm text-[#72767E]">
                ({itemCount} {itemCount === 1 ? "producto" : "productos"})
              </span>
            )}
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="p-2 rounded-[10px] hover:bg-[#F7F5F0] transition-colors"
          >
            <X className="w-5 h-5 text-[#72767E]" />
          </button>
        </div>

        {/* Store info */}
        {cart.store_name && (
          <div className="px-5 py-2.5 bg-[#F6FDF6] border-b border-brand-100">
            <p className="text-xs text-brand-700 flex items-center gap-1">
              <ShoppingBag className="w-3.5 h-3.5" />
              De: <span className="font-semibold">{cart.store_name}</span>
            </p>
          </div>
        )}

        {/* Items */}
        <div className="flex-1 overflow-y-auto px-5">
          {cart.items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-[#8F939B] gap-3 pb-12">
            <ShoppingBag className="w-16 h-16 text-[#E8E9EB]" />
            <p className="text-lg font-medium text-[#72767E]">Tu carrito está vacío</p>
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
                          className="p-1 rounded hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-red-400" />
                        </button>
                      </div>
                      <p className="text-xs text-[#8F939B]">{item.brand}</p>

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
                              <span className="text-sm font-bold text-[#108910]">
                                ${item.sale_price}
                              </span>
                              <span className="text-xs text-[#8F939B] line-through">
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
                            className="p-1.5 rounded-md hover:bg-[#F7F5F0] transition-colors"
                          >
                            <Minus className="w-3.5 h-3.5 text-[#72767E]" />
                          </button>
                          <span className="w-8 text-center text-sm font-medium text-[#242529]">
                            {item.quantity}
                          </span>
                          <button
                            onClick={() =>
                              updateQuantity(item.product_id, item.quantity + 1)
                            }
                            className="p-1.5 rounded-md hover:bg-[#F7F5F0] transition-colors"
                          >
                            <Plus className="w-3.5 h-3.5 text-[#72767E]" />
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
          <div className="border-t border-[#E8E9EB] bg-white px-5 pt-3 pb-5 space-y-3">
            {/* Subtotal */}
            <div className="flex items-center justify-between text-sm">
              <span className="text-[#72767E]">Subtotal</span>
              <span className="font-semibold text-[#242529]">${subtotal.toFixed(2)}</span>
            </div>

            {/* Delivery estimate */}
            <div className="flex items-center gap-1.5 text-xs text-[#8F939B]">
              <Clock className="w-3 h-3" />
              <span>Envío calculado en el checkout</span>
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-1">
              <button
                onClick={clearCart}
                className="px-4 py-2.5 text-sm text-[#72767E] hover:text-red-600 hover:bg-red-50 rounded-[10px] transition-colors shrink-0"
              >
                Vaciar
              </button>
              <button
                onClick={handleCheckout}
                className="flex-1 flex items-center justify-center gap-2 px-6 py-2.5 bg-[#108910] text-white font-semibold rounded-[10px] hover:bg-[#0D720D] transition-colors text-sm"
              >
                Ir a Checkout
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>

            {/* Continue shopping link */}
            {city && (
              <Link
                href={`/${city.slug}`}
                onClick={() => setIsOpen(false)}
                className="block text-center text-xs text-[#108910] hover:text-[#0D720D]"
              >
                ← Seguir comprando
              </Link>
            )}
          </div>
        )}
      </div>

      {/* Slide-in animation */}
      <style jsx>{`
        @keyframes slideInRight {
          from {
            transform: translateX(100%);
          }
          to {
            transform: translateX(0);
          }
        }
        .animate-slide-in-right {
          animation: slideInRight 0.25s ease-out;
        }
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        .animate-slide-up {
          animation: slideUp 0.3s cubic-bezier(0, 0, 0, 1);
        }
      `}</style>
    </>
  )
}

/**
 * Cornershop-style sticky bottom bar for mobile.
 * Shows item count + total + "Ver carrito" CTA.
 */
export function MobileCartBar() {
  const { cart, itemCount, subtotal } = useCart()
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  if (!mounted || itemCount === 0) return null

  const toggleDrawer = () => {
    window.dispatchEvent(new Event(CART_DRAWER_EVENT))
  }

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 animate-slide-up">
      <button
        onClick={toggleDrawer}
        className="w-full flex items-center justify-between px-4 py-3.5 bg-[#108910] text-white shadow-[0_-4px_24px_rgba(0,0,0,0.15)] active:bg-[#0D720D] transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <span className="bg-white/20 rounded-full w-7 h-7 flex items-center justify-center text-sm font-bold">
            {itemCount}
          </span>
          <span className="font-semibold text-[15px]">
            Ver carrito
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="font-bold text-[15px]">${subtotal.toFixed(2)}</span>
          <ArrowRight className="w-4 h-4" />
        </div>
      </button>
    </div>
  )
}
