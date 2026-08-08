"use client"

import Link from "next/link"
import { ArrowLeft, ShoppingBag } from "lucide-react"
import { ProductCard } from "@/components/product/product-card"
import { SearchBar } from "@/components/search/search-bar"
import { ScrollReveal } from "@/components/ui/scroll-reveal"
import type { Product } from "@/types"
import { getCategoryIcon } from "@/lib/utils"

interface CategoryPageClientProps {
  citySlug: string
  cityName: string
  category: { id: number; name: string; slug: string; icon: string; description?: string | null; parent_id?: number | null }
  products: Product[]
}

export function CategoryPageClient({ citySlug, cityName, category, products }: CategoryPageClientProps) {
  // Products now have price/sale_price/stock_status directly

  return (
    <div className="min-h-screen bg-[#faf8f5]">
      {/* Header — Erewhon cream palette */}
      <div className="bg-[#f7f4ef] border-b border-[#ede8df]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-sm text-[#6b6b6b] mb-4">
            <Link href={`/${citySlug}`} className="hover:text-[#0E7A0E] transition-colors">
              {cityName}
            </Link>
            <span className="text-[var(--text-secondary)]">/</span>
            <span className="text-[#1a1a1a] font-medium">{category.name}</span>
          </div>

          {/* Category header */}
          <ScrollReveal>
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-[#0E7A0E]/10 flex items-center justify-center text-3xl shadow-sm">
                {getCategoryIcon(category.icon, category.slug)}
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-[#1a1a1a] tracking-tight">{category.name}</h1>
                {category.description && (
                  <p className="text-sm text-[#6b6b6b] mt-1">{category.description}</p>
                )}
              </div>
            </div>
          </ScrollReveal>

          {/* Search */}
          <div className="mt-5 max-w-md">
            <SearchBar citySlug={citySlug} />
          </div>
        </div>
      </div>

      {/* Products grid — Erewhon-style */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center gap-2 mb-6">
          <ShoppingBag className="w-5 h-5 text-[#0E7A0E]" />
          <h2 className="text-lg font-semibold text-[#1a1a1a]">
            {products.length} producto{products.length !== 1 ? "s" : ""}
          </h2>
        </div>

        {products.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-[var(--text-secondary)]">No hay productos en esta categoría por el momento.</p>
            <Link
              href={`/${citySlug}`}
              className="inline-flex items-center gap-2 mt-4 text-sm font-semibold text-[#0E7A0E] hover:text-[#0D720D]"
            >
              <ArrowLeft className="w-4 h-4" />
              Volver al inicio
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
            {products.map((product, idx) => (
              <ScrollReveal key={product.id} direction="scale" delay={idx * 0.04}>
                <ProductCard
                  product={product}
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
            Ver todas las categorías
          </Link>
        </div>
      </div>
    </div>
  )
}
