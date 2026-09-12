"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Heart, ShoppingCart, ArrowLeft, ArrowRight } from "lucide-react"
import { useCity } from "@/contexts/city-context"
import { useFavorites } from "@/contexts/favorites-context"
import { useCart } from "@/contexts/cart-context"
import { useToast } from "@/components/toast"
import { ProductCardGrid } from "@/components/product/product-card"
import { PageSkeleton } from "@/components/ui/page-skeleton"
import { AnalyticsEvents } from "@/lib/analytics"
import type { Product } from "@/types"

export function FavoritosClient() {
  const { city } = useCity()
  const { ids, loaded } = useFavorites()
  const { addOrderItems } = useCart()
  const { toast } = useToast()
  const [products, setProducts] = useState<Product[]>([])
  const [resolving, setResolving] = useState(false)

  // Resolver ids → productos del catálogo (visible solamente).
  useEffect(() => {
    if (!loaded) return
    if (ids.length === 0) {
      setProducts([])
      return
    }
    let cancelled = false
    setResolving(true)
    fetch("/api/favorites/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    })
      .then((res) => (res.ok ? res.json() : { products: [] }))
      .then((data: { products: Product[] }) => {
        if (!cancelled) setProducts(data.products)
      })
      .catch(() => {
        if (!cancelled) setProducts([])
      })
      .finally(() => {
        if (!cancelled) setResolving(false)
      })
    return () => {
      cancelled = true
    }
  }, [ids, loaded])

  if (!city || !loaded) {
    return <PageSkeleton titleWidth="w-56" cards={3} />
  }

  const addable = products.filter((p) => p.stock_status !== "out_of_stock")

  const handleAddAll = () => {
    if (addable.length === 0) return
    addOrderItems(
      addable.map((p) => ({
        product_id: p.id,
        name: p.name,
        slug: p.slug,
        image_url: p.image_url,
        brand: p.brand,
        price: p.price,
        sale_price: p.sale_price ?? null,
        quantity: 1,
        stock_status: p.stock_status,
      }))
    )
    for (const p of addable) {
      AnalyticsEvents.addToCart({ id: p.id, name: p.name, price: p.sale_price ?? p.price })
    }
    toast(`${addable.length} producto${addable.length !== 1 ? "s" : ""} agregado${addable.length !== 1 ? "s" : ""} al carrito`)
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center gap-3 mb-6">
        <Link
          href={`/${city.slug}`}
          className="p-2 -ml-2 rounded-lg hover:bg-gray-100 touch-target"
          aria-label="Volver a la tienda"
        >
          <ArrowLeft className="w-5 h-5 text-gray-500" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-[#242529] flex items-center gap-2">
            <Heart className="w-6 h-6 text-[#de3534] fill-[#de3534]" />
            Mi lista de resurtido
          </h1>
          <p className="text-sm text-[var(--text-secondary)] mt-0.5">
            Tus productos de siempre, listos para volver a pedir.
          </p>
        </div>
      </div>

      {ids.length === 0 ? (
        <div className="text-center py-20">
          <Heart className="w-14 h-14 text-[#e0dbd2] mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-[#1a1a1a] mb-2">
            Tu lista está vacía
          </h2>
          <p className="text-[#6b6b6b] max-w-md mx-auto mb-6">
            Toca el ♥ en cualquier producto para guardarlo aquí y resurtir tu
            negocio en segundos.
          </p>
          <Link
            href={`/${city.slug}`}
            className="inline-flex items-center gap-2 px-6 py-3 bg-[#0E7A0E] text-white font-bold rounded-xl hover:bg-[#0D720D] transition-colors"
          >
            Explorar productos
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      ) : resolving ? (
        <PageSkeleton cards={2} />
      ) : (
        <>
          {addable.length > 0 && (
            <div className="mb-6 flex flex-wrap items-center gap-3">
              <button
                onClick={handleAddAll}
                className="inline-flex items-center gap-2 px-6 py-3 bg-[#0E7A0E] text-white font-bold rounded-xl hover:bg-[#0D720D] transition-colors touch-target active:scale-95"
              >
                <ShoppingCart className="w-4 h-4" />
                Agregar todo al carrito ({addable.length})
              </button>
              {products.length !== addable.length && (
                <p className="text-xs text-[var(--text-secondary)]">
                  {products.length - addable.length} agotado{products.length - addable.length !== 1 ? "s" : ""} se omitirá
                </p>
              )}
            </div>
          )}
          <ProductCardGrid products={products} citySlug={city.slug} />
        </>
      )}
    </div>
  )
}
