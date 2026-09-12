"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useCity } from "@/contexts/city-context"
import { MEXICO_CITIES } from "@/lib/cities"
import { ArrowRight, MapPin, Search } from "lucide-react"
import { Breadcrumb } from "@/components/ui/breadcrumb"
import { ProductCardGrid } from "@/components/product/product-card"
import { PageSkeleton } from "@/components/ui/page-skeleton"
import { getCategoryIcon } from "@/lib/utils"
import { MOBILE_SEARCH_EVENT } from "@/components/search/mobile-search-overlay"
import { useMediaQuery } from "@/hooks/use-media-query"
import { loadCatalogForCity } from "@/app/[slug]/catalog-actions"
import type { Category, Product } from "@/types"

interface Props {
  slug: string
  categories: Category[]
  preview: { previewProducts: Product[]; categoryCounts: [number, number][] }
  totalCount: number
}

export function CityPageClient({ slug, categories, preview, totalCount }: Props) {
  const { setCity } = useCity()
  const city = MEXICO_CITIES.find((c) => c.slug === slug)
  const [activeCategory, setActiveCategory] = useState<number | null>(null)
  const [search, setSearch] = useState("")
  const isMobileSearch = useMediaQuery("(max-width: 639px)", true)

  // El HTML pre-renderizado trae solo un preview por categoría. El catálogo
  // completo se carga una sola vez cuando el usuario interactúa (busca o
  // filtra por categoría).
  const [allProducts, setAllProducts] = useState<Product[] | null>(null)
  const loadingCatalog = useRef(false)

  const interactive = search.trim().length > 0 || activeCategory !== null

  useEffect(() => {
    if (!interactive || allProducts !== null || loadingCatalog.current) return
    loadingCatalog.current = true
    loadCatalogForCity(slug)
      .then(setAllProducts)
      .catch(() => setAllProducts([]))
  }, [interactive, allProducts, slug])

  // Set city in context on mount
  useEffect(() => {
    if (slug) setCity(slug)
  }, [slug, setCity])

  const countByCategory = useMemo(
    () => new Map(preview.categoryCounts),
    [preview.categoryCounts]
  )

  const filteredProducts = useMemo(() => {
    if (!allProducts) return []
    return allProducts.filter((p) => {
      if (activeCategory && p.category_id !== activeCategory) return false
      if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false
      return true
    })
  }, [activeCategory, search, allProducts])

  const previewByCategory = useMemo(() => {
    const map = new Map<number, Product[]>()
    preview.previewProducts.forEach((p) => {
      const list = map.get(p.category_id) || []
      list.push(p)
      map.set(p.category_id, list)
    })
    return map
  }, [preview.previewProducts])

  const previewSections = useMemo(() => {
    return categories.reduce(
      (acc, cat) => {
        const catProducts = previewByCategory.get(cat.id)
        if (catProducts && catProducts.length > 0) acc.push({ category: cat, products: catProducts })
        return acc
      },
      [] as { category: Category; products: Product[] }[]
    )
  }, [previewByCategory, categories])

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
          {totalCount} productos frescos para tu negocio. Sin membresía, sin mínimo de compra. Pedidos por caja, bulto o pieza.
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
      {interactive ? (
        allProducts === null ? (
          <PageSkeleton />
        ) : filteredProducts.length > 0 ? (
          <ProductCardGrid products={filteredProducts} citySlug={slug} />
        ) : (
          <div className="text-center py-16">
            <Search className="w-12 h-12 text-[#D9D7D2] mx-auto mb-4" />
            <p className="text-[var(--text-secondary)]">No se encontraron productos.</p>
          </div>
        )
      ) : (
        previewSections.map(({ category, products }) => {
          const total = countByCategory.get(category.id) ?? products.length
          const remaining = total - products.length
          return (
            <section key={category.id} className="mb-10">
              <div className="flex items-center justify-between mb-4">
                <h2 className="flex items-center gap-2 text-xl font-bold text-[#242529]">
                  <span>{getCategoryIcon(category.icon, category.slug)}</span>
                  {category.name}
                </h2>
                {remaining > 0 && (
                  <Link
                    href={`/${slug}/categoria/${category.slug}`}
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#0E7A0E] hover:text-[#0D720D] transition-colors group"
                  >
                    Ver todo ({total})
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                  </Link>
                )}
              </div>
              <ProductCardGrid products={products} citySlug={slug} />
            </section>
          )
        })
      )}

      {!interactive && previewSections.length === 0 && (
        <div className="text-center py-16">
          <Search className="w-12 h-12 text-[#D9D7D2] mx-auto mb-4" />
          <p className="text-[var(--text-secondary)]">No se encontraron productos.</p>
        </div>
      )}
    </div>
  )
}
