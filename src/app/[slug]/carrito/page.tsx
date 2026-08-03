"use client"

import { useRouter } from "next/navigation"
import { useCart } from "@/contexts/cart-context"
import { useCity } from "@/contexts/city-context"
import {
  ShoppingBag,
  Minus,
  Plus,
  Trash2,
  Clock,
  ArrowRight,
  ArrowLeft,
  Tag,
} from "lucide-react"
import Link from "next/link"

export default function CartPage() {
  const { cart, itemCount, subtotal, discount, updateQuantity, removeItem, clearCart, coupon, removeCoupon } = useCart()
  const { city } = useCity()
  const router = useRouter()

  if (!city) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-16 text-center">
        <ShoppingBag className="w-16 h-16 text-gray-200 mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Selecciona tu ciudad</h1>
        <p className="text-gray-400">Elige una ciudad para ver tu carrito.</p>
      </div>
    )
  }

  if (itemCount === 0) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-16">
        <div className="text-center">
          <ShoppingBag className="w-20 h-20 text-gray-200 mx-auto mb-6" />
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Tu carrito está vacío</h1>
          <p className="text-gray-500 mb-8">
            Agrega productos desde el catálogo de {city.name}.
          </p>
          <Link
            href={`/${city.slug}`}
            className="inline-flex items-center gap-2 px-6 py-3 bg-brand-600 text-white font-semibold rounded-xl hover:bg-brand-700 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Ver productos
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-400 mb-6">
        <Link href={`/${city.slug}`} className="hover:text-brand-600">
          {city.name}
        </Link>
        <span>/</span>
        <span className="text-gray-600 font-medium">Carrito</span>
      </div>

      <h1 className="text-2xl font-bold text-gray-900 mb-2">Tu Carrito</h1>
      <p className="text-gray-500 text-sm mb-6">
        {itemCount} {itemCount === 1 ? "producto" : "productos"}
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Items */}
        <div className="lg:col-span-2 space-y-4">
          {cart.items.map((item) => (
            <div
              key={item.product_id}
              className="flex gap-4 p-4 bg-white rounded-xl border border-gray-200 hover:border-gray-300 transition-colors"
            >
              <div className="w-20 h-20 rounded-lg bg-brand-50 flex items-center justify-center shrink-0">
                {item.image_url ? (
                  <img src={item.image_url} alt={item.name} className="w-full h-full object-cover rounded-lg" />
                ) : (
                  <ShoppingBag className="w-7 h-7 text-brand-300" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex justify-between gap-2">
                  <div>
                    <h3 className="font-semibold text-gray-900">{item.name}</h3>
                    <p className="text-xs text-gray-400">{item.brand}</p>
                  </div>
                  <button
                    onClick={() => removeItem(item.product_id)}
                    className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                    title="Quitar"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {item.stock_status === "low_stock" && (
                  <span className="inline-block text-[11px] text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full font-medium mt-1">
                    Pocas unidades
                  </span>
                )}

                <div className="flex items-center justify-between mt-2">
                  <div>
                    {item.sale_price ? (
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-bold text-brand-600">
                          ${item.sale_price.toFixed(2)}
                        </span>
                        <span className="text-sm text-gray-400 line-through">
                          ${item.price.toFixed(2)}
                        </span>
                      </div>
                    ) : (
                      <span className="text-lg font-bold text-gray-900">
                        ${item.price.toFixed(2)}
                      </span>
                    )}
                    <p className="text-[11px] text-gray-400">
                      Subtotal: ${((item.sale_price ?? item.price) * item.quantity).toFixed(2)}
                    </p>
                  </div>

                  <div className="flex items-center gap-1 border border-gray-200 rounded-lg">
                    <button
                      onClick={() => updateQuantity(item.product_id, item.quantity - 1)}
                      className="p-2 rounded-md hover:bg-gray-100 transition-colors"
                    >
                      <Minus className="w-4 h-4 text-gray-500" />
                    </button>
                    <span className="w-10 text-center font-semibold text-gray-900 text-sm">
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => updateQuantity(item.product_id, item.quantity + 1)}
                      className="p-2 rounded-md hover:bg-gray-100 transition-colors"
                    >
                      <Plus className="w-4 h-4 text-gray-500" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}

          <Link
            href={`/${city.slug}`}
            className="inline-flex items-center gap-2 text-sm text-brand-600 hover:text-brand-700 font-medium"
          >
            <ArrowLeft className="w-4 h-4" />
            Seguir comprando
          </Link>
        </div>

        {/* Order Summary */}
        <div className="lg:col-span-1">
          <div className="sticky top-24 space-y-4">
            <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
              <h2 className="font-bold text-gray-900 text-lg">Resumen</h2>

              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Subtotal ({itemCount})</span>
                <span className="font-semibold text-gray-900">${subtotal.toFixed(2)}</span>
              </div>

              {discount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-green-600 flex items-center gap-1">
                    <Tag className="w-3.5 h-3.5" />
                    Descuento
                  </span>
                  <span className="font-semibold text-green-600">-${discount.toFixed(2)}</span>
                </div>
              )}

              <div className="flex justify-between text-sm">
                <span className="text-gray-500 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  Envío
                </span>
                <span className="text-gray-400">Calculado en checkout</span>
              </div>

              <hr className="border-gray-100" />

              <div className="flex justify-between">
                <span className="text-lg font-bold text-gray-900">Total estimado</span>
                <span className="text-lg font-bold text-brand-600">
                  ${(subtotal - discount).toFixed(2)}
                </span>
              </div>
              <p className="text-[11px] text-gray-400 text-right -mt-3">+ envío por calcular</p>

              <button
                onClick={() => router.push(`/${city.slug}/checkout`)}
                className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-brand-600 text-white font-bold rounded-xl hover:bg-brand-700 transition-colors"
              >
                Ir a Checkout
                <ArrowRight className="w-4 h-4" />
              </button>

              <button
                onClick={clearCart}
                className="w-full text-sm text-gray-400 hover:text-red-500 py-1.5 transition-colors"
              >
                Vaciar carrito
              </button>
            </div>

            {/* Coupon */}
            {coupon ? (
              <div className="bg-green-50 rounded-xl border border-green-200 p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-green-700">Cupón: {coupon.code}</p>
                  <p className="text-xs text-green-500">
                    {coupon.discount_type === "percentage"
                      ? `${coupon.discount_value}% descuento`
                      : `-$${coupon.discount_value} MXN`}
                  </p>
                </div>
                <button onClick={removeCoupon} className="text-xs text-green-600 hover:text-red-500 underline">
                  Quitar
                </button>
              </div>
            ) : (
              <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
                <p className="text-xs text-gray-500 mb-2">¿Tienes un cupón?</p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Código de cupón"
                    className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                  />
                  <button className="px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors">
                    Aplicar
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
