"use client"

import { useState, useEffect } from "react"
import { ArrowLeft, Plus, Minus, Check, ShoppingCart, Package } from "lucide-react"
import Image from "next/image"
import { useCart } from "@/contexts/cart-context"
import { ProductCard } from "@/components/product/product-card"
import { WhatsAppBadge, OrderByWhatsAppButton } from "@/components/whatsapp/whatsapp-button"
import { ScrollReveal } from "@/components/ui/scroll-reveal"
import Link from "next/link"
import type { Category, Product } from "@/types"
import { getCategoryIcon } from "@/lib/utils"
import { AnalyticsEvents } from "@/lib/analytics"

interface ProductDetailClientProps {
  product: Product
  category?: Category
  relatedProducts: Product[]
  citySlug: string
  cityName: string
}

export function ProductDetailClient({ product, category, relatedProducts, citySlug, cityName }: ProductDetailClientProps) {
  const { addItem } = useCart()
  const [added, setAdded] = useState(false)
  const [quantity, setQuantity] = useState(1)
  const [selectedImage, setSelectedImage] = useState(0)

  const allImages = product.images?.length ? product.images : [product.image_url]

  const displayPrice = product.sale_price ?? product.price ?? 0
  const originalPrice = product.price ?? 0
  const hasDiscount = !!product.sale_price && product.sale_price < (product.price ?? 0)
  const discountPercent = hasDiscount ? Math.round((1 - product.sale_price! / product.price!) * 100) : 0
  const outOfStock = product.stock_status === "out_of_stock"
  const lowStock = product.stock_status === "low_stock"

  // Track product view on page load
  useEffect(() => {
    AnalyticsEvents.viewItem({
      id: product.id,
      name: product.name,
      price: displayPrice,
      category: category?.name,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // La barra sticky add-to-cart ocupa el carril inferior en móvil; marcamos el
  // body para ocultar el WhatsApp flotante global (ya hay botón in-page).
  useEffect(() => {
    document.body.classList.add("has-sticky-atc")
    return () => document.body.classList.remove("has-sticky-atc")
  }, [])

  const handleAdd = () => {
    for (let i = 0; i < quantity; i++) {
      addItem({
        product_id: product.id,
        name: product.name,
        slug: product.slug,
        image_url: product.image_url,
        brand: product.brand,
        price: originalPrice,
        sale_price: product.sale_price ?? null,
        quantity: 1,
        stock_status: (product.stock_status ?? "in_stock") as "in_stock" | "low_stock" | "out_of_stock",
      })
    }
    AnalyticsEvents.addToCart({
      id: product.id,
      name: product.name,
      price: displayPrice,
      quantity,
    })
    setAdded(true)
    setQuantity(1)
    setTimeout(() => setAdded(false), 1500)
  }

  return (
    <div className="min-h-screen bg-[#faf8f5]">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 pt-4 pb-28 sm:pt-8 sm:pb-8">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-xs sm:text-sm mb-4 sm:mb-8 overflow-x-auto whitespace-nowrap pb-1">
          <Link
            href={`/${citySlug}`}
            className="text-[#6b6b6b] hover:text-[#0E7A0E] transition-colors flex items-center gap-1.5"
          >
            <ArrowLeft className="w-4 h-4" />
            Volver
          </Link>
          <span className="text-[#c0bab0]">/</span>
          <Link
            href={`/${citySlug}`}
            className="text-[#6b6b6b] hover:text-[#0E7A0E] transition-colors"
          >
            Inicio
          </Link>
          {category && (
            <>
              <span className="text-[#c0bab0]">/</span>
              <Link
                href={`/${citySlug}/categoria/${category.slug}`}
                className="text-[#6b6b6b] hover:text-[#0E7A0E] transition-colors"
              >
                {category.name}
              </Link>
            </>
          )}
          <span className="text-[#c0bab0]">/</span>
          <span className="text-[#1a1a1a] font-medium truncate max-w-[200px]">
            {product.name}
          </span>
        </nav>

        {/* Product detail — split layout */}
        <div className="flex flex-col lg:flex-row gap-6 lg:gap-16">
          {/* Left: Product image gallery */}
          <div className="w-full lg:w-[55%]">
            <div className="aspect-[4/3] sm:aspect-square bg-[#f7f4ef] rounded-xl sm:rounded-2xl overflow-hidden relative border border-[#ede8df]">
              {allImages[selectedImage] ? (
                <Image
                  src={allImages[selectedImage]}
                  alt={product.name}
                  width={640}
                  height={480}
                  priority
                  fetchPriority="high"
                  sizes="(max-width: 1024px) 100vw, 55vw"
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
                    className={`flex-shrink-0 w-16 h-16 rounded-lg border-2 overflow-hidden bg-[#f7f4ef] transition-all ${
                      idx === selectedImage
                        ? "border-[#0E7A0E] ring-1 ring-[#0E7A0E]"
                        : "border-[#ede8df] hover:border-[#0E7A0E]/40"
                    }`}
                  >
                    <img src={img} alt={`${product.name} ${idx + 1}`} loading="lazy" width={64} height={64} className="w-full h-full object-contain p-1" />
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
                className="inline-flex items-center gap-1.5 self-start text-sm text-[#0E7A0E] font-medium bg-[#e8f5e9] px-3 py-1 rounded-full hover:bg-[#c8e6c8] transition-colors mb-4"
              >
                <span>{getCategoryIcon(category.icon, category.slug)}</span>
                {category.name}
              </Link>
            )}

            {/* Product name */}
            <h1 className="text-xl sm:text-2xl lg:text-[2rem] font-bold text-[#1a1a1a] leading-tight tracking-tight">
              {product.name}
            </h1>

            {/* Unit and Brand */}
            <div className="flex flex-wrap items-center gap-3 mt-3">
              {product.unit && (
                <span className="text-sm font-medium text-[#0E7A0E] bg-[#e8f5e9] px-2.5 py-0.5 rounded-full">
                  {product.unit}
                </span>
              )}
              {product.brand && (
                <span className="text-sm text-[#6b6b6b]">
                  {product.brand}
                </span>
              )}
              <WhatsAppBadge />
            </div>

            {/* Stock status */}
            {lowStock && !outOfStock && (
              <p className="mt-3 text-sm text-[#F5A623] font-medium flex items-center gap-1.5">
                <Package className="w-4 h-4" />
                Quedan pocas unidades — ¡apresúrate!
              </p>
            )}

            {/* Price */}
            <div className="mt-4 sm:mt-6 pt-4 sm:pt-6 border-t border-[#ede8df]">
              <div className="flex items-baseline gap-3">
                <span className="text-2xl sm:text-3xl font-bold text-[#1a1a1a]">
                  ${displayPrice.toFixed(2)}
                </span>
                {hasDiscount && (
                  <>
                    <span className="text-lg text-[var(--text-secondary)] line-through">
                      ${originalPrice.toFixed(2)}
                    </span>
                    <span className="text-sm font-semibold text-[#DE3534] bg-[#fdf2f2] px-2 py-0.5 rounded-full">
                      -{discountPercent}%
                    </span>
                  </>
                )}
              </div>
              {hasDiscount && (
                <p className="text-sm text-[#0E7A0E] font-medium mt-1.5">
                  Ahorras ${(originalPrice - displayPrice).toFixed(2)}
                </p>
              )}
              {product.unit && (
                <p className="text-xs text-[#6b6b6b] mt-1">
                  Precio por {product.unit.toLowerCase()}
                </p>
              )}
            </div>

            {/* Quality guarantee badge — prominent trust signal */}
            <div className="mt-3 flex items-center gap-2 px-3 py-2 bg-[#e8f5e9] rounded-xl border border-[#c8e6c8]">
              <Check className="w-4 h-4 text-[#0E7A0E] shrink-0" />
              <p className="text-xs font-medium text-[#1E6E1E]">
                Calidad garantizada o te devolvemos tu dinero · Factura (CFDI) incluida
              </p>
            </div>

            {/* Quantity selector */}
            {!outOfStock && (
              <div className="mt-5">
                <p className="text-sm font-medium text-[#1a1a1a] mb-2">Cantidad</p>
                <div className="inline-flex items-center border border-[#ede8df] rounded-lg overflow-hidden">
                  <button
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                    className="w-10 h-10 flex items-center justify-center text-[#6b6b6b] hover:bg-[#f0ede5] transition-colors"
                    disabled={quantity <= 1}
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <span className="w-12 text-center text-sm font-semibold text-[#1a1a1a] select-none">
                    {quantity}
                  </span>
                  <button
                    onClick={() => setQuantity(quantity + 1)}
                    className="w-10 h-10 flex items-center justify-center text-[#6b6b6b] hover:bg-[#f0ede5] transition-colors"
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
                    : "bg-[#0E7A0E] text-white hover:bg-[#0D720D] active:bg-[#0A610A] disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
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

              <OrderByWhatsAppButton
                phoneNumber={process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "5216145337486"}
                productName={product.name}
                productPrice={displayPrice}
                quantity={quantity}
                className="flex-1 h-12 flex items-center justify-center gap-2 text-sm font-semibold rounded-xl border-2 border-[#25D366] text-[#0F7A3D] hover:bg-[#0F7A3D] hover:text-white transition-all duration-200"
              />
            </div>

            {/* Description — Erewhon-style accordion */}
            <div className="mt-6 sm:mt-8 pt-4 sm:pt-6 border-t border-[#e0dbd2]">
              {/* Description accordion item */}
              <div className="border-b border-[#ede8df] pb-3 mb-3">
                <button
                  className="accordion-header flex items-center justify-between w-full text-left text-sm font-semibold text-[#1a1a1a] py-2 uppercase tracking-wider"
                  onClick={(e) => {
                    const btn = e.currentTarget;
                    const isOpen = btn.getAttribute("aria-expanded") === "true";
                    btn.setAttribute("aria-expanded", String(!isOpen));
                    const body = btn.nextElementSibling as HTMLElement;
                    if (body) {
                      if (isOpen) { body.classList.remove("open"); }
                      else { body.classList.add("open"); }
                    }
                  }}
                  aria-expanded="true"
                >
                  Descripción
                  <span className="accordion-icon text-lg leading-none text-[var(--text-secondary)]">+</span>
                </button>
                <div className="accordion-body open">
                  <p className="text-sm text-[#6b6b6b] leading-relaxed whitespace-pre-line">
                    {product.description || "Producto seleccionado directamente en la Central de Abastos. Frescura garantizada para que tu negocio sirva siempre lo mejor. Origen verificado, manejo sanitario certificado."}
                  </p>
                </div>
              </div>

              {/* Quality accordion item */}
              <div className="border-b border-[#ede8df] pb-3 mb-3">
                <button
                  className="accordion-header flex items-center justify-between w-full text-left text-sm font-semibold text-[#1a1a1a] py-2 uppercase tracking-wider"
                  onClick={(e) => {
                    const btn = e.currentTarget;
                    const isOpen = btn.getAttribute("aria-expanded") === "true";
                    btn.setAttribute("aria-expanded", String(!isOpen));
                    const body = btn.nextElementSibling as HTMLElement;
                    if (body) {
                      if (isOpen) { body.classList.remove("open"); }
                      else { body.classList.add("open"); }
                    }
                  }}
                  aria-expanded="false"
                >
                  Calidad y Origen
                  <span className="accordion-icon text-lg leading-none text-[var(--text-secondary)]">+</span>
                </button>
                <div className="accordion-body">
                  <p className="text-sm text-[#6b6b6b] leading-relaxed">
                    <strong>Calidad garantizada para tu negocio.</strong> Todos nuestros productos provienen directamente de distribuidores autorizados en la Central de Abastos. Cada lote pasa por control de frescura, temperatura y manejo sanitario antes de salir a ruta. Si algo no llega en condiciones óptimas, te lo reponemos sin costo.
                  </p>
                </div>
              </div>

              {/* Delivery accordion item */}
              <div>
                <button
                  className="accordion-header flex items-center justify-between w-full text-left text-sm font-semibold text-[#1a1a1a] py-2 uppercase tracking-wider"
                  onClick={(e) => {
                    const btn = e.currentTarget;
                    const isOpen = btn.getAttribute("aria-expanded") === "true";
                    btn.setAttribute("aria-expanded", String(!isOpen));
                    const body = btn.nextElementSibling as HTMLElement;
                    if (body) {
                      if (isOpen) { body.classList.remove("open"); }
                      else { body.classList.add("open"); }
                    }
                  }}
                  aria-expanded="false"
                >
                  Envíos y Devoluciones
                  <span className="accordion-icon text-lg leading-none text-[var(--text-secondary)]">+</span>
                </button>
                <div className="accordion-body">
                  <p className="text-sm text-[#6b6b6b] leading-relaxed">
                    Envío gratis en pedidos superiores a $2,500 MXN en {cityName}. Entregas el mismo día. Productos perecederos cuentan con garantía de frescura. Facturación electrónica incluida.
                  </p>
                </div>
              </div>
            </div>

            {/* Delivery info — Erewhon-style glass box */}
            <div className="mt-6 p-4 rounded-xl border border-[#e0dbd2] bg-[#faf8f5]/80 backdrop-blur-sm">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-[#0E7A0E]/10 flex items-center justify-center shrink-0">
                  <Package className="w-5 h-5 text-[#0E7A0E]" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#1a1a1a]">
                    Entrega en {cityName}
                  </p>
                  <p className="text-xs text-[#6b6b6b] mt-0.5 leading-relaxed">
                    Envío gratis desde $2,500 MXN. Entrega el mismo día.
                    Facturación electrónica incluida.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* También te puede interesar — Erewhon-style */}
        {relatedProducts.length > 0 && (
          <ScrollReveal>
            <section className="mt-10 sm:mt-14 pt-6 sm:pt-8 border-t border-[#e0dbd2]">
              <h2 className="text-lg sm:text-xl font-bold text-[#1a1a1a] mb-5 tracking-tight">
                También te puede interesar
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
              {relatedProducts.map((rp) => (
                  <ProductCard
                    key={rp.id}
                    product={rp}
                    citySlug={citySlug}
                  />
              ))}
            </div>
          </section>
        </ScrollReveal>
        )}
      </div>

      {/* Barra sticky add-to-cart — solo móvil. Se oculta automáticamente cuando
          hay items en el carrito (body.cart-bar-active, ver globals.css). */}
      {!outOfStock && (
        <div className="sticky-atc-bar fixed bottom-0 left-0 right-0 z-40 sm:hidden">
          <div className="flex items-center gap-3 px-4 py-3 bg-white border-t border-[#e0dbd2] shadow-[0_-4px_16px_rgba(0,0,0,0.08)] pb-[calc(0.75rem+var(--inset-bottom))]">
            {/* Stepper de cantidad */}
            <div className="flex items-center border border-[#ede8df] rounded-lg overflow-hidden shrink-0">
              <button
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                disabled={quantity <= 1}
                className="w-10 h-10 flex items-center justify-center text-[#6b6b6b] hover:bg-[#f0ede5] transition-colors touch-target"
                aria-label="Disminuir cantidad"
              >
                <Minus className="w-4 h-4" />
              </button>
              <span className="w-10 text-center text-sm font-semibold text-[#1a1a1a] select-none">
                {quantity}
              </span>
              <button
                onClick={() => setQuantity(quantity + 1)}
                className="w-10 h-10 flex items-center justify-center text-[#6b6b6b] hover:bg-[#f0ede5] transition-colors touch-target"
                aria-label="Aumentar cantidad"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            {/* Precio total */}
            <div className="flex-1 min-w-0">
              <p className="text-xs text-[#6b6b6b]">Total</p>
              <p className="text-base font-bold text-[#1a1a1a] leading-tight truncate">
                ${(displayPrice * quantity).toFixed(2)}
              </p>
            </div>

            {/* CTA */}
            <button
              onClick={handleAdd}
              className={`flex items-center justify-center gap-1.5 shrink-0 h-11 px-4 rounded-xl text-sm font-semibold transition-all duration-200 touch-target ${
                added
                  ? "bg-green-500 text-white"
                  : "bg-[#0E7A0E] text-white hover:bg-[#0D720D] active:bg-[#0A610A] shadow-sm"
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
                  Agregar
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
