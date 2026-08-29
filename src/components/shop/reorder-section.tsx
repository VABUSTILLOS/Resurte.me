"use client"

import { useEffect, useMemo, useState } from "react"
import Image from "next/image"
import { RotateCcw, Plus, Check } from "lucide-react"
import { useCart } from "@/contexts/cart-context"
import { useToast } from "@/components/toast"
import { getUserPurchaseHistory } from "@/lib/wallet-actions"
import { AnalyticsEvents } from "@/lib/analytics"
import type { CartItem, Product } from "@/types"

interface ReorderItem {
  product_id: number
  name: string
  image_url: string
  quantity: number
  price: number
  slug: string
  stock_status: CartItem["stock_status"]
}

interface Props {
  /** Catálogo visible actual: se usa para precio/stock/slug al día. */
  products: Product[]
}

/**
 * Sección "Volver a pedir" del home post-login.
 *
 * Muestra los productos del último pedido del cliente en un carrusel
 * horizontal con quick-add por producto, más un CTA para repetir el
 * pedido completo. Si el producto sigue en el catálogo se usan precio,
 * slug y stock actuales; si no, el snapshot de la orden (igual que en
 * mis-pedidos). No renderiza nada si el cliente no tiene pedidos.
 */
export function ReorderSection({ products }: Props) {
  const { addItem, addOrderItems } = useCart()
  const { toast } = useToast()
  const [items, setItems] = useState<ReorderItem[]>([])
  const [orderId, setOrderId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [addedId, setAddedId] = useState<number | null>(null)
  const [repeating, setRepeating] = useState(false)

  const productById = useMemo(() => {
    const map = new Map<number, Product>()
    for (const p of products) map.set(p.id, p)
    return map
  }, [products])

  useEffect(() => {
    let cancelled = false
    getUserPurchaseHistory(0, 1)
      .then(({ orders }) => {
        if (cancelled || orders.length === 0) return
        const last = orders[0]!
        setOrderId(last.id)
        setItems(
          last.items.map((item) => {
            const current = productById.get(item.product_id)
            return {
              product_id: item.product_id,
              name: current?.name ?? item.product_name,
              image_url: current?.image_url ?? item.product_image,
              quantity: item.quantity,
              price: current ? (current.sale_price ?? current.price) : item.unit_price,
              slug: current?.slug ?? `producto-${item.product_id}`,
              stock_status: current?.stock_status ?? "in_stock",
            }
          }),
        )
      })
      .catch(() => {
        // Sin historial disponible: la sección simplemente no se muestra.
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [productById])

  if (loading || items.length === 0) return null

  const toCartItem = (item: ReorderItem): CartItem => ({
    product_id: item.product_id,
    name: item.name,
    slug: item.slug,
    image_url: item.image_url,
    brand: "",
    price: item.price,
    sale_price: null,
    quantity: item.quantity,
    stock_status: item.stock_status,
  })

  const handleAddOne = (item: ReorderItem) => {
    addItem(toCartItem(item))
    AnalyticsEvents.addToCart({ id: item.product_id, name: item.name, price: item.price, quantity: item.quantity })
    setAddedId(item.product_id)
    setTimeout(() => setAddedId(null), 1200)
  }

  const handleRepeatAll = () => {
    const available = items.filter((i) => i.stock_status !== "out_of_stock")
    if (available.length === 0) {
      toast("Estos productos no están disponibles por ahora")
      return
    }
    setRepeating(true)
    addOrderItems(available.map(toCartItem))
    if (orderId !== null) AnalyticsEvents.repeatOrder(orderId, available.length)
    toast(`${available.length} producto${available.length !== 1 ? "s" : ""} agregados al carrito`)
    setTimeout(() => setRepeating(false), 1500)
  }

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 w-full pt-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-bold text-[#242529] flex items-center gap-2">
          <RotateCcw className="w-5 h-5 text-[#0E7A0E]" />
          Volver a pedir
        </h2>
        <button
          onClick={handleRepeatAll}
          disabled={repeating}
          className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold bg-[#0E7A0E] text-white shadow-md shadow-[#0E7A0E]/20 hover:bg-[#0c6b0c] transition-colors disabled:opacity-60"
        >
          {repeating ? <Check className="w-4 h-4" /> : <RotateCcw className="w-4 h-4" />}
          {repeating ? "Agregado" : "Repetir mi último pedido"}
        </button>
      </div>

      <div className="-mx-4 sm:-mx-6 px-4 sm:px-6 overflow-x-auto scrollbar-hide scroll-fade-x snap-x">
        <div className="flex gap-3 min-w-max pb-1">
          {items.map((item) => {
            const outOfStock = item.stock_status === "out_of_stock"
            return (
              <div
                key={item.product_id}
                className="w-36 shrink-0 snap-start bg-white rounded-xl border border-[#E8E9EB] p-2.5 flex flex-col"
              >
                <div className="relative w-full aspect-square rounded-lg overflow-hidden bg-[#F7F5F0] mb-2">
                  {item.image_url ? (
                    <Image
                      src={item.image_url}
                      alt={item.name}
                      fill
                      sizes="144px"
                      className="object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[#B0B3B8] text-xs">
                      Sin imagen
                    </div>
                  )}
                </div>
                <p className="text-xs font-medium text-[#343538] leading-tight line-clamp-2 mb-1">
                  {item.name}
                </p>
                <p className="text-[11px] text-[var(--text-secondary)] mb-2">
                  {item.quantity} × ${item.price.toFixed(2)}
                </p>
                <button
                  onClick={() => handleAddOne(item)}
                  disabled={outOfStock || addedId === item.product_id}
                  className={`mt-auto flex items-center justify-center gap-1 w-full py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    outOfStock
                      ? "bg-[#F7F5F0] text-[#B0B3B8] cursor-not-allowed"
                      : addedId === item.product_id
                        ? "bg-[#0E7A0E]/10 text-[#0E7A0E]"
                        : "bg-[#0E7A0E] text-white hover:bg-[#0c6b0c]"
                  }`}
                >
                  {addedId === item.product_id ? (
                    <Check className="w-3.5 h-3.5" />
                  ) : (
                    <Plus className="w-3.5 h-3.5" />
                  )}
                  {outOfStock ? "Agotado" : addedId === item.product_id ? "Agregado" : "Agregar"}
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
