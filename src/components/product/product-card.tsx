"use client"

import { Plus, Check, Minus, Heart, MessageCircle } from "lucide-react"
import Image from "next/image"
import type { Product } from "@/types"
import { useCart } from "@/contexts/cart-context"
import { useFavorites } from "@/contexts/favorites-context"
import { useToast } from "@/components/toast"
import { cn, getProductTagline } from "@/lib/utils"
import { haptic } from "@/lib/haptics"
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
  /** Preload de la imagen (fetchpriority=high): solo primera fila del grid. */
  priority?: boolean
}

export const ProductCard = memo(function ProductCard({
  product,
  whatsappNumber,
  citySlug,
  onAddToCart,
  priority = false,
}: ProductCardProps) {
  const { addItem, cart, updateQuantity } = useCart()
  const { toast } = useToast()
  const { toggle: toggleFavorite, isFavorite } = useFavorites()
  const [added, setAdded] = useState(false)
  const favorited = isFavorite(product.id)

  const price = product.sale_price ?? product.price
  const hasDiscount = product.sale_price && product.sale_price < product.price
  const discountPercent = product.sale_price && product.sale_price < product.price
    ? Math.round((1 - product.sale_price / product.price) * 100)
    : 0
  const outOfStock = product.stock_status === "out_of_stock"
  const lowStock = product.stock_status === "low_stock"

  // ¿El producto ya está en el carrito? Entonces mostramos stepper (− N +)
  // en lugar del botón Agregar: ajustar la cantidad de un pedido grande (30+
  // insumos) sin abrir el drawer es la interacción más repetida del usuario
  // B2B en móvil.
  const cartItem = cart.items.find((i) => i.product_id === product.id)

  // Second image for hover swap effect
  const secondaryImage = product.images?.[1]

  // Extract scanning-friendly tagline from product description.
  // Fallback: use the raw description (truncated by line-clamp) or a neutral
  // line so cards with little text stay visually full (Fase 10).
  const tagline = getProductTagline(product.description) ?? product.description?.trim() ?? null

  // CTA "Avísame" para productos agotados: convierte una venta perdida en
  // conversación de WhatsApp (y en lead para recompra cuando vuelva el stock).
  const notifyMeUrl =
    outOfStock && whatsappNumber
      ? `https://wa.me/${whatsappNumber.replace(/\D/g, "")}?text=${encodeURIComponent(
          `Hola, ¿me avisan cuando vuelva a haber *${product.name}*?`
        )}`
      : null

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

    // Micro-vibración táctil: confirma el agregado en móvil aunque el usuario
    // no esté viendo el toast (pantalla grande, pulgar sobre el toast).
    haptic(10)
    toast(`${product.name} agregado al carrito`)
    setAdded(true)
    setTimeout(() => setAdded(false), 1200)
  }

  const handleStep = (e: React.MouseEvent, delta: 1 | -1) => {
    e.preventDefault()
    e.stopPropagation()
    if (!cartItem) return
    haptic(8)
    // quantity 0 elimina el item (lo maneja el reducer del contexto)
    updateQuantity(product.id, cartItem.quantity + delta)
  }

  return (
    <div className="product-card group relative flex flex-col h-full" style={{ contentVisibility: "auto", containIntrinsicSize: "auto 250px" }}>
      <Link
        href={`/${citySlug}/producto/${product.slug}`}
        className="flex-1 flex flex-col relative bg-white rounded-xl border border-[#e0dbd2] overflow-hidden hover:shadow-[0_2px_20px_rgba(0,0,0,0.07)] focus-visible:ring-2 focus-visible:ring-[#0E7A0E] focus-visible:ring-offset-1 transition-all duration-300 ease-out hover:-translate-y-0.5"
      >
        {/* Product image — Erewhon-style image swap on hover */}
        <div className={cn("aspect-[4/3] sm:aspect-[3/2] lg:aspect-[5/3] bg-[#faf8f5] relative overflow-hidden", secondaryImage && "product-card-img-swap")}>
          {product.image_url ? (
            <>
              <Image
                src={product.image_url}
                alt={product.name}
                fill
                priority={priority}
                placeholder="blur"
                blurDataURL="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 300'%3E%3Crect fill='%23faf8f5' width='400' height='300'/%3E%3C/svg%3E"
                sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                className="object-contain p-1.5 sm:p-2 product-card-img-primary"
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
                  className="object-contain p-1.5 sm:p-2 product-card-img-secondary"
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
        <div className="p-2.5 pb-1.5 sm:p-3 sm:pb-2 flex-1 flex flex-col">
          {product.unit && (
            <p className="text-[10px] sm:text-[11px] text-[#0E7A0E] font-medium mb-0.5 sm:mb-1 uppercase tracking-wide">
              {product.unit}
            </p>
          )}
          {product.brand && (
            <p className="text-[11px] sm:text-xs text-[var(--text-secondary)] mb-0.5">{product.brand}</p>
          )}
          {/* Scanning-friendly tagline — last sentence of description as a use-case hint */}
          <p className="text-[11px] text-[var(--text-secondary)] mb-0.5 line-clamp-1 italic">
            {tagline ?? "Abasto directo, sin mínimo de compra"}
          </p>
          <h3 className="text-[13px] sm:text-sm text-[#1a1a1a] font-medium line-clamp-2 leading-tight group-hover:text-[#0E7A0E] transition-colors duration-200">
            {product.name}
          </h3>

          <div className="flex items-center gap-2 mt-1.5 sm:mt-2">
            <span className="text-sm sm:text-base font-bold text-[#1a1a1a]">
              ${price.toFixed(2)}
            </span>
            {hasDiscount && (
              <span className="text-xs sm:text-sm text-[var(--text-secondary)] line-through">
                ${product.price.toFixed(2)}
              </span>
            )}
          </div>

          {hasDiscount && product.sale_price != null && (
            <p className="text-[10px] sm:text-[11px] text-[#0E7A0E] font-medium mt-0.5">
              Ahorras ${(product.price - product.sale_price).toFixed(2)}
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

<<<<<<< HEAD
      {/* Favorito (lista de resurtido) — fuera del Link para no anidar
          interactivos; posicionado sobre la esquina de la imagen. */}
      <button
        type="button"
        onClick={() => toggleFavorite(product.id)}
        aria-label={favorited ? `Quitar ${product.name} de mi lista de resurtido` : `Agregar ${product.name} a mi lista de resurtido`}
        aria-pressed={favorited}
        className="absolute top-2 right-2 z-20 p-2 rounded-full bg-white/90 backdrop-blur-sm shadow-sm border border-[#e0dbd2] hover:scale-110 active:scale-95 transition-transform touch-target"
      >
        <Heart
          className={cn(
            "w-4 h-4 transition-colors",
            favorited ? "fill-[#de3534] text-[#de3534]" : "text-[#6b6b6b]"
          )}
        />
      </button>

      {/* Quick-add button — mobile: inline dentro del card (sin saliente que
          pise la fila siguiente). ≥sm: Erewhon-style, flota bajo el card. */}
      {!outOfStock ? (
=======
      {/* Acción principal del card:
          1) ya en carrito → stepper − N + (siempre visible, comunica el estado)
          2) disponible    → quick-add
          3) agotado       → "Avísame" por WhatsApp o spacer */}
      {cartItem && !outOfStock ? (
        <div
          role="group"
          aria-label={`${product.name}: ${cartItem.quantity} en el carrito`}
          className="flex items-center justify-between w-[calc(100%-1.75rem)] mx-auto mt-2 mb-3 sm:mb-0 sm:w-auto sm:absolute sm:-bottom-2 sm:left-1/2 sm:-translate-x-1/2 sm:z-10 sm:min-w-[7.5rem] rounded-full bg-[#0E7A0E] text-white shadow-lg"
        >
          <button
            type="button"
            onClick={(e) => handleStep(e, -1)}
            aria-label={cartItem.quantity === 1 ? `Quitar ${product.name} del carrito` : `Quitar una unidad de ${product.name}`}
            className="p-2 sm:p-1.5 rounded-full hover:bg-white/15 transition-colors touch-target"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <span aria-live="polite" className="min-w-[1.5rem] text-center text-sm font-bold tabular-nums">
            {cartItem.quantity}
          </span>
          <button
            type="button"
            onClick={(e) => handleStep(e, 1)}
            aria-label={`Agregar otra unidad de ${product.name}`}
            className="p-2 sm:p-1.5 rounded-full hover:bg-white/15 transition-colors touch-target"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : !outOfStock ? (
>>>>>>> 25e9cb9 (feat(catalogo): fase C11 — stepper − N + en la card cuando el producto ya está en el carrito (ajuste rápido sin abrir el drawer))
        <button
          onClick={handleAdd}
          aria-label={`Agregar ${product.name} al carrito`}
          className={cn(
            "quick-add-btn flex items-center justify-center gap-1.5 w-[calc(100%-1.75rem)] mx-auto mt-2 sm:mt-0 mb-3 sm:mb-0 sm:w-auto sm:absolute sm:-bottom-2 sm:left-1/2 sm:-translate-x-1/2 sm:z-10 px-3 py-1.5 sm:px-5 sm:py-2 rounded-full text-xs sm:text-sm font-semibold transition-all duration-300 ease-out shadow-lg touch-target active:scale-95",
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
      ) : notifyMeUrl ? (
        /* Producto agotado con canal de WhatsApp: CTA "Avísame" para capturar
           la demanda en lugar de perder la venta. Ocupa el mismo slot que el
           quick-add para que el grid no se desacomode. */
        <a
          href={notifyMeUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          aria-label={`Avísame por WhatsApp cuando haya ${product.name}`}
          className="flex items-center justify-center gap-1.5 w-[calc(100%-1.75rem)] mx-auto mt-2 mb-3 sm:mb-0 sm:w-auto sm:absolute sm:-bottom-2 sm:left-1/2 sm:-translate-x-1/2 sm:z-10 px-3 py-1.5 sm:px-4 sm:py-2 rounded-full text-xs sm:text-sm font-semibold border-[1.5px] border-[#0E7A0E] text-[#0E7A0E] bg-white hover:bg-[#F0FDF4] transition-all shadow-lg touch-target whitespace-nowrap"
        >
          <MessageCircle className="w-3.5 h-3.5" aria-hidden="true" /> Avísame
        </a>
      ) : (
        /* Cards agotadas: reservar la misma altura del botón en móvil para
           que las filas del grid 2-col no queden desparejas. ≥sm el botón
           flota (no ocupa espacio), así que el spacer solo aplica en móvil. */
        <div className="sm:hidden h-11" aria-hidden="true" />
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
        <p className="text-5xl mb-3" aria-hidden="true">🥑</p>
        <p className="text-gray-500 font-medium">No se encontraron productos.</p>
        <p className="text-sm text-gray-400 mt-1 mb-5">
          Prueba con otra categoría o revisa el catálogo completo.
        </p>
        <Link
          href={`/${citySlug}`}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-600 text-white text-sm font-semibold rounded-full hover:bg-brand-700 transition-colors"
        >
          Ver catálogo completo
        </Link>
      </div>
    )
  }

  return (
    <ul
      role="list"
      aria-label={`${products.length} productos`}
      className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-4"
    >
      {products.map((product, i) => (
        <li key={product.id} className="flex">
          <ProductCard
            product={product}
            whatsappNumber={whatsappNumber}
            citySlug={citySlug}
            onAddToCart={onAddToCart}
            // Solo la primera fila (4 en desktop, 2×2 en móvil) precarga su
            // imagen: el resto usa lazy por defecto para no competir con el LCP.
            priority={i < 4}
          />
        </li>
      ))}
    </ul>
  )
}
