"use client"

import { useEffect, useMemo, useState } from "react"
import Image from "next/image"
import { PackageSearch, Plus, Check } from "lucide-react"
import { useCart } from "@/contexts/cart-context"
import { getRunningOutProducts } from "@/lib/wallet-actions"
import { AnalyticsEvents } from "@/lib/analytics"
import type { Product } from "@/types"

interface Props {
  /** Catálogo visible actual: solo se sugieren productos aún disponibles. */
  products: Product[]
}

/**
 * Sección "Se te están acabando" del home post-login.
 *
 * Sugiere productos cuya cadencia típica de recompra del cliente ya se
 * cumplió (heurística de getRunningOutProducts). Solo muestra productos
 * presentes en el catálogo actual y con stock. No renderiza nada si no
 * hay sugerencias.
 */
export function RunningOutSection({ products }: Props) {
  const { addItem } = useCart()
  const [suggestions, setSuggestions] = useState<
    { product_id: number; daysSinceLast: number }[]
  >([])
  const [loading, setLoading] = useState(true)
  const [addedId, setAddedId] = useState<number | null>(null)

  const productById = useMemo(() => {
    const map = new Map<number, Product>()
    for (const p of products) map.set(p.id, p)
    return map
  }, [products])

  useEffect(() => {
    let cancelled = false
    getRunningOutProducts()
      .then((rows) => {
        if (!cancelled) setSuggestions(rows)
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const items = suggestions
    .map((s) => ({ ...s, product: productById.get(s.product_id) }))
    .filter((s) => s.product && s.product.stock_status !== "out_of_stock")

  if (loading || items.length === 0) return null

  const handleAdd = (product: Product) => {
    addItem({
      product_id: product.id,
      name: product.name,
      slug: product.slug,
      image_url: product.image_url,
      brand: product.brand ?? "",
      price: product.price,
      sale_price: product.sale_price,
      quantity: 1,
      stock_status: product.stock_status,
    })
    AnalyticsEvents.addToCart({
      id: product.id,
      name: product.name,
      price: product.sale_price ?? product.price,
      quantity: 1,
    })
    AnalyticsEvents.reorderQuickAdd(product.id)
    setAddedId(product.id)
    setTimeout(() => setAddedId(null), 1200)
  }

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 w-full pt-5">
      <h2 className="text-lg font-bold text-[#242529] flex items-center gap-2 mb-3">
        <PackageSearch className="w-5 h-5 text-amber-600" />
        Se te están acabando
      </h2>
      <div className="-mx-4 sm:-mx-6 px-4 sm:px-6 overflow-x-auto scrollbar-hide scroll-fade-x snap-x">
        <div className="flex gap-3 min-w-max pb-1">
          {items.map(({ product, daysSinceLast }) => {
            const p = product!
            const price = p.sale_price ?? p.price
            return (
              <div
                key={p.id}
                className="w-36 shrink-0 snap-start bg-white rounded-xl border border-amber-200 p-2.5 flex flex-col"
              >
                <div className="relative w-full aspect-square rounded-lg overflow-hidden bg-[#F7F5F0] mb-2">
                  {p.image_url ? (
                    <Image
                      src={p.image_url}
                      alt={p.name}
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
                  {p.name}
                </p>
                <p className="text-[11px] text-amber-700 mb-2">
                  Lo pediste hace {daysSinceLast} día{daysSinceLast !== 1 ? "s" : ""}
                </p>
                <button
                  onClick={() => handleAdd(p)}
                  disabled={addedId === p.id}
                  className={`mt-auto flex items-center justify-center gap-1 w-full py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    addedId === p.id
                      ? "bg-[#0E7A0E]/10 text-[#0E7A0E]"
                      : "bg-[#0E7A0E] text-white hover:bg-[#0c6b0c]"
                  }`}
                >
                  {addedId === p.id ? (
                    <Check className="w-3.5 h-3.5" />
                  ) : (
                    <Plus className="w-3.5 h-3.5" />
                  )}
                  {addedId === p.id ? "Agregado" : `Agregar · $${price.toFixed(2)}`}
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
