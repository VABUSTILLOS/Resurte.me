"use client"

import Link from "next/link"
import { ArrowLeft, ShoppingBag, Box, TrendingUp, Truck } from "lucide-react"
import Image from "next/image"
import { ProductCard } from "@/components/product/product-card"
import { SearchBar } from "@/components/search/search-bar"
import { ScrollReveal } from "@/components/ui/scroll-reveal"
import type { Product } from "@/types"

const COLLECTION_ICONS: Record<string, string> = {
  taquerias: "🌮",
  hamburgueserias: "🍔",
  sushi: "🍣",
  pizzeria: "🍕",
  cafeteria: "☕",
  marisquerias: "🦐",
  fondas: "🍲",
}

interface CollectionPageClientProps {
  citySlug: string
  cityName: string
  collection: {
    id: number
    name: string
    slug: string
    description: string | null
    image_url: string | null
    tags: string[]
  }
  products: (Product & {
    product_stores: { store_id: number; price: number; sale_price: number | null; is_available: boolean; stock_status: string }[]
  })[]
}

export function CollectionPageClient({ citySlug, cityName, collection, products }: CollectionPageClientProps) {
  const icon = COLLECTION_ICONS[collection.slug] || "📦"

  // Flatten product_store data
  const flatProducts = products.map((p) => ({
    ...p,
    price: p.product_stores[0]?.price ?? 0,
    sale_price: p.product_stores[0]?.sale_price ?? null,
    stock_status: p.product_stores[0]?.stock_status ?? "in_stock",
  }))

  return (
    <div className="min-h-screen bg-[#faf8f5]">
      {/* Hero header — B2B institutional */}
      <div className="bg-[#f7f4ef] border-b border-[#ede8df]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-sm text-[#6b6b6b] mb-5">
            <Link href={`/${citySlug}`} className="hover:text-[#108910] transition-colors">
              {cityName}
            </Link>
            <span className="text-[#999893]">/</span>
            <span className="text-[#1a1a1a] font-medium">{collection.name}</span>
          </div>

          <ScrollReveal>
            <div className="flex flex-col sm:flex-row sm:items-center gap-5">
              {/* Collection icon/image */}
              <div className="shrink-0">
                {collection.image_url ? (
                  <div className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-2xl overflow-hidden shadow-md">
                    <Image
                      src={collection.image_url}
                      alt={collection.name}
                      fill
                      sizes="96px"
                      className="object-cover"
                    />
                  </div>
                ) : (
                  <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-[#108910]/10 flex items-center justify-center text-4xl shadow-sm">
                    {icon}
                  </div>
                )}
              </div>

              <div className="flex-1">
                <h1 className="text-2xl sm:text-3xl font-bold text-[#1a1a1a] tracking-tight">
                  {collection.name}
                </h1>
                <p className="text-sm sm:text-base text-[#6b6b6b] mt-1.5 max-w-2xl leading-relaxed">
                  {collection.description || `Insumos curados por mayoreo para ${collection.name.toLowerCase()}. Precios institucionales sin mínimo de compra.`}
                </p>
              </div>
            </div>
          </ScrollReveal>

          {/* B2B value badges */}
          <div className="flex flex-wrap gap-3 mt-5">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#6b6b6b] bg-white rounded-full px-3 py-1.5 shadow-sm border border-[#ede8df]">
              <Box className="w-3.5 h-3.5 text-[#108910]" />
              Venta por volumen
            </span>
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#6b6b6b] bg-white rounded-full px-3 py-1.5 shadow-sm border border-[#ede8df]">
              <TrendingUp className="w-3.5 h-3.5 text-[#108910]" />
              Precio institucional
            </span>
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#6b6b6b] bg-white rounded-full px-3 py-1.5 shadow-sm border border-[#ede8df]">
              <Truck className="w-3.5 h-3.5 text-[#108910]" />
              Entrega programada
            </span>
          </div>

          {/* Search */}
          <div className="mt-5 max-w-md">
            <SearchBar citySlug={citySlug} />
          </div>
        </div>
      </div>

      {/* Products grid */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center gap-2 mb-6">
          <ShoppingBag className="w-5 h-5 text-[#108910]" />
          <h2 className="text-lg font-semibold text-[#1a1a1a]">
            {flatProducts.length} producto{flatProducts.length !== 1 ? "s" : ""} en esta colección
          </h2>
        </div>

        {flatProducts.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-5xl mb-4">{icon}</div>
            <p className="text-[#999893] text-lg">Estamos curando los mejores insumos para esta colección.</p>
            <p className="text-[#b0b0b0] text-sm mt-2">Vuelve pronto — estamos agregando productos cada semana.</p>
            <Link
              href={`/${citySlug}`}
              className="inline-flex items-center gap-2 mt-6 text-sm font-semibold text-[#108910] hover:text-[#0D720D] btn-pill btn-pill-outline"
            >
              <ArrowLeft className="w-4 h-4" />
              Volver al inicio
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
            {flatProducts.map((product, idx) => (
              <ScrollReveal key={product.id} direction="scale" delay={idx * 0.04}>
                <ProductCard
                  product={product}
                  storeId={1}
                  storeName="Resurte.me"
                  storeSlug="resurte"
                  citySlug={citySlug}
                />
              </ScrollReveal>
            ))}
          </div>
        )}

        {/* Back link */}
        <div className="mt-12 text-center">
          <Link
            href={`/${citySlug}`}
            className="btn-pill btn-pill-outline inline-flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Ver todas las colecciones
          </Link>
        </div>
      </div>
    </div>
  )
}
