import Link from "next/link"
import Image from "next/image"
import { MapPin, ArrowRight, Search, Grid3X3 } from "lucide-react"
import { HERO_GROCERY } from "@/lib/images"
import type { FormEvent } from "react"

interface HeroSectionProps {
  cityName: string
  cityState: string
  citySlug: string
  heroSearch: string
  onSearchChange: (value: string) => void
  isMobileHero: boolean
  onOpenSearchOverlay: () => void
  onSearch: (e: FormEvent) => void
  onChangeCity: () => void
}

export function HeroSection({
  cityName, cityState, citySlug, heroSearch, onSearchChange,
  isMobileHero, onOpenSearchOverlay, onSearch, onChangeCity,
}: HeroSectionProps) {
  return (
      <section className="relative bg-[#1A1A1A] overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-[52%_48%] min-h-[auto] lg:min-h-[580px]">
            {/* Left: Copy */}
            <div className="pt-10 sm:pt-14 lg:py-20 pb-4 sm:pb-6 z-10 flex flex-col justify-center">
              <p className="text-xs font-medium tracking-[0.2em] uppercase text-[#3CC73C] mb-3 sm:mb-4">
                Proveeduría inteligente para tu cocina
              </p>
              <h1 className="text-[2rem] leading-[1.1] sm:text-5xl lg:text-[3.5rem] font-bold text-white tracking-tight text-balance">
                Del campo a tu{" "}
                <span className="text-[#3CC73C]">cocina</span>
              </h1>
              <p className="mt-3 sm:mt-5 text-sm sm:text-lg text-white/75 leading-relaxed max-w-[480px]">
                Pide los insumos de tu restaurante desde el cel. Te los entregamos el mismo día, frescos y al mejor precio. Sin madrugar, sin vueltas.
              </p>
              <div className="mt-4 sm:mt-6 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs sm:text-sm text-white/60 sm:text-white/70">
                <span className="inline-flex items-center gap-1">
                  <MapPin className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-[#3CC73C]" />
                  {cityName}, {cityState}
                </span>
                <button
                  onClick={() => onChangeCity()}
                  aria-label="Cambiar ciudad"
                  className="text-[#3CC73C] hover:text-[#4DE64D] underline underline-offset-2 font-medium transition-colors"
                >
                  cambiar
                </button>
                <span className="hidden sm:inline text-white/30">·</span>
                <span className="hidden sm:inline-flex items-center gap-1">
                  📄 Factura automática
                </span>
                <span className="hidden sm:inline text-white/30">·</span>
                <span className="hidden sm:inline-flex items-center gap-1">
                  🚚 Entrega el mismo día
                </span>
              </div>
              {/* Mobile-only compact feature line */}
              <p className="mt-3 sm:hidden text-xs text-white/60">
                📄 Factura automática · 🔄 Devolución sin costo · 🚚 Entrega el mismo día
              </p>
              <form
                onSubmit={onSearch}
                className="mt-6 sm:mt-8 max-w-lg"
              >
                <div
                  className="flex items-stretch bg-white rounded-[10px] overflow-hidden shadow-[0_4px_24px_rgba(0,0,0,0.25)]"
                >
                  <div className="flex items-center gap-2 flex-1 pl-3.5 sm:pl-4">
                    <Search className="w-4 h-4 text-[#B0B3B8] shrink-0" aria-hidden="true" />
                    <label htmlFor="hero-search" className="sr-only">Buscar productos</label>
                    <input
                      id="hero-search"
                      type="text"
                      placeholder="¿Qué ingredientes necesita tu cocina hoy?"
                      value={heroSearch}
                      onChange={(e) => onSearchChange(e.target.value)}
                      readOnly={isMobileHero}
                      onFocus={() => {
                        if (isMobileHero) {
                          onOpenSearchOverlay()
                        }
                      }}
                      onClick={() => {
                        if (isMobileHero) {
                          onOpenSearchOverlay()
                        }
                      }}
                      className="flex-1 text-sm text-[#343538] py-3 sm:py-3.5 bg-transparent outline-none placeholder:text-[#B0B3B8] placeholder:text-xs sm:placeholder:text-sm"
                    />
                  </div>
                  <button
                    type="submit"
                    aria-label="Buscar productos"
                    className="shrink-0 inline-flex items-center gap-1.5 px-5 sm:px-6 py-3 sm:py-3.5 bg-[#0E7A0E] text-white text-sm font-semibold hover:bg-[#0D720D] active:bg-[#0A610A] transition-colors"
                  >
                    Buscar
                    <ArrowRight className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>
              </form>
              <div className="mt-3 sm:mt-4">
                <Link
                  href={`/catalogo/${citySlug}`}
                  className="inline-flex items-center gap-2 text-xs sm:text-sm font-semibold text-white/90 hover:text-white hover:underline underline-offset-4 transition-colors"
                >
                  <Grid3X3 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  Ver todos los productos
                  <ArrowRight className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                </Link>
              </div>
            </div>
            {/* Right: Image — full-height on desktop, compact card on mobile */}
            <div className="hidden lg:flex relative lg:rounded-r-2xl overflow-hidden">
              <div className="absolute inset-y-0 left-0 w-32 bg-gradient-to-r from-[#1A1A1A] to-transparent z-10" />
              <div className="absolute inset-0 bg-[#1A1A1A]/10 z-[1]" />
              <Image
                src={HERO_GROCERY}
                alt="Frutas y verduras frescas"
                fill
                sizes="50vw"
                priority
                fetchPriority="high"
                className="absolute inset-0 w-full h-full object-cover"
              />
            </div>
            {/* Mobile: compact rounded image card below the CTA */}
            <div className="lg:hidden -mx-4">
              <div className="relative h-[200px] overflow-hidden">
                <div className="absolute inset-x-0 top-0 h-12 bg-gradient-to-b from-[#1A1A1A] to-transparent z-10" />
                <Image
                  src={HERO_GROCERY}
                  alt="Frutas y verduras frescas"
                  fill
                  sizes="100vw"
                  priority
                  fetchPriority="high"
                  className="absolute inset-0 w-full h-full object-cover"
                />
              </div>
            </div>
          </div>
        </div>
      </section>
  )
}
