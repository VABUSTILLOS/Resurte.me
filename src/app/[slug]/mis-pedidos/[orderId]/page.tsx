"use client"

import { useParams } from "next/navigation"
import { useEffect, useState } from "react"
import { useCity } from "@/contexts/city-context"
import {
  STATUS_LABEL,
  PAYMENT_METHOD_LABEL,
  PAYMENT_STATUS_LABEL,
} from "@/lib/mock-orders"
import { createClient } from "@/lib/supabase/client"
import { ArrowLeft, Package, MapPin, Clock, CreditCard, DollarSign, Store, Truck, CheckCircle2, Circle } from "lucide-react"
import Link from "next/link"
import type { OrderStatus, OrderWithCashback, OrderItem } from "@/types"

const ORDER_STATUSES: OrderStatus[] = ["pending", "confirmed", "preparing", "out_for_delivery", "delivered"]

const STATUS_ICONS: Record<OrderStatus, React.ReactNode> = {
  pending: <Clock className="w-5 h-5" />,
  confirmed: <CheckCircle2 className="w-5 h-5" />,
  preparing: <Package className="w-5 h-5" />,
  out_for_delivery: <Truck className="w-5 h-5" />,
  delivered: <CheckCircle2 className="w-5 h-5" />,
  cancelled: <Circle className="w-5 h-5" />,
}

interface OrderDetail extends OrderWithCashback {
  items: (OrderItem & {
    product_name: string
    product_image: string
  })[]
}

interface OrderRow extends OrderWithCashback {
  order_items: (OrderItem & {
    products: { id: number; name: string; image_url: string | null; slug: string } | null
  })[]
}

export default function OrderDetailPage() {
  const params = useParams()
  const { city } = useCity()
  const orderId = Number(params.orderId)

  const [order, setOrder] = useState<OrderDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [supabase] = useState(() =>
    typeof window === "undefined" ? null : createClient()
  )

  useEffect(() => {
    let cancelled = false

    async function fetchOrder() {
      if (!supabase || !orderId) {
        setLoading(false)
        return
      }

      try {
        const {
          data: { session },
        } = await supabase.auth.getSession()
        if (!session?.user?.id) {
          setLoading(false)
          return
        }

        const { data, error } = await supabase
          .from("orders")
          .select(
            "*, order_items(*, products(id, name, image_url, slug))"
          )
          .eq("user_id", session.user.id)
          .eq("id", orderId)
          .single()

        if (error || !data) {
          setLoading(false)
          return
        }

        if (cancelled) return

        const { order_items, ...row } = data as OrderRow
        const items = (order_items ?? []).map((item) => ({
          id: item.id,
          order_id: item.order_id,
          product_id: item.product_id,
          quantity: item.quantity,
          unit_price: item.unit_price,
          product_name: item.products?.name || `Producto #${item.product_id}`,
          product_image: item.products?.image_url || "",
        }))
        setOrder({ ...row, items })
      } catch {
        // Keep defaults
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchOrder()

    return () => {
      cancelled = true
    }
  }, [supabase, orderId])

  if (!city) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <p className="text-gray-500">Cargando...</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <p className="text-gray-500">Cargando pedido...</p>
      </div>
    )
  }

  if (!order) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <Package className="w-12 h-12 text-gray-300 mx-auto mb-4" />
        <h2 className="text-lg font-semibold text-gray-500 mb-2">Pedido no encontrado</h2>
        <Link href={`/${city.slug}/mis-pedidos`} className="text-brand-600 font-medium text-sm hover:underline">
          Volver a mis pedidos
        </Link>
      </div>
    )
  }

  const currentStep = order.status === "cancelled" ? -1 : ORDER_STATUSES.indexOf(order.status)

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center gap-3 mb-6">
        <Link href={`/${city.slug}/mis-pedidos`} className="p-2 -ml-2 rounded-lg hover:bg-gray-100">
          <ArrowLeft className="w-5 h-5 text-gray-500" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Pedido #{order.id}</h1>
          <p className="text-sm text-gray-500">
            {new Date(order.created_at).toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" })}
          </p>
        </div>
      </div>

      {/* Status tracker */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Estado del pedido</h2>
        {order.status === "cancelled" ? (
          <div className="text-center py-4">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-red-50 text-red-700 rounded-full text-sm font-medium border border-red-200 mb-2">
              Pedido cancelado
            </div>
            <p className="text-xs text-gray-500">Este pedido fue cancelado. Si tienes dudas, contacta a soporte.</p>
          </div>
        ) : (
          <div className="relative">
            {ORDER_STATUSES.map((status, i) => {
              const isDone = i <= currentStep
              const isCurrent = i === currentStep
              return (
                <div key={status} className="flex items-start gap-3">
                  <div className="flex flex-col items-center">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center ${
                        isDone ? "bg-brand-600 text-white" : "bg-gray-200 text-gray-400"
                      } ${isCurrent ? "ring-4 ring-brand-100" : ""}`}
                    >
                      {STATUS_ICONS[status]}
                    </div>
                    {i < ORDER_STATUSES.length - 1 && (
                      <div className={`w-0.5 h-8 ${i < currentStep ? "bg-brand-600" : "bg-gray-200"}`} />
                    )}
                  </div>
                  <div className="pb-6 pt-1">
                    <p className={`text-sm font-semibold ${isDone ? "text-gray-900" : "text-gray-400"}`}>
                      {STATUS_LABEL[status]}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {i === 0 && "Esperando confirmación de la tienda"}
                      {i === 1 && "La tienda confirmó tu pedido"}
                      {i === 2 && "Están preparando tus productos"}
                      {i === 3 && "Tu pedido va en camino"}
                      {i === 4 && "¡Pedido entregado!"}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Items */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Productos ({order.items.length})</h2>
        <ul className="divide-y divide-gray-100">
          {order.items.map((item) => (
            <li key={item.id} className="flex justify-between py-2 first:pt-0 last:pb-0">
              <span className="text-sm text-gray-700">{item.quantity}× {item.product_name}</span>
              <span className="text-sm font-medium text-gray-900">${(item.unit_price * item.quantity).toFixed(2)}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Info grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-start gap-3">
          <MapPin className="w-4 h-4 text-gray-400 mt-0.5" />
          <div>
            <p className="text-xs text-gray-400">Dirección de entrega</p>
            <p className="text-sm font-medium text-gray-900">{city.name}, México</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-start gap-3">
          <Clock className="w-4 h-4 text-gray-400 mt-0.5" />
          <div>
            <p className="text-xs text-gray-400">Entrega programada</p>
            <p className="text-sm font-medium text-gray-900">
              {order.scheduled_for ? new Date(order.scheduled_for).toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" }) : "A la brevedad"}
            </p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-start gap-3">
          <CreditCard className="w-4 h-4 text-gray-400 mt-0.5" />
          <div>
            <p className="text-xs text-gray-400">Método de pago</p>
            <p className="text-sm font-medium text-gray-900">{PAYMENT_METHOD_LABEL[order.payment_method ?? "cash_on_delivery"]}</p>
            <p className="text-xs text-brand-600 font-medium">{PAYMENT_STATUS_LABEL[order.payment_status]}</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-start gap-3">
          <DollarSign className="w-4 h-4 text-gray-400 mt-0.5" />
          <div>
            <p className="text-xs text-gray-400">Total</p>
            <p className="text-sm font-bold text-brand-600">${order.total.toFixed(2)}</p>
            <p className="text-xs text-gray-400">Subtotal ${order.subtotal.toFixed(2)} + Envío ${order.delivery_fee.toFixed(2)}</p>
          </div>
        </div>
      </div>

      <div className="flex gap-3">
        {order.status === "delivered" && (
          <Link
            href={`/${city.slug}`}
            className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-brand-600 text-white font-bold rounded-xl hover:bg-brand-700 transition-colors"
          >
            <Store className="w-4 h-4" />
            Volver a comprar
          </Link>
        )}
        <Link
          href={`/${city.slug}/mis-pedidos`}
          className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-gray-100 text-gray-700 font-semibold rounded-xl hover:bg-gray-200 transition-colors"
        >
          Mis pedidos
        </Link>
      </div>
    </div>
  )
}
