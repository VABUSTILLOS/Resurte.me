"use client"

import { useEffect, useState } from "react"
import { useParams, useSearchParams } from "next/navigation"
import Link from "next/link"
import {
  Clock,
  CheckCircle2,
  Package,
  Truck,
  CreditCard,
  DollarSign,
  Store,
  MessageCircle,
} from "lucide-react"
import { useCity } from "@/contexts/city-context"
import {
  STATUS_LABEL,
  PAYMENT_METHOD_LABEL,
  PAYMENT_STATUS_LABEL,
  isFinalOrderStatus,
} from "@/lib/order-labels"
import { usePolling } from "@/hooks/use-polling"
import { PageSkeleton } from "@/components/ui/page-skeleton"
import type { OrderStatus, PaymentMethod, PaymentStatus } from "@/types"

const ORDER_STATUSES: OrderStatus[] = [
  "pending",
  "confirmed",
  "preparing",
  "out_for_delivery",
  "delivered",
]

const STATUS_ICONS: Partial<Record<OrderStatus, React.ReactNode>> = {
  pending: <Clock className="w-5 h-5" />,
  confirmed: <CheckCircle2 className="w-5 h-5" />,
  preparing: <Package className="w-5 h-5" />,
  out_for_delivery: <Truck className="w-5 h-5" />,
  delivered: <CheckCircle2 className="w-5 h-5" />,
}

const STEP_HINTS = [
  "Esperando confirmación de la tienda",
  "La tienda confirmó tu pedido",
  "Están preparando tus productos",
  "Tu pedido va en camino",
  "¡Pedido entregado!",
]

const POLL_MS = 20_000

interface TrackedOrder {
  id: number
  status: OrderStatus
  payment_status: PaymentStatus
  payment_method: PaymentMethod | null
  subtotal: number
  discount: number
  delivery_fee: number
  total: number
  scheduled_for: string | null
  created_at: string
  city: { slug: string; name: string } | null
  items: { quantity: number; unit_price: number; name: string; image_url: string; slug: string }[]
}

export function TrackingClient() {
  const params = useParams()
  const searchParams = useSearchParams()
  const { city } = useCity()
  const orderId = Number(params.orderId)
  const token = searchParams.get("t")

  const [order, setOrder] = useState<TrackedOrder | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!orderId || !token) {
      setNotFound(true)
      setLoading(false)
    }
  }, [orderId, token])

  // Sigue actualizando mientras el pedido no llegue a un estado final;
  // ante error de red reintenta con backoff (2×) vía usePolling.
  usePolling(
    async () => {
      try {
        const res = await fetch(`/api/orders/${orderId}/track?t=${encodeURIComponent(token!)}`, {
          cache: "no-store",
        })
        if (res.status === 404) {
          setNotFound(true)
          return true
        }
        if (!res.ok) throw new Error(String(res.status))
        const data = (await res.json()) as { order: TrackedOrder }
        setOrder(data.order)
        return isFinalOrderStatus(data.order.status)
      } finally {
        setLoading(false)
      }
    },
    { intervalMs: POLL_MS, enabled: Boolean(orderId && token) }
  )

  if (!city || loading) {
    return <PageSkeleton titleWidth="w-52" cards={3} />
  }

  if (notFound || !order) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <Package className="w-12 h-12 text-gray-300 mx-auto mb-4" />
        <h1 className="text-lg font-semibold text-gray-500 mb-2">
          No encontramos este pedido
        </h1>
        <p className="text-sm text-gray-400 mb-6">
          El enlace puede estar incompleto o haber expirado. Si tienes cuenta,
          revisa «Mis pedidos».
        </p>
        <Link
          href={`/${city.slug}/mis-pedidos`}
          className="text-brand-600 font-medium text-sm hover:underline"
        >
          Ir a mis pedidos
        </Link>
      </div>
    )
  }

  const currentStep =
    order.status === "cancelled" ? -1 : ORDER_STATUSES.indexOf(order.status)

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Pedido #{order.id}</h1>
        <p className="text-sm text-gray-500">
          {new Date(order.created_at).toLocaleDateString("es-MX", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
          {order.city ? ` · Entrega en ${order.city.name}` : ""}
        </p>
        {!isFinalOrderStatus(order.status) && (          <p className="text-xs text-brand-600 mt-1 flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-full bg-brand-500 animate-pulse" />
            Se actualiza automáticamente
          </p>
        )}
      </div>

      {/* Status tracker */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">
          Estado del pedido
        </h2>
        {order.status === "cancelled" ? (
          <div className="text-center py-4">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-red-50 text-red-700 rounded-full text-sm font-medium border border-red-200 mb-2">
              Pedido cancelado
            </div>
            <p className="text-xs text-gray-500">
              Este pedido fue cancelado. Si tienes dudas, contacta a soporte.
            </p>
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
                        isDone
                          ? "bg-brand-600 text-white"
                          : "bg-gray-200 text-gray-400"
                      } ${isCurrent ? "ring-4 ring-brand-100" : ""}`}
                    >
                      {STATUS_ICONS[status]}
                    </div>
                    {i < ORDER_STATUSES.length - 1 && (
                      <div
                        className={`w-0.5 h-8 ${i < currentStep ? "bg-brand-600" : "bg-gray-200"}`}
                      />
                    )}
                  </div>
                  <div className="pb-6 pt-1">
                    <p
                      className={`text-sm font-semibold ${isDone ? "text-gray-900" : "text-gray-400"}`}
                    >
                      {STATUS_LABEL[status]}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">{STEP_HINTS[i]}</p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Items */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">
          Productos ({order.items.length})
        </h2>
        <ul className="divide-y divide-gray-100">
          {order.items.map((item, i) => (
            <li key={i} className="flex justify-between py-2 first:pt-0 last:pb-0">
              <span className="text-sm text-gray-700">
                {item.quantity}× {item.name}
              </span>
              <span className="text-sm font-medium text-gray-900">
                ${(item.unit_price * item.quantity).toFixed(2)}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* Info grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-start gap-3">
          <Clock className="w-4 h-4 text-gray-400 mt-0.5" />
          <div>
            <p className="text-xs text-gray-400">Entrega programada</p>
            <p className="text-sm font-medium text-gray-900">
              {order.scheduled_for
                ? new Date(order.scheduled_for).toLocaleDateString("es-MX", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                  })
                : "A la brevedad"}
            </p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-start gap-3">
          <CreditCard className="w-4 h-4 text-gray-400 mt-0.5" />
          <div>
            <p className="text-xs text-gray-400">Método de pago</p>
            <p className="text-sm font-medium text-gray-900">
              {PAYMENT_METHOD_LABEL[order.payment_method ?? "cash_on_delivery"]}
            </p>
            <p className="text-xs text-brand-600 font-medium">
              {PAYMENT_STATUS_LABEL[order.payment_status]}
            </p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-start gap-3 sm:col-span-2">
          <DollarSign className="w-4 h-4 text-gray-400 mt-0.5" />
          <div>
            <p className="text-xs text-gray-400">Total</p>
            <p className="text-sm font-bold text-brand-600">
              ${order.total.toFixed(2)}
            </p>
            <p className="text-xs text-gray-400">
              Subtotal ${order.subtotal.toFixed(2)}
              {order.discount > 0 ? ` − Descuento $${order.discount.toFixed(2)}` : ""}
              {" "}+ Envío ${order.delivery_fee.toFixed(2)}
            </p>
          </div>
        </div>
      </div>

      <div className="flex gap-3">
        <Link
          href={`/${city.slug}`}
          className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-brand-600 text-white font-bold rounded-xl hover:bg-brand-700 transition-colors"
        >
          <Store className="w-4 h-4" />
          {order.status === "delivered" ? "Volver a comprar" : "Seguir comprando"}
        </Link>
        <a
          href={`https://wa.me/${process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? ""}?text=${encodeURIComponent(
            `Hola, tengo una duda sobre mi pedido #${order.id} en Resurte.me`
          )}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-gray-100 text-gray-700 font-semibold rounded-xl hover:bg-gray-200 transition-colors"
        >
          <MessageCircle className="w-4 h-4" />
          Ayuda con mi pedido
        </a>
      </div>
    </div>
  )
}
