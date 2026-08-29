import Link from "next/link"
import { ScrollReveal } from "@/components/ui/scroll-reveal"
import { getCategoryIcon } from "@/lib/utils"
import type { Category, Product } from "@/types"

interface CategoryGridProps {
  activeCategories: Category[]
  productsByCategory: Map<number, Product[]>
  citySlug: string
}

export function CategoryGrid({ activeCategories, productsByCategory, citySlug }: CategoryGridProps) {
  return (
      <section className="bg-white py-10 sm:py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <ScrollReveal className="text-center mb-8">
            <p className="text-xs font-medium tracking-[0.2em] uppercase text-[#0E7A0E] mb-2.5">
              Categorías
            </p>
            <h2 className="text-2xl font-bold text-[#242529] tracking-tight text-balance">
              Todo lo que tu cocina necesita
            </h2>
          </ScrollReveal>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {activeCategories.map((cat, idx) => {
              const count = productsByCategory.get(cat.id)?.length ?? 0
              return (
                <ScrollReveal key={cat.id} direction="scale" delay={idx * 0.06}>
                  <Link
                    href={`/${citySlug}/categoria/${cat.slug}`}
                    className="group relative flex flex-col items-center gap-2 p-5 rounded-xl bg-white border border-[#ede8df] hover:border-[#0E7A0E]/20 hover:shadow-[0_4px_20px_rgba(0,0,0,0.06)] transition-all duration-200 hover:-translate-y-1 overflow-hidden"
                  >
                    {/* Subtle top gradient bar on hover */}
                    <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#0E7A0E] to-[#3CC73C] opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
                    <div className="w-14 h-14 rounded-2xl bg-[#f7f5f0] flex items-center justify-center text-2xl shadow-sm group-hover:shadow-md transition-shadow">
                      {getCategoryIcon(cat.icon, cat.slug)}
                    </div>
                    <span className="text-sm font-semibold text-[#1a1a1a] text-center leading-tight group-hover:text-[#0E7A0E] transition-colors">
                      {cat.name}
                    </span>
                    <span className="text-[13px] text-[var(--text-secondary)]">{count} productos</span>
                  </Link>
                </ScrollReveal>
              )
            })}
          </div>
        </div>
      </section>
  )
}
