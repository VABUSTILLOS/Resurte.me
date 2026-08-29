import { Search } from "lucide-react"
import { MarqueePlaceholder } from "@/components/ui/marquee-placeholder"
import type { FormEvent } from "react"

interface CatalogSearchBarProps {
  value: string
  onChange: (value: string) => void
  onSubmit: (e: FormEvent) => void
}

export function CatalogSearchBar({ value, onChange, onSubmit }: CatalogSearchBarProps) {
  return (
      <section className="bg-white py-10 sm:py-16 border-b border-[#E8E9EB]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <form onSubmit={onSubmit} className="max-w-2xl mx-auto">
            <div className="flex items-stretch bg-[#F7F5F0] rounded-xl overflow-hidden border border-[#E8E9EB] focus-within:border-[#0E7A0E]/40 focus-within:ring-2 focus-within:ring-[#0E7A0E]/10 transition-all">
              <div className="flex items-center gap-2 flex-1 pl-4">
                <Search className="w-5 h-5 text-[#B0B3B8] shrink-0" aria-hidden="true" />
                <label htmlFor="catalog-search" className="sr-only">Buscar en el catálogo</label>
                <div className="relative flex-1 min-w-0">
                  <input
                    id="catalog-search"
                    type="text"
                    placeholder=" "
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    className="marquee-input w-full text-sm text-[#343538] py-3 bg-transparent outline-none placeholder:text-[#B0B3B8]"
                  />
                  <MarqueePlaceholder text="Buscar frutas, verduras, carnes, abarrotes..." />
                </div>
              </div>
              <button
                type="submit"
                aria-label="Buscar en el catálogo"
                className="shrink-0 inline-flex items-center gap-1.5 px-5 py-3 bg-[#0E7A0E] text-white text-sm font-semibold hover:bg-[#0D720D] transition-colors"
              >
                Buscar
              </button>
            </div>
          </form>
        </div>
      </section>
  )
}
