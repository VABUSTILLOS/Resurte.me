"use client"

import { useState, useMemo, useCallback } from "react"
import { Search, ShoppingBag } from "lucide-react"
import { ProductCard } from "@/components/product/product-card"
import { getCategoryIcon } from "@/lib/utils"
import type { Category, Product } from "@/types"

interface Props {
  categories: Category[]
  products: Product[]
  citySlug: string
}

export function UserShopView({ categories, products, citySlug }: Props) {
  const [search, setSearch] = useState("")
  const [activeCategoryId, setActiveCategoryId] = useState<number | null>(null)

  // Priority map: Frutas y Verduras (0), Carnes (1), resto (2)
  const categoryPriority = useMemo(() => {
    const map = new Map<number, number>()
    for (const cat of categories) {
      const slug = (cat.slug ?? "").toLowerCase()
      const name = (cat.name ?? "").toLowerCase()
      if (slug.includes("frut") || slug.includes("verdura") || name.includes("frutas y verduras")) {
        map.set(cat.id, 0)
      } else if (slug.includes("carne") || name.includes("carne")) {
        map.set(cat.id, 1)
      }
    }
    return map
  }, [categories])

  // Sort all products: Frutas y Verduras → Carnes → resto (orden estable por nombre)
  const sortedProducts = useMemo(() => {
    const priority = categoryPriority
    return [...products].sort(
      (a, b) => (priority.get(a.category_id) ?? 2) - (priority.get(b.category_id) ?? 2),
    )
  }, [products, categoryPriority])

  // Build category→products map once
  const productsByCategory = useMemo(() => {
    const map = new Map<number, Product[]>()
    sortedProducts.forEach((p) => {
      const list = map.get(p.category_id) || []
      list.push(p)
      map.set(p.category_id, list)
    })
    return map
  }, [sortedProducts])

  // Only show categories that have products, ordered by priority (Frutas y Verduras → Carnes → resto)
  const activeCategories = useMemo(
    () =>
      categories
        .filter((c) => productsByCategory.has(c.id))
        .sort(
          (a, b) =>
            (categoryPriority.get(a.id) ?? 2) - (categoryPriority.get(b.id) ?? 2),
        ),
    [categories, productsByCategory, categoryPriority],
  )

  // Filtered products based on search + active category
  const filteredProducts = useMemo(() => {
    let result = activeCategoryId
      ? productsByCategory.get(activeCategoryId) ?? []
      : sortedProducts

    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.brand && p.brand.toLowerCase().includes(q)) ||
          (p.description && p.description.toLowerCase().includes(q)),
      )
    }

    return result
  }, [sortedProducts, productsByCategory, activeCategoryId, search])

  const handleCategoryClick = useCallback((catId: number | null) => {
    setActiveCategoryId((prev) => (prev === catId ? null : catId))
  }, [])

  const activeCategoryName = activeCategoryId
    ? categories.find((c) => c.id === activeCategoryId)?.name
    : null

  return (
    <div className="min-h-screen flex flex-col bg-[#faf8f5]">
      {/* Sticky top bar: search + category pills */}
      <div className="sticky top-[var(--header-top-offset)] z-30 bg-white border-b border-[#E8E9EB] shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          {/* Search bar */}
          <div className="py-3">
            <div className="flex items-stretch bg-[#F7F5F0] rounded-xl overflow-hidden border border-[#E8E9EB] focus-within:border-[#108910]/40 focus-within:ring-2 focus-within:ring-[#108910]/10 transition-all">
              <div className="flex items-center gap-2 flex-1 pl-4">
                <Search className="w-5 h-5 text-[#B0B3B8] shrink-0" />
                <input
                  type="text"
                  placeholder="Buscar frutas, verduras, carnes, abarrotes..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="flex-1 text-sm text-[#343538] py-2.5 bg-transparent outline-none placeholder:text-[#B0B3B8]"
                />
              </div>
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="px-3 text-xs text-[#72767E] hover:text-[#343538] transition-colors"
                >
                  Limpiar
                </button>
              )}
            </div>
          </div>

          {/* Category pills — horizontal scroll */}
          <div className="pb-3 -mx-4 sm:-mx-6 px-4 sm:px-6 overflow-x-auto scrollbar-hide scroll-fade-x snap-x snap-mandatory">
            <div className="flex gap-2 min-w-max">
              {/* "Todos" pill */}
              <button
                onClick={() => handleCategoryClick(null)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all duration-200 snap-start ${
                  activeCategoryId === null
                    ? "bg-[#108910] text-white shadow-md shadow-[#108910]/20"
                    : "bg-white text-[#5C6068] border border-[#E8E9EB] hover:border-[#108910]/30 hover:text-[#108910]"
                }`}
              >
                <ShoppingBag className="w-4 h-4" />
                Todos
                <span className="text-[11px] opacity-70 ml-0.5">{products.length}</span>
              </button>

              {activeCategories.map((cat) => {
                const count = productsByCategory.get(cat.id)?.length ?? 0
                const isActive = activeCategoryId === cat.id
                return (
                  <button
                    key={cat.id}
                    onClick={() => handleCategoryClick(cat.id)}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all duration-200 snap-start ${
                      isActive
                        ? "bg-[#108910] text-white shadow-md shadow-[#108910]/20"
                        : "bg-white text-[#5C6068] border border-[#E8E9EB] hover:border-[#108910]/30 hover:text-[#108910]"
                    }`}
                  >
                    <span className="text-base leading-none">
                      {getCategoryIcon(cat.icon, cat.slug)}
                    </span>
                    {cat.name}
                    <span className="text-[11px] opacity-70 ml-0.5">{count}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Results header */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 w-full">
        <div className="flex items-center justify-between py-4">
          <div>
            <h2 className="text-lg font-bold text-[#242529]">
              {activeCategoryName ?? "Todos los productos"}
            </h2>
            <p className="text-sm text-[#72767E]">
              {filteredProducts.length} producto{filteredProducts.length !== 1 ? "s" : ""}
              {search && ` para "${search}"`}
            </p>
          </div>
        </div>
      </div>

      {/* Product grid */}
      <div className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 pb-20 w-full">
        {filteredProducts.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
            {filteredProducts.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                citySlug={citySlug}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-20">
            <ShoppingBag className="w-12 h-12 text-[#D1D5DB] mx-auto mb-4" />
            <p className="text-[#72767E] text-lg font-medium">Sin resultados</p>
            <p className="text-[#999893] text-sm mt-1">
              Intenta con otro término de búsqueda o categoría
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
