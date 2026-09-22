"use client"

import { useParams } from "next/navigation"
import { useState } from "react"
import { useCity } from "@/contexts/city-context"
import {
  STATUS_LABEL,
  PAYMENT_METHOD_LABEL,
  PAYMENT_STATUS_LABEL,
  isFinalOrderStatus,
} from "@/lib/order-labels"
import { usePolling } from "@/hooks/use-polling"
import { createClient } from "@/lib/supabase/client"
import { ArrowLeft, Package, MapPin, Clock, CreditCard, DollarSign, Store, Truck, CheckCircle2, Circle, XCircle } from "lucide-react"
import Link from "next/link"
import { PageSkeleton } from "@/components/ui/page-skeleton"
import { CompletePaymentButton } from "@/components/stripe/complete-payment-button"
import { RepeatOrderButton } from "@/components/shop/repeat-order-button"
import {
  CANCEL_REFUSAL_MESSAGE,
  customerCancelRefusal,
} from "@/lib/order-cancellation"
import type { OrderStatus, OrderWithCashback, OrderItem } from "@/types"
import { PUBLIC_ORDERS_DETAIL_SELECT } from "@/lib/sensitive-columns"

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
  address?: {
    id: number
    label: string
    street: string
    number: string
    interior: string | null
    neighborhood: string
    city: string
    state: string
    zip_code: string
    references: string | null
  } | null
  items: (OrderItem & {
    product_name: string
    product_image: string
  })[]
}

interface OrderRow extends OrderWithCashback {
  // Supabase devuelve la relación anidada con la clave del nombre de tabla.
  // `orders.address_id` es una relación **de a uno**, así que en tiempo de
  // ejecución PostgREST manda un objeto; supabase-js, sin tipos generados,
  // tipa todo embed como arreglo. Por eso el `as unknown as OrderRow` de
  // abajo: el tipo de aquí es el que devuelve el servidor de verdad.
  addresses?: {
    id: number
    label: string
    street: string
    number: string
    interior: string | null
    neighborhood: string
    city: string
    state: string
    zip_code: string
    references: string | null
  } | null
  order_items: (OrderItem & {
    products: { id: number; name: string; image_url: string | null; slug: string } | null
  })[]
}

export function OrderDetailClient() {
  const params = useParams()
  const { city } = useCity()
  const orderId = Number(params.orderId)

  const [order, setOrder] = useState<OrderDetail | null>(null)
  const [supabase] = useState(() =>
    typeof window === "undefined" ? null : createClient()
  )
  // loading arranca en false si no hay sesión/id (antes lo hacía un efecto);
  // si los params cambian tras el mount se ajusta durante el render.
  const [loading, setLoading] = useState(() => Boolean(supabase && orderId))
  const canQuery = Boolean(supabase && orderId)
  const [prevCanQuery, setPrevCanQuery] = useState(canQuery)
  if (canQuery !== prevCanQuery) {
    setPrevCanQuery(canQuery)
    if (!canQuery) setLoading(false)
  }

  const [confirmingCancel, setConfirmingCancel] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [cancelError, setCancelError] = useState<string | null>(null)

  // Actualización en vivo: mientras el pedido no llegue a un estado final,
  // re-consulta cada 25s para mover el stepper sin recargar. Ante un error
  // de red el polling se detiene (errorIntervalMs: null), como antes.
  usePolling(
    async () => {
      if (!supabase || !orderId) return true

      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session?.user?.id) {
        setLoading(false)
        return true
      }

      try {
        const { data, error } = await supabase
          .from("orders")
          // Columnas explícitas: `select("*")` pediría también los `stripe_*` y
          // el `restore_token`, que `00195` revocó de `authenticated`, y
          // PostgREST falla la consulta entera con `42501` en vez de devolver
          // una fila incompleta.
          .select(PUBLIC_ORDERS_DETAIL_SELECT)
          .eq("user_id", session.user.id)
          .eq("id", orderId)
          .single()

        if (error || !data) {
          setLoading(false)
          return true
        }

        const { order_items, addresses, ...row } = data as unknown as OrderRow
        const items = (order_items ?? []).map((item) => ({
          id: item.id,
          order_id: item.order_id,
          product_id: item.product_id,
          quantity: item.quantity,
          unit_price: item.unit_price,
          product_name: item.products?.name || `Producto #${item.product_id}`,
          product_image: item.products?.image_url || "",
        }))
        setOrder({ ...row, address: addresses ?? null, items })
        return isFinalOrderStatus(row.status)
      } finally {
        setLoading(false)
      }
    },
    { intervalMs: 25_000, errorIntervalMs: null }
  )

  // La regla la decide el mismo módulo que la API: si la UI y el servidor
  // tuvieran dos reglas, la UI ofrecería un botón que la API rechaza.
  const cancelRefusal = order
    ? customerCancelRefusal(order.status, order.payment_status)
    : null

  const handleCancel = async () => {
    if (!order) return
    setCancelling(true)
    setCancelError(null)
    try {
      // Sin token: aquí el cliente ya tiene sesión, y la ruta acepta el
      // `user_id` del pedido como autorización.
      const res = await fetch(`/api/orders/${order.id}/cancel`, { method: "POST" })
      const data = (await res.json().catch(() => null)) as {
        error?: string
        order?: { payment_status: OrderWithCashback["payment_status"] }
      } | null
      if (!res.ok) {
        setCancelError(data?.error ?? "No pudimos cancelar el pedido. Intenta de nuevo.")
        return
      }
      setOrder((prev) =>
        prev
          ? {
              ...prev,
              status: "cancelled",
              payment_status: data?.order?.payment_status ?? prev.payment_status,
            }
          : prev
      )
      setConfirmingCancel(false)
    } catch {
      setCancelError("No pudimos cancelar el pedido. Revisa tu conexión e intenta de nuevo.")
    } finally {
      setCancelling(false)
    }
  }

  if (!city) {
    return <PageSkeleton />
  }

  if (loading) {
    return <PageSkeleton titleWidth="w-52" cards={3} />
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
        <Link href={`/${city.slug}/mis-pedidos`} className="p-2 -ml-2 rounded-lg hover:bg-gray-100 touch-target" aria-label="Volver a mis pedidos">
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
            {/* Cancelar no es el final del recorrido: la forma honesta de
                «modificar» un pedido es volver a pedirlo. Sin esto el cliente
                quedaba en un callejón sin salida. */}
            {order.items.length > 0 && (
              <div className="mt-4 max-w-xs mx-auto space-y-2">
                <p className="text-xs text-gray-500">
                  ¿Te equivocaste en algo? Vuelve a armar el pedido con los mismos productos.
                </p>
                <RepeatOrderButton orderId={order.id} items={order.items} prominent />
              </div>
            )}
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
                        isDone ? "bg-brand-600 text-white" : "bg-gray-200 text-gray-600"
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
            {order.address ? (
              <>
                <p className="text-sm font-medium text-gray-900">
                  {order.address.street} {order.address.number}
                  {order.address.interior ? `, Int. ${order.address.interior}` : ""}
                </p>
                <p className="text-xs text-gray-500">
                  {order.address.neighborhood
                    ? `Col. ${order.address.neighborhood}, `
                    : ""}
                  CP {order.address.zip_code}
                </p>
                <p className="text-xs text-gray-500">
                  {order.address.city}, {order.address.state}
                </p>
              </>
            ) : (
              <p className="text-sm font-medium text-gray-900">{city.name}, México</p>
            )}
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
            <p className="text-xs text-gray-400">
              Subtotal ${order.subtotal.toFixed(2)}
              {order.discount ? ` − Descuento $${order.discount.toFixed(2)}` : ""}
              {" "}+ Envío ${order.delivery_fee.toFixed(2)}
            </p>
          </div>
        </div>
      </div>

      {/* Pago pendiente con tarjeta: permite completar el cobro aquí mismo */}
      {order.payment_status === "pending" &&
        order.payment_method === "card" &&
        order.status !== "cancelled" && (
          <div className="mb-4">
            <CompletePaymentButton orderId={order.id} amount={order.total} />
            <p className="mt-2 text-xs text-center text-gray-400">
              Tu pedido se confirma cuando el pago se complete.
            </p>
          </div>
        )}

      {/* Cancelación por el propio cliente. Solo se ofrece mientras el pedido
          no haya salido a reparto y no haya dinero cobrado o en vuelo; en
          cualquier otro caso se explica por qué, en vez de esconder el botón.
          Esta es la puerta del cliente con sesión: la de la página de
          seguimiento exige el token del enlace. */}
      {order.status !== "cancelled" && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
          {cancelRefusal ? (
            <p className="text-xs text-gray-600">{CANCEL_REFUSAL_MESSAGE[cancelRefusal]}</p>
          ) : confirmingCancel ? (
            <div>
              <p className="text-sm font-semibold text-gray-900 mb-1">
                ¿Cancelar el pedido #{order.id}?
              </p>
              <p className="text-xs text-gray-600 mb-3">
                Liberamos los productos que teníamos apartados para ti. No se puede deshacer.
              </p>
              {cancelError && (
                <p role="alert" className="text-xs text-red-700 mb-2">
                  {cancelError}
                </p>
              )}
              <div className="flex flex-col sm:flex-row gap-2">
                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={cancelling}
                  className="min-h-[44px] px-4 py-3 bg-red-600 text-white text-sm font-bold rounded-xl hover:bg-red-700 transition-colors disabled:opacity-60"
                >
                  {cancelling ? "Cancelando…" : "Sí, cancelar el pedido"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setConfirmingCancel(false)
                    setCancelError(null)
                  }}
                  disabled={cancelling}
                  className="min-h-[44px] px-4 py-3 bg-gray-100 text-gray-700 text-sm font-semibold rounded-xl hover:bg-gray-200 transition-colors disabled:opacity-60"
                >
                  Conservar el pedido
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <p className="text-xs text-gray-600">
                ¿Ya no lo necesitas? Puedes cancelarlo tú mismo mientras no salga a reparto.
              </p>
              <button
                type="button"
                onClick={() => setConfirmingCancel(true)}
                className="min-h-[44px] shrink-0 inline-flex items-center justify-center gap-2 px-4 py-3 bg-gray-100 text-gray-700 text-sm font-semibold rounded-xl hover:bg-gray-200 transition-colors"
              >
                <XCircle className="w-4 h-4" />
                Cancelar pedido
              </button>
            </div>
          )}
        </div>
      )}

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
