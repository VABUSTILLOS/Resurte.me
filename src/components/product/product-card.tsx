"use client"

import { Plus, MessageCircle, Check } from "lucide-react"
import type { Product } from "@/types"
import { useCart } from "@/contexts/cart-context"
import { useState } from "react"
import Link from "next/link"

interface ProductCardProps {
  product: Product & { price: number; sale_price?: number | null; stock_status?: string }
  storeId?: number
  storeName?: string
  storeSlug?: string
  whatsappNumber?: string | null
  citySlug: string
  onAddToCart?: () => void
}

export function ProductCard({
  product,
  storeId,
  storeName,
  storeSlug,
  whatsappNumber,
  citySlug,
  onAddToCart,
}: ProductCardProps) {
  const { addItem } = useCart()
  const [added, setAdded] = useState(false)

  const price = product.sale_price ?? product.price
  const hasDiscount = product.sale_price && product.sale_price < product.price
  const discountPercent = hasDiscount ? Math.round((1 - product.sale_price! / product.price) * 100) : 0
  const outOfStock = product.stock_status === "out_of_stock"
  const lowStock = product.stock_status === "low_stock"

  const handleAdd = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (onAddToCart) {
      onAddToCart()
      return
    }

    addItem({
      product_id: product.id,
      store_id: storeId,
      store_name: storeName,
      store_slug: storeSlug,
      name: product.name,
      slug: product.slug,
      image_url: product.image_url,
      brand: product.brand,
      price: product.price,
      sale_price: product.sale_price ?? null,
      quantity: 1,
      stock_status: product.stock_status as "in_stock" | "low_stock" | "out_of_stock",
    })

    setAdded(true)
    setTimeout(() => setAdded(false), 1200)
  }

  return (
    <Link
      href={`/${citySlug}/producto/${product.slug}`}
      className="group block relative bg-white rounded-xl border border-[#E8E9EB] overflow-hidden hover:shadow-[0_2px_16px_rgba(0,0,0,0.08)] transition-all duration-200 ease-out"
    >
      {/* Product image */}
      <div className="aspect-[4/3] sm:aspect-square bg-[#F6F7F8] relative overflow-hidden">
        {product.image_url ? (
          <img
            src={product.image_url}
            alt={product.name}
            className="w-full h-full object-contain p-2"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-4xl text-gray-300">
            🛒
          </div>
        )}

        {/* Discount badge — improved with percentage */}
        {hasDiscount && (
          <div className="absolute top-2 left-2 bg-[#DE3534] text-white text-[11px] font-bold px-2 py-0.5 rounded-full">
            -{discountPercent}%
          </div>
        )}

        {/* Low stock badge */}
        {lowStock && (
          <div className="absolute top-2 left-2 bg-[#F5A623] text-white text-[11px] font-bold px-2 py-0.5 rounded-full">
            Pocas unidades
          </div>
        )}

        {/* Out of stock overlay */}
        {outOfStock && (
          <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
            <span className="text-sm font-semibold text-gray-500 bg-white px-4 py-1.5 rounded-full shadow">
              Agotado
            </span>
          </div>
        )}
      </div>

      {/* Product info */}
      <div className="p-3">
        {/* Unit badge — MayoreoTotal-style: "por kilo", "por pieza" */}
        {product.unit && (
          <p className="text-[11px] text-[#108910] font-medium mb-1 uppercase tracking-wide">
            {product.unit}
          </p>
        )}
        {product.brand && (
          <p className="text-xs text-[#8F939B] mb-0.5">{product.brand}</p>
        )}
        <h3 className="text-sm text-[#343538] font-medium line-clamp-2 leading-tight group-hover:text-[#108910] transition-colors">
          {product.name}
        </h3>

        {/* Price — with Instacart-style sale display */}
        <div className="flex items-center gap-2 mt-2">
          <span className="text-base font-bold text-[#343538]">
            ${price.toFixed(2)}
          </span>
          {hasDiscount && (
            <span className="text-sm text-[#8F939B] line-through">
              ${product.price.toFixed(2)}
            </span>
          )}
        </div>

        {/* Savings text for discounted items */}
        {hasDiscount && (
          <p className="text-[11px] text-[#108910] font-medium mt-0.5">
            Ahorras ${(product.price - product.sale_price!).toFixed(2)}
          </p>
        )}

        {/* Add button — full width, Instacart-style */}
        <button
          onClick={handleAdd}
          disabled={outOfStock}
          className={`w-full mt-3 h-9 flex items-center justify-center gap-1 text-sm font-semibold rounded-lg transition-all duration-200 ease-out ${
            added
              ? "bg-green-500 text-white"
              : "bg-[#108910] text-white hover:bg-[#0D720D] active:bg-[#0A610A] disabled:opacity-50 disabled:cursor-not-allowed"
          }`}
        >
          {added ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {added ? "Agregado" : "Agregar"}
        </button>
      </div>
    </Link>
  )
}

interface ProductCardGridProps {
  products: ProductCardProps["product"][]
  storeId?: number
  storeName?: string
  storeSlug?: string
  whatsappNumber?: string | null
  citySlug: string
  onAddToCart?: () => void
}

export function ProductCardGrid({
  products,
  storeId,
  storeName,
  storeSlug,
  whatsappNumber,
  citySlug,
  onAddToCart,
}: ProductCardGridProps) {
  if (products.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-400">No se encontraron productos.</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-4">
      {products.map((product) => (
        <ProductCard
          key={product.id}
          product={product}
          storeId={storeId}
          storeName={storeName}
          storeSlug={storeSlug}
          whatsappNumber={whatsappNumber}
          citySlug={citySlug}
          onAddToCart={onAddToCart}
        />
      ))}
    </div>
  )
}
