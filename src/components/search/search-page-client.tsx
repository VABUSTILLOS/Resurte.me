"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { useSearchParams } from "next/navigation"
import { Search, ShoppingBag, ArrowLeft, SlidersHorizontal } from "lucide-react"
import { ProductCard } from "@/components/product/product-card"
import { SearchBar } from "@/components/search/search-bar"
import { ScrollReveal } from "@/components/ui/scroll-reveal"
import type { Product, Category } from "@/types"
import { getCategoryIcon } from "@/lib/utils"
import Link from "next/link"

interface SearchPageClientProps {
  citySlug: string
  cityName: string
  products: (Product & {
    product_stores: { store_id: number; price: number; sale_price: number | null; is_available: boolean; stock_status: string }[]
  })[]
  categories: Category[]
}

export function SearchPageClient({ citySlug, cityName, products, categories }: SearchPageClientProps) {
  const searchParams = useSearchParams()
  const query = searchParams.get("q") ?? ""

  // Flatten product_store data
  const flatProducts = useMemo(() => products.map((p) => ({
    ...p,
    price: p.product_stores[0]?.price ?? 0,
    sale_price: p.product_stores[0]?.sale_price ?? null,
    stock_status: p.product_stores[0]?.stock_status ?? "in_stock",
  })), [products])

  type FlatProduct = (typeof flatProducts)[number]
  const [results, setResults] = useState<FlatProduct[]>([])
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null)

  const performSearch = useCallback((q: string, catId: number | null) => {
    const term = q.toLowerCase().trim()

    // Start with all products or category-filtered
    let filtered = catId
      ? flatProducts.filter((p) => p.category_id === catId)
      : flatProducts

    // If no query, show filtered products
    if (!term) {
      setResults(filtered)
      return
    }

    if (term.length < 2) {
      setResults([])
      return
    }

    setResults(
      filtered.filter(
        (p) =>
          p.name.toLowerCase().includes(term) ||
          p.description?.toLowerCase().includes(term) ||
          p.brand?.toLowerCase().includes(term)
      )
    )
  }, [flatProducts])

  useEffect(() => {
    performSearch(query, selectedCategory)
  }, [query, selectedCategory, performSearch])

  const handleCategoryToggle = (catId: number) => {
    setSelectedCategory(prev => prev === catId ? null : catId)
  }

  const hasResults = results.length > 0
  const isShowingAll = !query

  return (
    <div className="min-h-screen bg-[#faf8f5]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Back link */}
        <Link
          href={`/${citySlug}`}
          className="inline-flex items-center gap-1.5 text-sm text-[#6b6b6b] hover:text-[#108910] transition-colors mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Volver a la tienda
        </Link>

        {/* Search header */}
        <div className="mb-8">
          <SearchBar citySlug={citySlug} className="max-w-lg mx-auto" />
        </div>

        {/* Category filter chips — Erewhon-style pill selectors */}
        {categories.length > 0 && (
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-3">
              <SlidersHorizontal className="w-4 h-4 text-[#6b6b6b]" />
              <span className="text-sm font-medium text-[#6b6b6b]">Filtrar por categoría</span>
            </div>
            <div className="flex flex-wrap gap-2 overflow-x-auto pb-2 scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0">
              {/* "Todo" chip */}
              <button
                onClick={() => setSelectedCategory(null)}
                className={`shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
                  selectedCategory === null
                    ? "bg-[#108910] text-white shadow-md"
                    : "bg-white text-[#1a1a1a] border border-[#e0dbd2] hover:border-[#108910]/30 hover:bg-[#f7f5f0]"
                }`}
              >
                <ShoppingBag className="w-3.5 h-3.5" />
                Todo
              </button>
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => handleCategoryToggle(cat.id)}
                  className={`shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
                    selectedCategory === cat.id
                      ? "bg-[#108910] text-white shadow-md"
                      : "bg-white text-[#1a1a1a] border border-[#e0dbd2] hover:border-[#108910]/30 hover:bg-[#f7f5f0]"
                  }`}
                >
                  <span className="text-base">{getCategoryIcon(cat.icon)}</span>
                  {cat.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Results */}
        {query.length > 0 && query.length < 2 && (
          <p className="text-center text-[#999893] py-12">
            Escribe al menos 2 caracteres para buscar.
          </p>
        )}

        {query.length >= 2 && !hasResults && (
          <div className="text-center py-16">
            <Search className="w-16 h-16 text-[#e0dbd2] mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-[#1a1a1a] mb-1">
              Sin resultados
            </h2>
            <p className="text-[#6b6b6b]">
              No encontramos productos para &quot;{query}&quot; en {cityName}.
            </p>
          </div>
        )}

        {hasResults && (
          <section>
            <h2 className="text-lg font-bold text-[#1a1a1a] mb-5 flex items-center gap-2">
              <ShoppingBag className="w-5 h-5 text-[#108910]" />
              {isShowingAll
                ? `Todos los productos (${results.length})`
                : `Resultados (${results.length})`}
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
              {results.map((product, idx) => (
                <ScrollReveal key={product.id} direction="scale" delay={idx * 0.03}>
                  <ProductCard product={product} citySlug={citySlug} />
                </ScrollReveal>
              ))}
            </div>
          </section>
        )}

        {isShowingAll && !hasResults && (
          <div className="text-center py-16">
            <ShoppingBag className="w-16 h-16 text-[#e0dbd2] mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-[#1a1a1a] mb-1">
              Sin productos disponibles
            </h2>
            <p className="text-[#6b6b6b]">
              No hay productos disponibles en este momento.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
