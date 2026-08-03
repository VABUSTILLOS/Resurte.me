"use client"

import { useState } from "react"
import { ArrowLeft, Plus, Minus, Check, MessageCircle, ShoppingCart, Package } from "lucide-react"
import { useCart } from "@/contexts/cart-context"
import { ProductCard } from "@/components/product/product-card"
import Link from "next/link"
import type { Category, Product } from "@/types"

type ProductWithStore = Product & {
  product_stores: { store_id: number; price: number; sale_price: number | null; is_available: boolean; stock_status: string }[]
}

interface ProductDetailClientProps {
  product: ProductWithStore
  category?: Category
  relatedProducts: ProductWithStore[]
  relatedCategoryMap: Map<number, Category>
  citySlug: string
  cityName: string
}

export function ProductDetailClient({ product, category, relatedProducts, relatedCategoryMap, citySlug, cityName }: ProductDetailClientProps) {
  const { addItem } = useCart()
  const [added, setAdded] = useState(false)
  const [quantity, setQuantity] = useState(1)
  const [selectedImage, setSelectedImage] = useState(0)

  const allImages = product.images?.length ? product.images : [product.image_url]

  const storeData = product.product_stores[0]
  const displayPrice = storeData?.sale_price ?? storeData?.price ?? 0
  const originalPrice = storeData?.price ?? 0
  const hasDiscount = storeData?.sale_price && storeData.sale_price < storeData.price
  const discountPercent = hasDiscount ? Math.round((1 - storeData.sale_price! / storeData.price) * 100) : 0
  const outOfStock = storeData?.stock_status === "out_of_stock"
  const lowStock = storeData?.stock_status === "low_stock"

  const handleAdd = () => {
    for (let i = 0; i < quantity; i++) {
      addItem({
        product_id: product.id,
        store_id: storeData?.store_id,
        store_name: "Resurte.me",
        store_slug: "resurte",
        name: product.name,
        slug: product.slug,
        image_url: product.image_url,
        brand: product.brand,
        price: originalPrice,
        sale_price: storeData?.sale_price ?? null,
        quantity: 1,
        stock_status: (storeData?.stock_status ?? "in_stock") as "in_stock" | "low_stock" | "out_of_stock",
      })
    }
    setAdded(true)
    setQuantity(1)
    setTimeout(() => setAdded(false), 1500)
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-8">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-xs sm:text-sm mb-4 sm:mb-8 overflow-x-auto whitespace-nowrap pb-1">
          <Link
            href={`/${citySlug}`}
            className="text-[#72767E] hover:text-[#108910] transition-colors flex items-center gap-1.5"
          >
            <ArrowLeft className="w-4 h-4" />
            Volver
          </Link>
          <span className="text-[#C7CACD]">/</span>
          <Link
            href={`/${citySlug}`}
            className="text-[#72767E] hover:text-[#108910] transition-colors"
          >
            Inicio
          </Link>
          {category && (
            <>
              <span className="text-[#C7CACD]">/</span>
              <Link
                href={`/${citySlug}/categoria/${category.slug}`}
                className="text-[#72767E] hover:text-[#108910] transition-colors"
              >
                {category.name}
              </Link>
            </>
          )}
          <span className="text-[#C7CACD]">/</span>
          <span className="text-[#242529] font-medium truncate max-w-[200px]">
            {product.name}
          </span>
        </nav>

        {/* Product detail — split layout */}
        <div className="flex flex-col lg:flex-row gap-6 lg:gap-16">
          {/* Left: Product image gallery */}
          <div className="w-full lg:w-[55%]">
            <div className="aspect-[4/3] sm:aspect-square bg-[#F6F7F8] rounded-xl sm:rounded-2xl overflow-hidden relative border border-[#E8E9EB]">
              {allImages[selectedImage] ? (
                <img
                  src={allImages[selectedImage]}
                  alt={product.name}
                  className="w-full h-full object-contain p-8"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-8xl text-gray-200">
                  🛒
                </div>
              )}

              {/* Discount badge */}
              {hasDiscount && (
                <div className="absolute top-4 left-4 bg-[#DE3534] text-white text-sm font-bold px-3 py-1.5 rounded-full">
                  -{discountPercent}%
                </div>
              )}

              {/* Stock badges */}
              {outOfStock && (
                <div className="absolute top-4 left-4 bg-white/90 text-gray-500 text-sm font-semibold px-4 py-1.5 rounded-full shadow-sm">
                  Agotado
                </div>
              )}
              {lowStock && !outOfStock && (
                <div className="absolute top-4 right-4 bg-[#F5A623] text-white text-xs font-semibold px-3 py-1 rounded-full">
                  Pocas unidades
                </div>
              )}
            </div>

            {/* Thumbnail strip */}
            {allImages.length > 1 && (
              <div className="flex gap-2 mt-3 overflow-x-auto pb-1">
                {allImages.map((img, idx) => (
                  <button
                    key={idx}
                    onClick={() => setSelectedImage(idx)}
                    className={`flex-shrink-0 w-16 h-16 rounded-lg border-2 overflow-hidden bg-[#F6F7F8] transition-all ${
                      idx === selectedImage
                        ? "border-[#108910] ring-1 ring-[#108910]"
                        : "border-[#E8E9EB] hover:border-[#108910]/40"
                    }`}
                  >
                    <img src={img} alt={`${product.name} ${idx + 1}`} className="w-full h-full object-contain p-1" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Right: Product info */}
          <div className="w-full lg:w-[45%] flex flex-col">
            {/* Category chip */}
            {category && (
              <Link
                href={`/${citySlug}/categoria/${category.slug}`}
                className="inline-flex items-center gap-1.5 self-start text-sm text-[#108910] font-medium bg-[#E9FBE9] px-3 py-1 rounded-full hover:bg-[#D4F0D4] transition-colors mb-4"
              >
                <span>{category.icon}</span>
                {category.name}
              </Link>
            )}

            {/* Product name */}
            <h1 className="text-xl sm:text-2xl lg:text-[2rem] font-bold text-[#242529] leading-tight tracking-tight">
              {product.name}
            </h1>

            {/* Unit and Brand */}
            <div className="flex flex-wrap items-center gap-3 mt-3">
              {product.unit && (
                <span className="text-sm font-medium text-[#108910] bg-[#E9FBE9] px-2.5 py-0.5 rounded-full">
                  {product.unit}
                </span>
              )}
              {product.brand && (
                <span className="text-sm text-[#72767E]">
                  {product.brand}
                </span>
              )}
            </div>

            {/* Stock status */}
            {lowStock && !outOfStock && (
              <p className="mt-3 text-sm text-[#F5A623] font-medium flex items-center gap-1.5">
                <Package className="w-4 h-4" />
                Quedan pocas unidades — ¡apresúrate!
              </p>
            )}

            {/* Price */}
            <div className="mt-4 sm:mt-6 pt-4 sm:pt-6 border-t border-[#E8E9EB]">
              <div className="flex items-baseline gap-3">
                <span className="text-2xl sm:text-3xl font-bold text-[#242529]">
                  ${displayPrice.toFixed(2)}
                </span>
                {hasDiscount && (
                  <>
                    <span className="text-lg text-[#8F939B] line-through">
                      ${originalPrice.toFixed(2)}
                    </span>
                    <span className="text-sm font-semibold text-[#DE3534] bg-[#FFF0F0] px-2 py-0.5 rounded-full">
                      -{discountPercent}%
                    </span>
                  </>
                )}
              </div>
              {hasDiscount && (
                <p className="text-sm text-[#108910] font-medium mt-1.5">
                  Ahorras ${(originalPrice - displayPrice).toFixed(2)}
                </p>
              )}
              {product.unit && (
                <p className="text-xs text-[#72767E] mt-1">
                  Precio por {product.unit.toLowerCase()}
                </p>
              )}
            </div>

            {/* Quantity selector */}
            {!outOfStock && (
              <div className="mt-5">
                <p className="text-sm font-medium text-[#242529] mb-2">Cantidad</p>
                <div className="inline-flex items-center border border-[#E8E9EB] rounded-lg overflow-hidden">
                  <button
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                    className="w-10 h-10 flex items-center justify-center text-[#72767E] hover:bg-[#F7F5F0] transition-colors"
                    disabled={quantity <= 1}
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <span className="w-12 text-center text-sm font-semibold text-[#242529] select-none">
                    {quantity}
                  </span>
                  <button
                    onClick={() => setQuantity(quantity + 1)}
                    className="w-10 h-10 flex items-center justify-center text-[#72767E] hover:bg-[#F7F5F0] transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* Add to cart and WhatsApp */}
            <div className="mt-4 sm:mt-6 flex flex-col sm:flex-row gap-2.5 sm:gap-3">
              <button
                onClick={handleAdd}
                disabled={outOfStock}
                className={`flex-1 h-12 flex items-center justify-center gap-2 text-sm font-semibold rounded-xl transition-all duration-200 ${
                  added
                    ? "bg-green-500 text-white"
                    : "bg-[#108910] text-white hover:bg-[#0D720D] active:bg-[#0A610A] disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                }`}
              >
                {added ? (
                  <>
                    <Check className="w-5 h-5" />
                    ¡Agregado!
                  </>
                ) : (
                  <>
                    <ShoppingCart className="w-5 h-5" />
                    Agregar al carrito
                    {quantity > 1 && ` (${quantity})`}
                  </>
                )}
              </button>

              <a
                href={`https://wa.me/5216141234567?text=${encodeURIComponent(
                  `Hola, me interesa: ${product.name}${quantity > 1 ? ` x${quantity}` : ""} - $${displayPrice.toFixed(2)} c/u`
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 h-12 flex items-center justify-center gap-2 text-sm font-semibold rounded-xl border-2 border-[#25D366] text-[#25D366] hover:bg-[#25D366] hover:text-white transition-all duration-200"
              >
                <MessageCircle className="w-5 h-5" />
                Pedir por WhatsApp
              </a>
            </div>

            {/* Description */}
            {product.description && (
              <div className="mt-6 sm:mt-8 pt-4 sm:pt-6 border-t border-[#E8E9EB]">
                <h2 className="text-sm font-semibold text-[#242529] uppercase tracking-wider mb-3">
                  Descripción
                </h2>
                <p className="text-sm text-[#5C6068] leading-relaxed whitespace-pre-line">
                  {product.description}
                </p>
              </div>
            )}

            {/* Delivery info */}
            <div className="mt-4 sm:mt-8 p-3 sm:p-4 bg-[#F7F5F0] rounded-xl">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-[#E9FBE9] flex items-center justify-center shrink-0">
                  <Package className="w-5 h-5 text-[#108910]" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#242529]">
                    Entrega en {cityName}
                  </p>
                  <p className="text-xs text-[#72767E] mt-0.5 leading-relaxed">
                    Envío gratis desde $2,500 MXN. Entrega en 24-48 horas hábiles.
                    Facturación electrónica incluida.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* También te puede interesar */}
        {relatedProducts.length > 0 && (
          <section className="mt-8 sm:mt-12 pt-6 sm:pt-8 border-t border-[#E8E9EB]">
            <h2 className="text-base sm:text-lg font-bold text-[#242529] mb-4 sm:mb-5">
              También te puede interesar
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-3">
              {relatedProducts.map((rp) => {
                const storeData = rp.product_stores[0]
                return (
                  <ProductCard
                    key={rp.id}
                    product={{
                      ...rp,
                      price: storeData?.price ?? 0,
                      sale_price: storeData?.sale_price ?? null,
                      stock_status: storeData?.stock_status ?? "in_stock",
                    }}
                    storeId={1}
                    storeName="Resurte.me"
                    storeSlug="resurte"
                    citySlug={citySlug}
                  />
                )
              })}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
