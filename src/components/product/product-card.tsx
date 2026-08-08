"use client"

import { Plus, Check } from "lucide-react"
import Image from "next/image"
import type { Product } from "@/types"
import { useCart } from "@/contexts/cart-context"
import { cn, getProductTagline } from "@/lib/utils"
import { AnalyticsEvents } from "@/lib/analytics"
import { useState, memo } from "react"
import Link from "next/link"

/**
 * ProductCard — Erewhon-style with image swap on hover + quick-add button.
 *
 * Erewhon-inspired features:
 * - Secondary image fades in on hover (if product.images[1] exists)
 * - Quick-add button fades up from below the card on hover
 * - Soft border, rounded corners, subtle hover lift
 * - Clean typography with brand green accent
 *
 * Wrapped in React.memo to prevent re-renders when parent adds more products
 * via infinite scroll.
 */

interface ProductCardProps {
  product: Product & { price: number; sale_price?: number | null; stock_status?: string }
  whatsappNumber?: string | null
  citySlug: string
  onAddToCart?: () => void
}

export const ProductCard = memo(function ProductCard({
  product,
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

  // Second image for hover swap effect
  const secondaryImage = product.images?.[1]

  // Extract scanning-friendly tagline from product description
  const tagline = getProductTagline(product.description)

  const handleAdd = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (onAddToCart) {
      onAddToCart()
      return
    }

    addItem({
      product_id: product.id,
      name: product.name,
      slug: product.slug,
      image_url: product.image_url,
      brand: product.brand,
      price: product.price,
      sale_price: product.sale_price ?? null,
      quantity: 1,
      stock_status: product.stock_status as "in_stock" | "low_stock" | "out_of_stock",
    })

    AnalyticsEvents.addToCart({
      id: product.id,
      name: product.name,
      price,
    })

    setAdded(true)
    setTimeout(() => setAdded(false), 1200)
  }

  return (
    <div className="product-card group relative" style={{ contentVisibility: "auto", containIntrinsicSize: "auto 320px" }}>
      <Link
        href={`/${citySlug}/producto/${product.slug}`}
        className="block relative bg-white rounded-xl border border-[#e0dbd2] overflow-hidden hover:shadow-[0_2px_20px_rgba(0,0,0,0.07)] focus-visible:ring-2 focus-visible:ring-[#0E7A0E] focus-visible:ring-offset-1 transition-all duration-300 ease-out hover:-translate-y-0.5"
      >
        {/* Product image — Erewhon-style image swap on hover */}
        <div className={cn("aspect-[4/3] sm:aspect-[3/2] lg:aspect-[5/3] bg-[#faf8f5] relative overflow-hidden", secondaryImage && "product-card-img-swap")}>
          {product.image_url ? (
            <>
              <Image
                src={product.image_url}
                alt={product.name}
                fill
                placeholder="blur"
                blurDataURL="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 300'%3E%3Crect fill='%23faf8f5' width='400' height='300'/%3E%3C/svg%3E"
                sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                className="object-contain p-2 product-card-img-primary"
              />
              {secondaryImage && (
                <Image
                  src={secondaryImage}
                  alt={`${product.name} - vista 2`}
                  fill
                  loading="lazy"
                  placeholder="blur"
                  blurDataURL="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 300'%3E%3Crect fill='%23faf8f5' width='400' height='300'/%3E%3C/svg%3E"
                  sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                  className="object-contain p-2 product-card-img-secondary"
                />
              )}
            </>
          ) : (
            <div className="w-full h-full flex items-center justify-center text-4xl text-gray-300">
              🛒
            </div>
          )}

          {/* Multi-image indicator */}
          {product.images && product.images.length > 1 && (
            <div className="absolute bottom-2 right-2 bg-black/55 text-white text-[10px] font-medium px-1.5 py-0.5 rounded-full backdrop-blur-sm z-10">
              +{product.images.length - 1}
            </div>
          )}

          {/* Discount badge — Erewhon-style pill */}
          {hasDiscount && (
            <div className="absolute top-2 left-2 bg-[#de3534] text-white text-[11px] font-bold px-2 py-0.5 rounded-full shadow-sm z-10" aria-label={`${discountPercent}% de descuento`}>
              -{discountPercent}%
            </div>
          )}

          {/* Low stock badge */}
          {lowStock && !hasDiscount && (
            <div className="absolute top-2 left-2 bg-[#f5a623] text-white text-[11px] font-bold px-2 py-0.5 rounded-full shadow-sm z-10" role="status">
              Pocas unidades
            </div>
          )}

          {/* Out of stock overlay */}
          {outOfStock && (
            <div className="absolute inset-0 bg-white/75 flex items-center justify-center backdrop-blur-[1px] z-10" role="alert">
              <span className="text-sm font-semibold text-[#6b6b6b] bg-white px-4 py-1.5 rounded-full shadow-sm">
                Agotado
              </span>
            </div>
          )}
        </div>

        {/* Product info */}
        <div className="p-3 pb-2">
          {product.unit && (
            <p className="text-[11px] text-[#0E7A0E] font-medium mb-1 uppercase tracking-wide">
              {product.unit}
            </p>
          )}
          {product.brand && (
            <p className="text-xs text-[var(--text-secondary)] mb-0.5">{product.brand}</p>
          )}
          {/* Scanning-friendly tagline — last sentence of description as a use-case hint */}
          {tagline && (
            <p className="text-[11px] text-[var(--text-secondary)] mb-0.5 line-clamp-1 italic">
              {tagline}
            </p>
          )}
          <h3 className="text-sm text-[#1a1a1a] font-medium line-clamp-2 leading-tight group-hover:text-[#0E7A0E] transition-colors duration-200">
            {product.name}
          </h3>

          <div className="flex items-center gap-2 mt-2">
            <span className="text-base font-bold text-[#1a1a1a]">
              ${price.toFixed(2)}
            </span>
            {hasDiscount && (
              <span className="text-sm text-[var(--text-secondary)] line-through">
                ${product.price.toFixed(2)}
              </span>
            )}
          </div>

          {hasDiscount && (
            <p className="text-[11px] text-[#0E7A0E] font-medium mt-0.5">
              Ahorras ${(product.price - product.sale_price!).toFixed(2)}
            </p>
          )}

          {/* Volume pricing hint — shown for bulk-friendly products */}
          {product.unit && (["por kilo", "por pieza", "charola"].some(u => product.unit?.includes(u))) && (
            <p className="text-[10px] text-[#0E7A0E]/70 font-medium mt-0.5">
              💰 Precio de mayoreo — compra más y ahorra
            </p>
          )}
        </div>
      </Link>

      {/* Quick-add button — Erewhon-style: fades up below the card on hover */}
      {!outOfStock && (
        <button
          onClick={handleAdd}
          aria-label={`Agregar ${product.name} al carrito`}
          className={cn(
            "quick-add-btn absolute -bottom-2 left-1/2 -translate-x-1/2 z-10 px-5 py-2.5 rounded-full text-sm font-semibold transition-all duration-300 ease-out shadow-lg touch-target active:scale-95",
            added
              ? "bg-green-500 text-white"
              : "bg-[#0E7A0E] text-white hover:bg-[#0D720D] hover:shadow-xl"
          )}
        >
          {added ? (
            <span className="flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5" /> Agregado
            </span>
          ) : (
            <span className="flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5" /> Agregar
            </span>
          )}
        </button>
      )}
    </div>
  )
})

interface ProductCardGridProps {
  products: ProductCardProps["product"][]
  whatsappNumber?: string | null
  citySlug: string
  onAddToCart?: () => void
}

export function ProductCardGrid({
  products,
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
          whatsappNumber={whatsappNumber}
          citySlug={citySlug}
          onAddToCart={onAddToCart}
        />
      ))}
    </div>
  )
}
