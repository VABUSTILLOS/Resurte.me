"use client"

import { useState } from "react"
import { useCity } from "@/contexts/city-context"
import { useCart } from "@/contexts/cart-context"
import { generateMockOrders, STATUS_LABEL, STATUS_COLOR, PAYMENT_METHOD_LABEL, type MockOrder } from "@/lib/mock-orders"
import { Package, Clock, ChevronRight, ArrowLeft, RotateCcw, ShoppingCart } from "lucide-react"
import Link from "next/link"

export default function OrderHistoryPage() {
  const { city } = useCity()
  const { addItem } = useCart()
  const [orders] = useState<MockOrder[]>(() => generateMockOrders(6))
  const [reorderingId, setReorderingId] = useState<number | null>(null)

  const handleRepeatOrder = (order: MockOrder, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setReorderingId(order.id)

    // Add all items from the order to the cart
    order.items.forEach((item) => {
      addItem({
        product_id: item.product_id,
        store_id: order.store_id,
        store_name: order.store_name,
        store_slug: order.store_slug,
        name: item.product_name || `Producto #${item.product_id}`,
        slug: `producto-${item.product_id}`,
        image_url: item.product_image || "",
        brand: "",
        price: item.unit_price,
        sale_price: null,
        quantity: item.quantity,
        stock_status: "in_stock",
      })
    })

    setTimeout(() => setReorderingId(null), 1500)
  }

  if (!city) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <p className="text-gray-500">Cargando...</p>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link href={`/${city.slug}`} className="p-2 -ml-2 rounded-lg hover:bg-gray-100">
          <ArrowLeft className="w-5 h-5 text-gray-500" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Mis pedidos</h1>
          <p className="text-sm text-gray-500">{city.name}</p>
        </div>
      </div>

      {orders.length === 0 ? (
        <div className="text-center py-16">
          <Package className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-gray-500 mb-2">Sin pedidos aún</h2>
          <p className="text-sm text-gray-400 mb-6">
            Tus pedidos aparecerán aquí cuando realices tu primera compra.
          </p>
          <Link
            href={`/${city.slug}`}
            className="inline-flex items-center gap-2 px-6 py-3 bg-brand-600 text-white font-bold rounded-xl hover:bg-brand-700 transition-colors"
          >
            Explorar productos
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map((order) => (
            <Link
              key={order.id}
              href={`/${city.slug}/mis-pedidos/${order.id}`}
              className="block bg-white rounded-xl border border-gray-200 p-4 hover:border-brand-300 hover:shadow-sm transition-all"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div>
                    <p className="font-semibold text-gray-900 text-sm">
                      Pedido #{order.id}
                    </p>
                    <p className="text-xs text-gray-400">
                      {new Date(order.created_at).toLocaleDateString("es-MX", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-300" />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <span>{order.items.length} producto{order.items.length !== 1 ? "s" : ""}</span>
                  <span>·</span>
                  <span>{PAYMENT_METHOD_LABEL[order.payment_method]}</span>
                  {order.source === "whatsapp" && (
                    <>
                      <span>·</span>
                      <span className="text-green-600 font-medium">WhatsApp</span>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {/* Repeat Order button */}
                  <button
                    onClick={(e) => handleRepeatOrder(order, e)}
                    disabled={reorderingId === order.id}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-brand-600 bg-brand-50 hover:bg-brand-100 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {reorderingId === order.id ? (
                      <>
                        <ShoppingCart className="w-3.5 h-3.5" />
                        ¡Agregado!
                      </>
                    ) : (
                      <>
                        <RotateCcw className="w-3.5 h-3.5" />
                        Repetir
                      </>
                    )}
                  </button>
                  <span className="text-sm font-bold text-gray-900">
                    ${order.total.toFixed(2)}
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_COLOR[order.status]}`}
                  >
                    {order.status === "out_for_delivery" && <Clock className="w-3 h-3" />}
                    {STATUS_LABEL[order.status]}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
