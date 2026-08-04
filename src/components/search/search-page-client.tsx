"use client"

import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { useSearchParams } from "next/navigation"
import { Search, ShoppingBag, ArrowLeft, ArrowUpDown, X } from "lucide-react"
import { ProductCard } from "@/components/product/product-card"
import { SearchBar } from "@/components/search/search-bar"
import { ScrollReveal } from "@/components/ui/scroll-reveal"
import type { Product, Category } from "@/types"
import { getCategoryIcon } from "@/lib/utils"
import { loadMoreProducts } from "@/app/[slug]/buscar/actions"
import Link from "next/link"

type SortOption = "name" | "price-asc" | "price-desc"

type FlattenedProduct = Product & { price: number; sale_price: number | null; stock_status: string }

interface SearchPageClientProps {
  citySlug: string
  cityName: string
  products: FlattenedProduct[]
  categories: Category[]
  totalProducts: number
  pageSize: number
}

export function SearchPageClient({ citySlug, cityName, products, categories, totalProducts, pageSize }: SearchPageClientProps) {
  const searchParams = useSearchParams()
  const query = searchParams.get("q") ?? ""

  // Accumulated products (grows with infinite scroll)
  const [allProducts, setAllProducts] = useState<FlattenedProduct[]>(products)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(products.length < totalProducts)
  const [loadingMore, setLoadingMore] = useState(false)

  const [results, setResults] = useState<FlattenedProduct[]>(products)
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null)
  const [sortBy, setSortBy] = useState<SortOption>("name")
  const filterBarRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)

  // Build category-product count map for chip badges
  const categoryCounts = useMemo(() => {
    const map = new Map<number, number>()
    allProducts.forEach((p) => {
      map.set(p.category_id, (map.get(p.category_id) ?? 0) + 1)
    })
    return map
  }, [allProducts])

  // Sort results
  const sortedResults = useMemo(() => {
    const copy = [...results]
    switch (sortBy) {
      case "price-asc":
        return copy.sort((a, b) => a.price - b.price)
      case "price-desc":
        return copy.sort((a, b) => b.price - a.price)
      default:
        return copy.sort((a, b) => a.name.localeCompare(b.name))
    }
  }, [results, sortBy])

  const performSearch = useCallback((q: string, catId: number | null) => {
    const term = q.toLowerCase().trim()

    let filtered = catId
      ? allProducts.filter((p) => p.category_id === catId)
      : allProducts

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
  }, [allProducts])

  useEffect(() => {
    performSearch(query, selectedCategory)
  }, [query, selectedCategory, performSearch])

  // Infinite scroll: observe sentinel element
  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel || !hasMore || loadingMore) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setLoadingMore(true)
          loadMoreProducts(page).then(({ products: newProducts, hasMore: more }) => {
            setAllProducts((prev) => [...prev, ...newProducts])
            setPage((p) => p + 1)
            setHasMore(more)
            setLoadingMore(false)
          }).catch(() => {
            setLoadingMore(false)
          })
        }
      },
      { rootMargin: "200px" }
    )

    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [page, hasMore, loadingMore])

  const handleCategoryToggle = (catId: number) => {
    setSelectedCategory(prev => prev === catId ? null : catId)
  }

  const hasResults = sortedResults.length > 0
  const isShowingAll = !query
  const allCount = allProducts.length
  const selectedCat = selectedCategory ? categories.find(c => c.id === selectedCategory) : null

  // Skeleton cards for loading state
  const SkeletonCard = () => (
    <div className="bg-white rounded-xl border border-[#e0dbd2] overflow-hidden animate-pulse">
      <div className="aspect-[4/3] sm:aspect-square bg-[#f0ede6]" />
      <div className="p-3 space-y-2">
        <div className="h-3 bg-[#f0ede6] rounded w-1/3" />
        <div className="h-4 bg-[#f0ede6] rounded w-3/4" />
        <div className="h-5 bg-[#f0ede6] rounded w-1/2" />
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-[#faf8f5]">
      {/* Header — Erewhon cream palette, matching category page */}
      <div className="bg-[#f7f4ef] border-b border-[#ede8df]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-sm text-[#6b6b6b] mb-4">
            <Link href={`/${citySlug}`} className="hover:text-[#108910] transition-colors">
              {cityName}
            </Link>
            <span className="text-[#999893]">/</span>
            <span className="text-[#1a1a1a] font-medium">Todos los productos</span>
          </div>

          {/* Title */}
          <ScrollReveal>
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-[#108910]/10 flex items-center justify-center text-3xl shadow-sm">
                <ShoppingBag className="w-7 h-7 text-[#108910]" />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-[#1a1a1a] tracking-tight">
                  Todos los productos
                </h1>
                <p className="text-sm text-[#6b6b6b] mt-1">
                  {allCount} de {totalProducts} productos — por caja, bulto o pieza
                </p>
              </div>
            </div>
          </ScrollReveal>

          {/* Search */}
          <div className="mt-5 max-w-md">
            <SearchBar citySlug={citySlug} />
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {/* Filter & sort bar — sticky on scroll */}
        <div
          ref={filterBarRef}
          className="sticky top-0 z-20 bg-[#faf8f5]/95 backdrop-blur-sm -mx-4 px-4 sm:mx-0 sm:px-0 py-3 mb-6 border-b border-[#ede8df]"
        >
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            {/* Category chips */}
            <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide flex-1">
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
                <span className="text-xs opacity-70 ml-0.5">{allCount}</span>
              </button>
              {categories.map((cat) => {
                const count = categoryCounts.get(cat.id) ?? 0
                if (count === 0) return null
                return (
                  <button
                    key={cat.id}
                    onClick={() => handleCategoryToggle(cat.id)}
                    className={`shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
                      selectedCategory === cat.id
                        ? "bg-[#108910] text-white shadow-md"
                        : "bg-white text-[#1a1a1a] border border-[#e0dbd2] hover:border-[#108910]/30 hover:bg-[#f7f5f0]"
                    }`}
                  >
                    <span className="text-base">{getCategoryIcon(cat.icon, cat.slug)}</span>
                    {cat.name}
                    <span className="text-xs opacity-70 ml-0.5">{count}</span>
                  </button>
                )
              })}
            </div>

            {/* Sort dropdown & active filter indicator */}
            <div className="flex items-center gap-2 shrink-0">
              {selectedCategory && selectedCat && (
                <button
                  onClick={() => setSelectedCategory(null)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium bg-[#108910]/10 text-[#108910] hover:bg-[#108910]/20 transition-colors"
                >
                  {getCategoryIcon(selectedCat.icon, selectedCat.slug)} {selectedCat.name}
                  <X className="w-3 h-3" />
                </button>
              )}
              <div className="relative flex items-center gap-1.5 bg-white border border-[#e0dbd2] rounded-full px-3 py-1.5">
                <ArrowUpDown className="w-3.5 h-3.5 text-[#999893]" />
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortOption)}
                  className="text-xs font-medium text-[#1a1a1a] bg-transparent outline-none cursor-pointer appearance-none pr-1"
                >
                  <option value="name">Nombre A-Z</option>
                  <option value="price-asc">Menor precio</option>
                  <option value="price-desc">Mayor precio</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Results area */}
        {query.length > 0 && query.length < 2 && (
          <div className="text-center py-16">
            <Search className="w-16 h-16 text-[#e0dbd2] mx-auto mb-4" />
            <p className="text-[#999893]">
              Escribe al menos 2 caracteres para buscar.
            </p>
          </div>
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
            <Link
              href={`/${citySlug}/buscar`}
              className="inline-flex items-center gap-2 mt-4 text-sm font-semibold text-[#108910] hover:text-[#0D720D]"
            >
              <ArrowLeft className="w-4 h-4" />
              Ver todos los productos
            </Link>
          </div>
        )}

        {hasResults && (
          <section>
            <div className="flex items-center gap-2 mb-5">
              <ShoppingBag className="w-5 h-5 text-[#108910]" />
              <h2 className="text-lg font-semibold text-[#1a1a1a]">
                {isShowingAll && !selectedCategory
                  ? `${sortedResults.length} producto${sortedResults.length !== 1 ? "s" : ""}`
                  : `${sortedResults.length} resultado${sortedResults.length !== 1 ? "s" : ""}`}
                {selectedCat && <span className="text-[#6b6b6b] font-normal"> en {selectedCat.name}</span>}
              </h2>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
              {sortedResults.map((product, idx) => (
                <ScrollReveal key={product.id} direction="scale" delay={Math.min(idx * 0.03, 0.3)}>
                  <ProductCard product={product} storeId={1} storeName="Resurte.me" storeSlug="resurte" citySlug={citySlug} />
                </ScrollReveal>
              ))}
            </div>

            {/* Infinite scroll sentinel + loading skeleton */}
            {hasMore && !loadingMore && (
              <div ref={sentinelRef} className="h-4" />
            )}
            {loadingMore && (
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <SkeletonCard key={i} />
                ))}
              </div>
            )}
            {!hasMore && allProducts.length > 0 && sortedResults.length > 0 && (
              <p className="text-center text-sm text-[#999893] mt-8 py-4 border-t border-[#ede8df]">
                {allCount} de {totalProducts} productos mostrados
              </p>
            )}
          </section>
        )}

        {isShowingAll && !hasResults && !query && (
          <div className="text-center py-16">
            <ShoppingBag className="w-16 h-16 text-[#e0dbd2] mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-[#1a1a1a] mb-1">
              Sin productos disponibles
            </h2>
            <p className="text-[#6b6b6b]">
              No hay productos disponibles en este momento.
            </p>
            <Link
              href={`/${citySlug}`}
              className="inline-flex items-center gap-2 mt-4 text-sm font-semibold text-[#108910] hover:text-[#0D720D]"
            >
              <ArrowLeft className="w-4 h-4" />
              Volver al inicio
            </Link>
          </div>
        )}

        {/* Back link */}
        <div className="mt-12 text-center pb-12">
          <Link
            href={`/${citySlug}`}
            className="btn-pill btn-pill-outline inline-flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Volver a la tienda
          </Link>
        </div>
      </div>
    </div>
  )
}
