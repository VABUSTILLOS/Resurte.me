"use client"

import { useEffect, useState } from "react"
import { useCity } from "@/contexts/city-context"
import { useCart } from "@/contexts/cart-context"
import { STATUS_LABEL, STATUS_COLOR, PAYMENT_METHOD_LABEL } from "@/lib/order-labels"
import { getUserPurchaseHistory } from "@/lib/wallet-actions"
import { useToast } from "@/components/toast"
import type { OrderWithCashback, OrderItem, CartItem } from "@/types"
import { Package, Clock, ChevronRight, ArrowLeft, RotateCcw, ShoppingCart } from "lucide-react"
import { AnalyticsEvents } from "@/lib/analytics"
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
  const { addOrderItems } = useCart()
  const { toast } = useToast()
  const [orders, setOrders] = useState<OrderWithItems[]>([])
  const [loading, setLoading] = useState(true)
  const [reorderingId, setReorderingId] = useState<number | null>(null)

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

  const handleRepeatOrder = async (order: OrderWithItems, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setReorderingId(order.id)

    // Rehidratar con el catálogo ACTUAL (precio, oferta, stock, slug): el
    // servidor recalcula el subtotal contra la BD y rechaza la orden si no
    // coincide al centavo, así que agregar con el precio histórico congelado
    // hacía fallar "Repetir" en cuanto cambiaba cualquier precio.
    const ids = order.items.map((i) => i.product_id)
    const currentById = new Map<number, {
      name: string
      slug: string
      image_url: string | null
      price: number
      sale_price: number | null
      stock_status: "in_stock" | "low_stock" | "out_of_stock"
      brand: string | null
    }>()
    let catalogFailed = false
    try {
      const { createClient } = await import("@/lib/supabase/client")
      const supabase = createClient()
      if (!supabase) throw new Error("no supabase client")
      const { data: current, error: catalogError } = await supabase
        .from("products")
        .select("id, name, slug, image_url, price, sale_price, stock_status, brand")
        .in("id", ids)
      if (catalogError) throw catalogError
      for (const p of current ?? []) {
        currentById.set(p.id, p)
      }
    } catch {
      // Si el catálogo no responde, se cae al snapshot de la orden (el
      // servidor sigue validando precios al confirmar el pedido).
      catalogFailed = true
    }

    const available: CartItem[] = []
    let skipped = 0
    for (const item of order.items) {
      const current = currentById.get(item.product_id)
      if (catalogFailed) {
        // Fallback al snapshot histórico (mejor que no agregar nada).
        available.push({
          product_id: item.product_id,
          name: item.product_name || `Producto #${item.product_id}`,
          slug: `producto-${item.product_id}`,
          image_url: item.product_image || "",
          brand: "",
          price: item.unit_price,
          sale_price: null,
          quantity: item.quantity,
          stock_status: "in_stock" as const,
        })
        continue
      }
      // Fuera de catálogo o agotado: no se agrega (el servidor lo rechazaría).
      if (!current || current.stock_status === "out_of_stock") {
        skipped += 1
        continue
      }
      available.push({
        product_id: item.product_id,
        name: current.name || item.product_name || `Producto #${item.product_id}`,
        slug: current.slug || `producto-${item.product_id}`,
        image_url: current.image_url || item.product_image || "",
        brand: current.brand ?? "",
        price: current.price,
        sale_price: current.sale_price,
        quantity: item.quantity,
        stock_status: current.stock_status,
      })
    }

    if (available.length > 0) {
      addOrderItems(available)
      AnalyticsEvents.repeatOrder(order.id, available.length)
    }
    if (skipped > 0) {
      toast(
        available.length > 0
          ? `${skipped} producto${skipped !== 1 ? "s" : ""} ya no ${skipped !== 1 ? "están" : "está"} disponible${skipped !== 1 ? "s" : ""} y no se agregó`
          : "Estos productos ya no están disponibles por ahora"
      )
    } else if (available.length > 0) {
      toast(`${available.length} producto${available.length !== 1 ? "s" : ""} agregados al carrito`)
    }

    setTimeout(() => setReorderingId(null), 1500)
  }

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
                  <span>{PAYMENT_METHOD_LABEL[order.payment_method ?? "cash_on_delivery"]}</span>
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
                    className="flex items-center gap-1.5 px-3.5 py-2 sm:px-2.5 sm:py-1.5 sm:text-xs text-sm font-semibold text-brand-600 bg-brand-50 hover:bg-brand-100 rounded-lg transition-colors disabled:opacity-50 touch-target"
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
