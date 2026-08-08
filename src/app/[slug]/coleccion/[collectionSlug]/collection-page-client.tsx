"use client"

import Link from "next/link"
import { ArrowLeft, ShoppingBag, Box, TrendingUp, Truck } from "lucide-react"
import { ProductCard } from "@/components/product/product-card"
import { SearchBar } from "@/components/search/search-bar"
import { ScrollReveal } from "@/components/ui/scroll-reveal"
import { CollectionHero } from "@/components/collections/collection-hero"
import { CollectionStorySection } from "@/components/collections/collection-story-section"
import { CollectionValueHighlight } from "@/components/collections/collection-value-highlight"
import { getCollectionContent } from "@/lib/collection-content"
import { getCollectionRecipes } from "@/lib/recipes"
import { getCollectionCover } from "@/lib/collection-images"
import RecipeSlider from "@/components/collections/recipe-slider"
import type { Product, CollectionRecipe } from "@/types"

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
  products: Product[]
  allProducts?: Product[]
}

/**
 * Distribuye productos en N grupos de tamaño aproximado para
 * intercalar secciones narrativas entre bloques del catálogo.
 */
function chunkProducts<T>(products: T[], chunks: number): T[][] {
  if (chunks <= 1 || products.length === 0) return [products]
  const size = Math.ceil(products.length / chunks)
  const result: T[][] = []
  for (let i = 0; i < products.length; i += size) {
    result.push(products.slice(i, i + size))
  }
  return result
}

export function CollectionPageClient({ citySlug, cityName, collection, products, allProducts }: CollectionPageClientProps) {
  const icon = COLLECTION_ICONS[collection.slug] || "📦"
  const content = getCollectionContent(collection.slug)
  const recipes: CollectionRecipe[] = getCollectionRecipes(collection.slug).map((r, i) => ({
    ...r,
    id: i + 1,
    collection_id: collection.id,
    is_active: true,
  }))

  // Use products directly (price/sale_price now on Product)
  const productChunks = chunkProducts(products, 4)

  return (
    <div className="min-h-screen bg-[#faf8f5]">
      {/* ── 1. HERO — Full-width Erewhon-style banner ── */}
      <CollectionHero
        collectionName={collection.name}
        tagline={content.heroTagline}
        imageUrl={getCollectionCover(collection.slug) ?? collection.image_url}
        icon={icon}
        citySlug={citySlug}
        cityName={cityName}
      />

      {/* ── 2. B2B VALUE BADGES + SEARCH (compact bar) ── */}
      <div className="bg-white border-b border-[#ede8df] sticky top-[var(--header-top-offset)] z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2.5 sm:py-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3">
            {/* Value badges — compact on mobile */}
            <div className="flex flex-wrap gap-1.5 sm:gap-2">
              <span className="inline-flex items-center gap-1 text-[10px] sm:text-xs font-medium text-[#6b6b6b] bg-[#f7f4ef] rounded-full px-2.5 py-1 sm:px-3 sm:py-1.5">
                <Box className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-[#108910]" />
                <span className="hidden sm:inline">Venta por volumen</span>
                <span className="sm:hidden">Volumen</span>
              </span>
              <span className="inline-flex items-center gap-1 text-[10px] sm:text-xs font-medium text-[#6b6b6b] bg-[#f7f4ef] rounded-full px-2.5 py-1 sm:px-3 sm:py-1.5">
                <TrendingUp className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-[#108910]" />
                <span className="hidden sm:inline">Precio institucional</span>
                <span className="sm:hidden">Institucional</span>
              </span>
              <span className="inline-flex items-center gap-1 text-[10px] sm:text-xs font-medium text-[#6b6b6b] bg-[#f7f4ef] rounded-full px-2.5 py-1 sm:px-3 sm:py-1.5">
                <Truck className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-[#108910]" />
                <span className="hidden sm:inline">Entrega programada</span>
                <span className="sm:hidden">Programada</span>
              </span>
            </div>

            {/* Search */}
            <div className="w-full sm:w-64">
              <SearchBar citySlug={citySlug} />
            </div>
          </div>
        </div>
      </div>

      {/* ── 3. OUR STORY — Narrative section ── */}
      <CollectionStorySection
        story={content.story}
        collectionName={collection.name}
      />

      {/* ── 3.5 RECIPE SLIDER — Recetario inspiracional ── */}
      {recipes.length > 0 && (
        <section className="max-w-7xl mx-auto px-5 sm:px-8 py-12 sm:py-16 bg-[#faf8f5]">
          <RecipeSlider
            recipes={recipes}
            products={allProducts && allProducts.length > 0 ? allProducts : products}
            citySlug={citySlug}
          />
        </section>
      )}

      {/* ── 4. PRODUCT GRID — First chunk ── */}
      {(productChunks[0]?.length ?? 0) > 0 && (
        <ProductGridSection
          products={productChunks[0] ?? []}
          total={products.length}
          citySlug={citySlug}
        />
      )}

      {/* ── 5. VALUE HIGHLIGHT 1 ── */}
      <CollectionValueHighlight value={content.values[0]} index={0} />

      {/* ── 6. PRODUCT GRID — Second chunk ── */}
      {(productChunks[1]?.length ?? 0) > 0 && (
        <ProductGridSection
          products={productChunks[1] ?? []}
          total={products.length}
          citySlug={citySlug}
          hideHeader
        />
      )}

      {/* ── 7. VALUE HIGHLIGHT 2 ── */}
      <CollectionValueHighlight value={content.values[1]} index={1} />

      {/* ── 8. PRODUCT GRID — Third chunk ── */}
      {(productChunks[2]?.length ?? 0) > 0 && (
        <ProductGridSection
          products={productChunks[2] ?? []}
          total={products.length}
          citySlug={citySlug}
          hideHeader
        />
      )}

      {/* ── 9. VALUE HIGHLIGHT 3 ── */}
      <CollectionValueHighlight value={content.values[2]} index={2} />

      {/* ── 10. PRODUCT GRID — Final chunk ── */}
      {(productChunks[3]?.length ?? 0) > 0 && (
        <ProductGridSection
          products={productChunks[3] ?? []}
          total={products.length}
          citySlug={citySlug}
          hideHeader
        />
      )}

      {/* ── 11. Empty state ── */}
      {products.length === 0 && (
        <div className="text-center py-20 sm:py-28 bg-[#faf8f5] border-t border-[#ede8df]">
          <div className="text-5xl sm:text-6xl mb-4 sm:mb-5 opacity-60">{icon}</div>
          <p className="text-[#5a5a5a] text-base sm:text-lg font-light">Estamos curando los mejores insumos para esta colección.</p>
          <p className="text-[#b0b0b0] text-xs sm:text-sm mt-2 sm:mt-3">Vuelve pronto — estamos agregando productos cada semana.</p>
          <Link
            href={`/${citySlug}`}
            className="inline-flex items-center gap-2 mt-6 sm:mt-8 text-sm font-semibold text-[#108910] hover:text-[#0D720D] btn-pill btn-pill-outline"
          >
            <ArrowLeft className="w-4 h-4" />
            Volver al inicio
          </Link>
        </div>
      )}

      {/* ── 12. FOOTER CTA — Back to collections ── */}
      <div className="bg-[#f7f4ef] border-t border-[#ede8df] py-12 sm:py-16">
        <div className="max-w-7xl mx-auto px-5 sm:px-8 text-center">
          <ScrollReveal>
            <p className="text-[#6b6b6b] text-xs sm:text-sm mb-4 sm:mb-6 font-light">
              ¿Buscas otro tipo de cocina?
            </p>
            <Link
              href={`/${citySlug}`}
              className="btn-pill btn-pill-outline inline-flex items-center gap-2 text-sm"
            >
              <ArrowLeft className="w-4 h-4" />
              Ver todas las colecciones
            </Link>
          </ScrollReveal>
        </div>
      </div>
    </div>
  )
}

/**
 * ProductGridSection — Bloque de productos con encabezado opcional.
 *
 * Se reutiliza para cada chunk del catálogo intercalado.
 */
function ProductGridSection({
  products,
  total,
  citySlug,
  hideHeader = false,
}: {
  products: Product[]
  total: number
  citySlug: string
  hideHeader?: boolean
}) {
  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-8 py-8 sm:py-12 lg:py-16">
      {!hideHeader && (
        <ScrollReveal>
          <div className="flex items-center gap-2 sm:gap-3 mb-6 sm:mb-8">
            <ShoppingBag className="w-4 h-4 sm:w-5 sm:h-5 text-[#108910]" />
            <h2 className="text-sm sm:text-base font-semibold text-[#1a1a1a] tracking-tight">
              {total} producto{total !== 1 ? "s" : ""} en esta colección
            </h2>
          </div>
        </ScrollReveal>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-4 lg:gap-5">
        {products.map((product, idx) => (
          <ScrollReveal key={product.id} direction="scale" delay={idx * 0.04}>
            <ProductCard
              product={product}
              citySlug={citySlug}
            />
          </ScrollReveal>
        ))}
      </div>
    </section>
  )
}
