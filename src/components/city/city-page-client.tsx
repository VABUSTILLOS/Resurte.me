"use client"

import { useEffect, useMemo, useState } from "react"
import { useCity } from "@/contexts/city-context"
import { MEXICO_CITIES } from "@/lib/cities"
import { MapPin, Search } from "lucide-react"
import { Breadcrumb } from "@/components/ui/breadcrumb"
import { ProductCardGrid } from "@/components/product/product-card"
import { getCategoryIcon } from "@/lib/utils"
import { MOBILE_SEARCH_EVENT } from "@/components/search/mobile-search-overlay"
import { useMediaQuery } from "@/hooks/use-media-query"
import type { Category, Product } from "@/types"

interface Props {
  slug: string
  categories: Category[]
  products: Product[]
}

export function CityPageClient({ slug, categories, products }: Props) {
  const { setCity } = useCity()
  const city = MEXICO_CITIES.find((c) => c.slug === slug)
  const [activeCategory, setActiveCategory] = useState<number | null>(null)
  const [search, setSearch] = useState("")
  const isMobileSearch = useMediaQuery("(max-width: 639px)", true)

  // Set city in context on mount
  useEffect(() => {
    if (slug) setCity(slug)
  }, [slug, setCity])

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      if (activeCategory && p.category_id !== activeCategory) return false
      if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false
      return true
    })
  }, [activeCategory, search, products])

  const productsByCategory = useMemo(() => {
    if (activeCategory) return null
    return categories.reduce(
      (acc, cat) => {
        const catProducts = filteredProducts.filter((p) => p.category_id === cat.id)
        if (catProducts.length > 0) acc.push({ category: cat, products: catProducts })
        return acc
      },
      [] as { category: Category; products: Product[] }[]
    )
  }, [activeCategory, filteredProducts, categories])

  if (!city) return null

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      <Breadcrumb items={[
        { label: "Inicio", href: "/" },
        { label: city.name },
      ]} />

      {/* Hero */}
      <div className="mb-8">
        <div className="flex items-center gap-2 text-[var(--text-secondary)] text-sm mb-2">
          <MapPin className="w-4 h-4" />
          <span>
            {city.name}, {city.state}
          </span>
        </div>
        <h1 className="text-3xl font-bold text-[#242529]">
          Central de Abastos Digital en {city.name}
        </h1>
        <p className="mt-2 text-[var(--text-secondary)] max-w-2xl">
          Más de 30 productos frescos para tu negocio. Sin membresía, sin mínimo de compra. Pedidos por caja, bulto o pieza.
        </p>
      </div>

      {/* Search bar */}
      <div className="mb-8">
        <div className="relative max-w-xl">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-secondary)]" />
          <input
            type="text"
            placeholder="Buscar producto..."
            value={search}
            readOnly={isMobileSearch}
            onFocus={() => {
              if (isMobileSearch) {
                window.dispatchEvent(new CustomEvent(MOBILE_SEARCH_EVENT))
              }
            }}
            onChange={(e) => {
              setSearch(e.target.value)
              setActiveCategory(null)
            }}
            className="w-full pl-10 pr-4 py-2.5 bg-[#F7F5F0] rounded-[10px] text-sm focus:outline-none focus:ring-2 focus:ring-[#0E7A0E] focus:bg-white transition-colors"
          />
        </div>
      </div>

      {/* Categories */}
      <section className="mb-10">
        <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide scroll-fade-x snap-x snap-mandatory">
          <button
            onClick={() => setActiveCategory(null)}
            className={`shrink-0 px-4 py-2 rounded-[10px] text-sm font-medium transition-colors snap-start touch-target ${
              activeCategory === null
                ? "bg-[#0E7A0E] text-white"
                : "bg-[#F7F5F0] text-[var(--text-secondary)] hover:bg-[#EDEBE6]"
            }`}
          >
            Todos
          </button>
          {categories.map((cat) => (
            <button
              key={cat.slug}
              onClick={() => setActiveCategory(cat.id)}
              className={`shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-[10px] text-sm font-medium transition-colors snap-start touch-target ${
                activeCategory === cat.id
                  ? "bg-[#0E7A0E] text-white"
                  : "bg-[#F7F5F0] text-[var(--text-secondary)] hover:bg-[#EDEBE6]"
              }`}
            >
              <span>{getCategoryIcon(cat.icon, cat.slug)}</span>
              {cat.name}
            </button>
          ))}
        </div>
      </section>

      {/* Products */}
      {activeCategory ? (
        filteredProducts.length > 0 && (
          <ProductCardGrid products={filteredProducts} citySlug={slug} />
        )
      ) : (
        productsByCategory?.map(({ category, products }) => (
          <section key={category.id} className="mb-10">
            <h2 className="flex items-center gap-2 text-xl font-bold text-[#242529] mb-4">
              <span>{getCategoryIcon(category.icon, category.slug)}</span>
              {category.name}
            </h2>
            <ProductCardGrid products={products} citySlug={slug} />
          </section>
        ))
      )}

      {filteredProducts.length === 0 && (
        <div className="text-center py-16">
          <Search className="w-12 h-12 text-[#D9D7D2] mx-auto mb-4" />
          <p className="text-[var(--text-secondary)]">No se encontraron productos.</p>
        </div>
      )}
    </div>
  )
}
