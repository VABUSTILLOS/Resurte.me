"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { useSearchParams } from "next/navigation"
import { Search, ShoppingBag, ArrowLeft } from "lucide-react"
import { ProductCard } from "@/components/product/product-card"
import { SearchBar } from "@/components/search/search-bar"
import type { Product } from "@/types"
import Link from "next/link"

interface SearchPageClientProps {
  citySlug: string
  cityName: string
  products: (Product & {
    product_stores: { store_id: number; price: number; sale_price: number | null; is_available: boolean; stock_status: string }[]
  })[]
}

export function SearchPageClient({ citySlug, cityName, products }: SearchPageClientProps) {
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

  const performSearch = useCallback((q: string) => {
    const term = q.toLowerCase().trim()

    // If no query, show all products
    if (!term) {
      setResults(flatProducts)
      return
    }

    if (term.length < 2) {
      setResults([])
      return
    }

    setResults(
      flatProducts.filter(
        (p) =>
          p.name.toLowerCase().includes(term) ||
          p.description?.toLowerCase().includes(term) ||
          p.brand?.toLowerCase().includes(term)
      )
    )
  }, [flatProducts])

  useEffect(() => {
    performSearch(query)
  }, [query, performSearch])

  const hasResults = results.length > 0
  const isShowingAll = !query

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      {/* Back link */}
      <Link
        href={`/${citySlug}`}
        className="inline-flex items-center gap-1.5 text-sm text-[#72767E] hover:text-[#108910] transition-colors mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Volver a la tienda
      </Link>

      {/* Search header */}
      <div className="mb-8">
        <SearchBar citySlug={citySlug} className="max-w-lg mx-auto" />
      </div>

      {/* Results */}
      {query.length > 0 && query.length < 2 && (
        <p className="text-center text-gray-400 py-12">
          Escribe al menos 2 caracteres para buscar.
        </p>
      )}

      {query.length >= 2 && !hasResults && (
        <div className="text-center py-16">
          <Search className="w-16 h-16 text-gray-200 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-700 mb-1">
            Sin resultados
          </h2>
          <p className="text-gray-400">
            No encontramos productos para &quot;{query}&quot; en {cityName}.
          </p>
        </div>
      )}

      {hasResults && (
        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-brand-600" />
            {isShowingAll
              ? `Todos los productos (${results.length})`
              : `Resultados (${results.length})`}
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {results.map((product) => (
              <ProductCard key={product.id} product={product} citySlug={citySlug} />
            ))}
          </div>
        </section>
      )}

      {isShowingAll && !hasResults && (
        <div className="text-center py-16">
          <ShoppingBag className="w-16 h-16 text-gray-200 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-700 mb-1">
            Sin productos disponibles
          </h2>
          <p className="text-gray-400">
            No hay productos disponibles en este momento.
          </p>
        </div>
      )}
    </div>
  )
}
