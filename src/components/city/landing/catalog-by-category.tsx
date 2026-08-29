import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { ScrollReveal } from "@/components/ui/scroll-reveal"
import { ProductCard } from "@/components/product/product-card"
import { getCategoryIcon } from "@/lib/utils"
import type { Category, Product } from "@/types"

// Products per category to show on landing — show first 4, then "Ver Todo"
const PREVIEW_COUNT = 4

interface CatalogByCategoryProps {
  featuredCategories: Category[]
  activeCategories: Category[]
  productsByCategory: Map<number, Product[]>
  productsCount: number
  citySlug: string
}

export function CatalogByCategory({
  featuredCategories, activeCategories, productsByCategory, productsCount, citySlug,
}: CatalogByCategoryProps) {
  return (
      <section className="bg-white py-10 sm:py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <ScrollReveal className="text-center mb-8 sm:mb-10">
            <p className="text-xs font-medium tracking-[0.2em] uppercase text-[#0E7A0E] mb-2.5">
              Catálogo completo
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold text-[#242529] tracking-tight text-balance">
              Todo lo que tu cocina necesita
            </h2>
            <p className="text-sm sm:text-base text-[#6b6b6b] mt-3 max-w-xl mx-auto leading-relaxed">
              De la central de abastos a tu negocio. {productsCount} productos — por caja, bulto o pieza.
            </p>
          </ScrollReveal>

          {featuredCategories.map((cat) => {
            const catProducts = productsByCategory.get(cat.id) || []
            const preview = catProducts.slice(0, PREVIEW_COUNT)
            const remaining = catProducts.length - PREVIEW_COUNT

            return (
              <div key={cat.id} className="mb-10 sm:mb-14 last:mb-0 product-grid-section">
                {/* Category header with "Ver Todo" */}
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#0E7A0E]/10 flex items-center justify-center text-xl">
                      {getCategoryIcon(cat.icon, cat.slug)}
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-[#242529]">{cat.name}</h3>
                      <p className="text-sm text-[var(--text-secondary)]">{catProducts.length} productos</p>
                    </div>
                  </div>
                  <Link
                    href={`/${citySlug}/categoria/${cat.slug}`}
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#0E7A0E] hover:text-[#0D720D] transition-colors group"
                  >
                    Ver todo
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                  </Link>
                </div>

                {/* Product cards */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 sm:gap-4">
                  {preview.map((product) => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      citySlug={citySlug}
                    />
                  ))}

                  {/* "Ver más" card */}
                  {remaining > 0 && (
                    <Link
                      href={`/${citySlug}/categoria/${cat.slug}`}
                      className="group flex flex-col items-center justify-center bg-[#F7F5F0] rounded-xl border border-dashed border-[#0E7A0E]/30 hover:border-[#0E7A0E]/60 hover:bg-[#E9FBE9]/50 transition-all duration-200 min-h-[168px] sm:min-h-[220px]"
                    >
                      <div className="w-12 h-12 rounded-full bg-[#0E7A0E]/10 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                        <ArrowRight className="w-5 h-5 text-[#0E7A0E]" />
                      </div>
                      <span className="text-sm font-semibold text-[#0E7A0E]">+{remaining} más</span>
                      <span className="text-[13px] text-[var(--text-secondary)] mt-0.5">Ver todo</span>
                    </Link>
                  )}
                </div>
              </div>
            )
          })}

          {/* Link to see all categories */}
          {activeCategories.length > featuredCategories.length && (
            <div className="text-center mt-4 pt-6 border-t border-[#E8E9EB]">
              <Link
                href={`/${citySlug}/buscar`}
                className="inline-flex items-center gap-2 text-sm font-semibold text-[#0E7A0E] hover:text-[#0D720D] transition-colors group"
              >
                Ver todas las categorías ({activeCategories.length})
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </Link>
            </div>
          )}
        </div>
      </section>
  )
}
