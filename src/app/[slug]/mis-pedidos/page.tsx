"use client"

import { useEffect, useState } from "react"
import { useCity } from "@/contexts/city-context"
import { STATUS_LABEL, STATUS_COLOR, PAYMENT_METHOD_LABEL } from "@/lib/order-labels"
import { getUserPurchaseHistory } from "@/lib/wallet-actions"
import type { OrderWithCashback, OrderItem } from "@/types"
import { Package, Clock, ChevronRight, ArrowLeft } from "lucide-react"
import { RepeatOrderButton } from "@/components/shop/repeat-order-button"
import { formatDistanceToNow } from "date-fns"
import { es } from "date-fns/locale"
import Link from "next/link"
import { PageSkeleton } from "@/components/ui/page-skeleton"

interface OrderWithItems extends OrderWithCashback {
  items: (OrderItem & {
    product_name: string
    product_image: string
  })[]
}

export default function OrderHistoryPage() {
  const { city } = useCity()
  const [orders, setOrders] = useState<OrderWithItems[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function fetchOrders() {
      try {
        const all: OrderWithItems[] = []
        let page = 0
        for (;;) {
          const { orders, hasMore } = await getUserPurchaseHistory(page, 50)
          all.push(...orders)
          if (!hasMore) break
          page += 1
        }
        if (!cancelled) setOrders(all)
      } catch {
        // Keep defaults
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchOrders()

    return () => {
      cancelled = true
    }
  }, [])


  if (!city) {
    return <PageSkeleton />
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link href={`/${city.slug}`} className="p-2 -ml-2 rounded-lg hover:bg-gray-100 touch-target" aria-label="Volver a inicio">
          <ArrowLeft className="w-5 h-5 text-gray-500" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Mis pedidos</h1>
          <p className="text-sm text-gray-500">{city.name}</p>
        </div>
      </div>

      {loading ? (
        <PageSkeleton titleWidth="w-52" cards={3} />
      ) : orders.length === 0 ? (
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
          {orders.map((order) => {
            const orderDate = new Date(order.created_at)
            const absoluteDate = orderDate.toLocaleDateString("es-MX", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })
            // Fecha relativa ("hace 3 días"): más escaneable que la absoluta
            // para reconocer el último pedido de un vistazo.
            const relativeDate = formatDistanceToNow(orderDate, { addSuffix: true, locale: es })
            return (
            <Link
              key={order.id}
              href={`/${city.slug}/mis-pedidos/${order.id}`}
              aria-label={`Ver detalle del pedido #${order.id} de ${absoluteDate}, total $${order.total.toFixed(2)}`}
              className="block bg-white rounded-xl border border-gray-200 p-4 hover:border-brand-300 hover:shadow-sm transition-all"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div>
                    <p className="font-semibold text-gray-900 text-sm">
                      Pedido #{order.id}
                    </p>
                    <p className="text-xs text-gray-400">
                      <span className="capitalize">{relativeDate}</span>
                      <span aria-hidden="true"> · </span>
                      <span className="sr-only">Fecha: </span>
                      {absoluteDate}
                    </p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-300" />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <span>{order.items.length} producto{order.items.length !== 1 ? "s" : ""}</span>
                  <span>·</span>
                  <span>{PAYMENT_METHOD_LABEL[order.payment_method ?? "cash_on_delivery"]}</span>
                  {order.source === "whatsapp" && (
                    <>
                      <span>·</span>
                      <span className="text-green-600 font-medium">WhatsApp</span>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {/* Badge de pago pendiente: avisa que falta completar el cobro con tarjeta */}
                  {order.payment_status === "pending" && order.payment_method === "card" && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                      <Clock className="w-3 h-3" />
                      Pago pendiente
                    </span>
                  )}
                  {/* Repetir pedido: misma implementación que las dos
                      superficies de cancelación (ver order-reorder.ts). */}
                  <RepeatOrderButton orderId={order.id} items={order.items} />
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
            )
          })}
        </div>
      )}
    </div>
  )
}
