"use client"

import { MapPin, ArrowRight, Search, Store, Truck, Building2, CreditCard, Grid3X3, Percent } from "lucide-react"
import { useCity } from "@/contexts/city-context"
import { CitySelector } from "@/components/city/city-selector"
import { useState, useEffect } from "react"
import { MEXICO_CITIES } from "@/lib/cities"
import { HERO_GROCERY } from "@/lib/images"
import { ProductCard } from "@/components/product/product-card"
import { ScrollReveal } from "@/components/ui/scroll-reveal"
import { StickyCatalogButton } from "@/components/ui/sticky-catalog-button"
import { useRouter } from "next/navigation"
import Link from "next/link"
import type { Category, Product } from "@/types"
import { getCategoryIcon } from "@/lib/utils"

const DEFAULT_CITY_SLUG = "chihuahua"

// Products per category to show on landing — show first 5, then "Ver Todo"
const PREVIEW_COUNT = 5

// Restaurant-essential categories shown on the homepage — ordered by priority
const FEATURED_CATEGORY_SLUGS = [
  "frutas-verduras",
  "carnes-pescados",
  "lacteos-huevos",
  "panaderia-tortilleria",
  "despensa",
  "bebidas",
  "limpieza",
]

const TESTIMONIALS = [
  {
    quote: "Desde que pedimos con Resurte, nuestra merma bajó un 30%. La verdura llega más fresca que cuando íbamos a la central.",
    author: "Chef Ricardo M.",
    role: "Dueño de La Piccola Trattoria",
    city: "Chihuahua",
  },
  {
    quote: "Los precios son estables y la facturación es inmediata. Para un restaurante pequeño como el mío, eso es oro.",
    author: "María Elena G.",
    role: "Propietaria de Las Tlayudas de Doña Mary",
    city: "Chihuahua",
  },
  {
    quote: "Programo mi pedido el lunes y el martes a las 8 AM ya tengo todo en la cocina. Así da gusto hacer negocios.",
    author: "Carlos R.",
    role: "Chef ejecutivo, Hotel Casa Grande",
    city: "Chihuahua",
  },
]

export function CityLanding({
  citySlug,
  categories,
  products,
}: {
  citySlug?: string
  categories: Category[]
  products: (Product & {
    product_stores: { store_id: number; price: number; sale_price: number | null; is_available: boolean; stock_status: string }[]
  })[]
}) {
  const { city, setCity } = useCity()
  const [showSelector, setShowSelector] = useState(false)
  const [heroSearch, setHeroSearch] = useState("")
  const [catalogSearch, setCatalogSearch] = useState("")
  const router = useRouter()

  // Use provided slug or default to Chihuahua
  const resolvedSlug = citySlug || DEFAULT_CITY_SLUG

  // Set city in context on mount
  useEffect(() => {
    if (citySlug) {
      setCity(citySlug)
    } else if (!city) {
      setCity(DEFAULT_CITY_SLUG)
    }
  }, [citySlug, city, setCity])

  const currentCity = MEXICO_CITIES.find(c => c.slug === resolvedSlug) || MEXICO_CITIES.find(c => c.slug === DEFAULT_CITY_SLUG)

  // Flatten product_store data
  const flatProducts = products.map((p) => ({
    ...p,
    price: p.product_stores[0]?.price ?? 0,
    sale_price: p.product_stores[0]?.sale_price ?? null,
    stock_status: p.product_stores[0]?.stock_status ?? "in_stock",
  }))

  // Group by category
  const productsByCategory = new Map<number, typeof flatProducts>()
  flatProducts.forEach((p) => {
    const list = productsByCategory.get(p.category_id) || []
    list.push(p)
    productsByCategory.set(p.category_id, list)
  })

  // Only show categories that have products
  const activeCategories = categories.filter((c) => {
    const catProducts = productsByCategory.get(c.id)
    return catProducts && catProducts.length > 0
  })

  // Featured categories for the product grid (only 4 restaurant-essential)
  const featuredCategories = activeCategories.filter((c) =>
    FEATURED_CATEGORY_SLUGS.includes(c.slug)
  )

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (heroSearch.trim()) {
      router.push(`/${currentCity?.slug || DEFAULT_CITY_SLUG}/buscar?q=${encodeURIComponent(heroSearch.trim())}`)
    }
  }

  const handleCatalogSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (catalogSearch.trim()) {
      router.push(`/${currentCity?.slug || DEFAULT_CITY_SLUG}/buscar?q=${encodeURIComponent(catalogSearch.trim())}`)
    }
  }

  return (
    <div className="min-h-[80vh] flex flex-col">
      {/* Hero — Editorial split layout */}
      <section className="relative bg-[#1A1A1A] overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-[52%_48%] min-h-[520px] lg:min-h-[580px]">
            {/* Left: Copy */}
            <div className="py-14 lg:py-20 z-10 flex flex-col justify-center">
              <p className="text-xs font-medium tracking-[0.2em] uppercase text-[#3CC73C] mb-4">
                Proveeduría para profesionales de la cocina
              </p>
              <h1 className="text-4xl sm:text-5xl lg:text-[3.5rem] font-bold text-white leading-[1.08] tracking-tight">
                Del campo a tu{" "}
                <span className="text-[#3CC73C]">cocina</span>
              </h1>
              <p className="mt-5 text-base sm:text-lg text-white/75 leading-relaxed max-w-[480px]">
                Abastece tu restaurante con la frescura de la central de abastos — sin madrugar, sin cargar, sin sorpresas.
              </p>
              <div className="mt-6 inline-flex items-center gap-1.5 text-sm text-white/70">
                <MapPin className="w-3.5 h-3.5 text-[#3CC73C]" />
                <span>
                  Entregando hoy en {currentCity?.name || "Ciudad de México"}, {currentCity?.state || "CDMX"}
                </span>
                <button
                  onClick={() => setShowSelector(true)}
                  className="ml-1 text-[#3CC73C] hover:text-[#4DE64D] underline underline-offset-2 font-medium transition-colors"
                >
                  cambiar
                </button>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-white/10 text-white/80 text-xs font-medium rounded-full border border-white/10">
                  <span className="text-[#3CC73C]">📄</span> Facturamos (CFDI)
                </span>
                <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-white/10 text-white/80 text-xs font-medium rounded-full border border-white/10">
                  <span className="text-[#3CC73C]">🔄</span> Devolución sin costo
                </span>
                <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-white/10 text-white/80 text-xs font-medium rounded-full border border-white/10">
                  <span className="text-[#3CC73C]">🚚</span> Envío gratis desde $2,500
                </span>
              </div>
              <form onSubmit={handleSearch} className="mt-8 max-w-lg">
                <div className="flex items-stretch bg-white rounded-[10px] overflow-hidden shadow-[0_4px_24px_rgba(0,0,0,0.25)]">
                  <div className="flex items-center gap-2 flex-1 pl-4">
                    <Search className="w-4 h-4 text-[#B0B3B8] shrink-0" />
                    <input
                      type="text"
                      placeholder="¿Qué ingredientes necesita tu cocina hoy?"
                      value={heroSearch}
                      onChange={(e) => setHeroSearch(e.target.value)}
                      className="flex-1 text-sm text-[#343538] py-3.5 bg-transparent outline-none placeholder:text-[#B0B3B8]"
                    />
                  </div>
                  <button
                    type="submit"
                    className="shrink-0 inline-flex items-center gap-1.5 px-6 py-3.5 bg-[#108910] text-white text-sm font-semibold hover:bg-[#0D720D] active:bg-[#0A610A] transition-colors"
                  >
                    Buscar
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </form>
              <div className="mt-4">
                <Link
                  href={`/${currentCity?.slug || DEFAULT_CITY_SLUG}/buscar`}
                  className="inline-flex items-center gap-2 text-sm font-semibold text-white/80 hover:text-white hover:underline underline-offset-4 transition-colors"
                >
                  <Grid3X3 className="w-4 h-4" />
                  Ver todos los productos
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
            {/* Right: Image */}
            <div className="relative min-h-[240px] lg:min-h-0 lg:rounded-r-2xl overflow-hidden">
              <div className="absolute inset-y-0 left-0 w-32 bg-gradient-to-r from-[#1A1A1A] to-transparent z-10 hidden lg:block" />
              <div className="absolute inset-y-0 top-0 w-full bg-gradient-to-b from-[#1A1A1A] to-transparent h-24 z-10 lg:hidden" />
              <div className="absolute inset-y-0 bottom-0 w-full bg-gradient-to-t from-[#1A1A1A] to-transparent h-24 z-10 lg:hidden" />
              <div className="absolute inset-0 bg-[#1A1A1A]/10 z-[1]" />
              <img
                src={HERO_GROCERY}
                alt="Frutas y verduras frescas"
                className="absolute inset-0 w-full h-full object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Social proof stats — Carnemart bold confidence + Erewhon number treatment */}
      <section className="bg-white border-b border-[#E8E9EB]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-16">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
            {[
              { value: "1,200+", label: "Negocios abastecidos", icon: Building2 },
              { value: "20", label: "Ciudades en México", icon: MapPin },
              { value: "Hoy", label: "Tiempo de entrega", icon: Truck },
              { value: "CFDI", label: "Facturación incluida", icon: CreditCard },
            ].map((stat) => (
              <div key={stat.label} className="flex flex-col items-center gap-1.5">
                <stat.icon className="w-5 h-5 text-[#108910]/60 mb-1" />
                <span className="text-2xl sm:text-3xl font-bold text-[#1a1a1a] tracking-tight">{stat.value}</span>
                <span className="text-xs text-[#72767E]">{stat.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Search bar for products */}
      <section className="bg-white py-16 border-b border-[#E8E9EB]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <form onSubmit={handleCatalogSearch} className="max-w-2xl mx-auto">
            <div className="flex items-stretch bg-[#F7F5F0] rounded-xl overflow-hidden border border-[#E8E9EB] focus-within:border-[#108910]/40 focus-within:ring-2 focus-within:ring-[#108910]/10 transition-all">
              <div className="flex items-center gap-2 flex-1 pl-4">
                <Search className="w-5 h-5 text-[#B0B3B8] shrink-0" />
                <input
                  type="text"
                  placeholder="Buscar frutas, verduras, carnes, abarrotes..."
                  value={catalogSearch}
                  onChange={(e) => setCatalogSearch(e.target.value)}
                  className="flex-1 text-sm text-[#343538] py-3 bg-transparent outline-none placeholder:text-[#B0B3B8]"
                />
              </div>
              <button
                type="submit"
                className="shrink-0 inline-flex items-center gap-1.5 px-5 py-3 bg-[#108910] text-white text-sm font-semibold hover:bg-[#0D720D] transition-colors"
              >
                Buscar
              </button>
            </div>
          </form>
        </div>
      </section>

      {/* Category icons grid — Erewhon-style gradient cards */}
      <section className="bg-white py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <ScrollReveal className="text-center mb-8">
            <p className="text-xs font-medium tracking-[0.2em] uppercase text-[#108910] mb-3">
              Categorías
            </p>
            <h2 className="text-2xl font-bold text-[#242529] tracking-tight">
              Todo lo que tu cocina necesita
            </h2>
          </ScrollReveal>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {activeCategories.map((cat, idx) => {
              const count = productsByCategory.get(cat.id)?.length ?? 0
              return (
                <ScrollReveal key={cat.id} direction="scale" delay={idx * 0.06}>
                  <Link
                    href={`/${currentCity?.slug || DEFAULT_CITY_SLUG}/categoria/${cat.slug}`}
                    className="group relative flex flex-col items-center gap-2 p-5 rounded-xl bg-white border border-[#ede8df] hover:border-[#108910]/20 hover:shadow-[0_4px_20px_rgba(0,0,0,0.06)] transition-all duration-200 hover:-translate-y-1 overflow-hidden"
                  >
                    {/* Subtle top gradient bar on hover */}
                    <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#108910] to-[#3CC73C] opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
                    <div className="w-14 h-14 rounded-2xl bg-[#f7f5f0] flex items-center justify-center text-2xl shadow-sm group-hover:shadow-md transition-shadow">
                      {getCategoryIcon(cat.icon, cat.slug)}
                    </div>
                    <span className="text-sm font-semibold text-[#1a1a1a] text-center leading-tight group-hover:text-[#108910] transition-colors">
                      {cat.name}
                    </span>
                    <span className="text-xs text-[#999893]">{count} productos</span>
                  </Link>
                </ScrollReveal>
              )
            })}
          </div>
        </div>
      </section>

      {/* Product catalog by category — with "Ver Todo" links (Erewhon-style) */}
      <section className="bg-white py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <ScrollReveal className="text-center mb-10">
            <p className="text-xs font-medium tracking-[0.2em] uppercase text-[#108910] mb-3">
              Catálogo completo
            </p>
            <h2 className="text-3xl font-bold text-[#242529] tracking-tight">
              Todo lo que tu cocina necesita
            </h2>
            <p className="text-base text-[#6b6b6b] mt-3 max-w-xl mx-auto leading-relaxed">
              De la central de abastos a tu negocio. {flatProducts.length} productos — por caja, bulto o pieza.
            </p>
          </ScrollReveal>

          {featuredCategories.map((cat) => {
            const catProducts = productsByCategory.get(cat.id) || []
            const preview = catProducts.slice(0, PREVIEW_COUNT)
            const remaining = catProducts.length - PREVIEW_COUNT

            return (
              <div key={cat.id} className="mb-14 last:mb-0">
                {/* Category header with "Ver Todo" */}
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#108910]/10 flex items-center justify-center text-xl">
                      {getCategoryIcon(cat.icon, cat.slug)}
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-[#242529]">{cat.name}</h3>
                      <p className="text-sm text-[#72767E]">{catProducts.length} productos</p>
                    </div>
                  </div>
                  <Link
                    href={`/${currentCity?.slug || DEFAULT_CITY_SLUG}/categoria/${cat.slug}`}
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#108910] hover:text-[#0D720D] transition-colors group"
                  >
                    Ver todo
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                  </Link>
                </div>

                {/* Product cards */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                  {preview.map((product) => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      storeId={1}
                      storeName="Resurte.me"
                      storeSlug="resurte"
                      citySlug={currentCity?.slug || DEFAULT_CITY_SLUG}
                    />
                  ))}

                  {/* "Ver más" card */}
                  {remaining > 0 && (
                    <Link
                      href={`/${currentCity?.slug || DEFAULT_CITY_SLUG}/categoria/${cat.slug}`}
                      className="group flex flex-col items-center justify-center bg-[#F7F5F0] rounded-xl border border-dashed border-[#108910]/30 hover:border-[#108910]/60 hover:bg-[#E9FBE9]/50 transition-all duration-200 min-h-[200px]"
                    >
                      <div className="w-12 h-12 rounded-full bg-[#108910]/10 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                        <ArrowRight className="w-5 h-5 text-[#108910]" />
                      </div>
                      <span className="text-sm font-semibold text-[#108910]">+{remaining} más</span>
                      <span className="text-xs text-[#72767E] mt-0.5">Ver todo</span>
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
                href={`/${currentCity?.slug || DEFAULT_CITY_SLUG}/buscar`}
                className="inline-flex items-center gap-2 text-sm font-semibold text-[#108910] hover:text-[#0D720D] transition-colors group"
              >
                Ver todas las categorías ({activeCategories.length})
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* Pricing highlight banner — MayoreoTotal + Instacart efficiency */}
      <section className="bg-[#108910] text-white py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center text-2xl shrink-0">
                💰
              </div>
              <div>
                <h3 className="text-lg font-bold">Precios de mayoreo, directo a tu negocio</h3>
                <p className="text-white/80 text-sm">Sin membresías, sin mínimo de compra. Facturación electrónica incluida.</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-4 text-sm font-medium">
              <span className="flex items-center gap-1.5 bg-white/15 rounded-full px-4 py-2">
                <span className="w-2 h-2 rounded-full bg-[#3CC73C]" />
                Envío gratis desde $2,500
              </span>
              <span className="flex items-center gap-1.5 bg-white/15 rounded-full px-4 py-2">
                <span className="w-2 h-2 rounded-full bg-[#3CC73C]" />
                Entrega el mismo día
              </span>
              <span className="flex items-center gap-1.5 bg-white/15 rounded-full px-4 py-2">
                <span className="w-2 h-2 rounded-full bg-[#3CC73C]" />
                Pago seguro
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Customer segments — more editorial */}
      <section className="bg-white py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <p className="text-xs font-medium tracking-[0.2em] uppercase text-[#108910] mb-3">
              Hecho para ti
            </p>
            <h2 className="text-3xl font-bold text-[#242529] tracking-tight">
              ¿Para quién es?
            </h2>
            <p className="text-base text-[#72767E] mt-3 max-w-xl mx-auto leading-relaxed">
              Si tu negocio sirve comida, Resurte es tu proveedor. Sin mínimo, sin membresía, sin complicaciones.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              {
                icon: "🍽️",
                title: "Restaurantes",
                desc: "Frutas, verduras, carnes y abarrotes para tu cocina. Por mayoreo, sin mínimo.",
              },
              {
                icon: "🏨",
                title: "Hoteles",
                desc: "Despensa completa para servicio de alimentos. Calidad consistente, entregas programadas.",
              },
              {
                icon: "🏪",
                title: "Tienditas",
                desc: "Surtimos tu changarro con productos de alta rotación. Precios de central de abastos.",
              },
              {
                icon: "🏢",
                title: "Oficinas y comedores",
                desc: "Insumos para cocina industrial. Facturación electrónica, línea de crédito disponible.",
              },
            ].map((seg) => (
              <div
                key={seg.title}
                className="group p-6 rounded-xl border border-[#E8E9EB] hover:border-[#108910]/30 hover:shadow-sm hover:-translate-y-1 transition-all duration-200"
              >
                <div className="text-3xl mb-3">{seg.icon}</div>
                <h3 className="font-semibold text-[#242529] mb-1.5 group-hover:text-[#108910] transition-colors">
                  {seg.title}
                </h3>
                <p className="text-sm text-[#72767E] leading-relaxed">{seg.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Cómo funciona — clean editorial */}
      <section className="bg-white py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <p className="text-xs font-medium tracking-[0.2em] uppercase text-[#108910] mb-3">
              Así de fácil
            </p>
            <h2 className="text-3xl font-bold text-[#242529] tracking-tight">
              Abastece tu negocio en 3 pasos
            </h2>
            <p className="text-base text-[#72767E] mt-3 max-w-xl mx-auto leading-relaxed">
              Sin membresías, sin mínimo de compra. Solo los ingredientes que necesitas, cuando los necesitas.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                icon: Search,
                title: "Elige tus insumos",
                desc: "Explora frutas, verduras, carnes y abarrotes. Por caja, bulto o pieza — como en la central de abastos.",
              },
              {
                icon: Store,
                title: "Arma tu pedido",
                desc: "Agrega lo que necesitas al carrito. Sin mínimo de compra. Facturación electrónica incluida.",
              },
              {
                icon: Truck,
                title: "Recibe en tu negocio",
                desc: "Entrega el mismo día. Frescura garantizada. Listo para tu operación del día.",
              },
            ].map((step, i) => (
              <div
                key={step.title}
                className="text-center p-6 rounded-xl hover:-translate-y-1 transition-all duration-200 ease-out will-change-transform"
              >
                <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-[#E9FBE9] flex items-center justify-center">
                  <step.icon className="w-6 h-6 text-[#108910]" />
                </div>
                <h3 className="text-lg font-semibold text-[#242529] mb-2">
                  {i + 1}. {step.title}
                </h3>
                <p className="text-[#72767E] text-sm">{step.desc}</p>
              </div>
            ))}
          </div>

          {/* Trust bar — business-focused */}
          <div className="mt-14 flex flex-wrap items-center justify-center gap-x-8 gap-y-2 text-sm text-[#72767E]">
            <span className="flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-full bg-[#E9FBE9] flex items-center justify-center text-[#108910] text-xs font-bold">✓</span>
              Sin membresía
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-full bg-[#E9FBE9] flex items-center justify-center text-[#108910] text-xs font-bold">✓</span>
              Envío gratis desde $2,500
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-full bg-[#E9FBE9] flex items-center justify-center text-[#108910] text-xs font-bold">✓</span>
              Facturación electrónica
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-full bg-[#E9FBE9] flex items-center justify-center text-[#108910] text-xs font-bold">✓</span>
              Pago seguro
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-full bg-[#E9FBE9] flex items-center justify-center text-[#108910] text-xs font-bold">✓</span>
              Calidad garantizada
            </span>
          </div>
        </div>
      </section>

      {/* Aliado de tu negocio — Carnemart positioning + Alsuper warmth */}
      <section className="bg-[#F7F5F0] py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <p className="text-xs font-medium tracking-[0.2em] uppercase text-[#108910] mb-3">
              Aliado de tu negocio
            </p>
            <h2 className="text-3xl font-bold text-[#242529] tracking-tight">
              No solo entregamos insumos. Te ayudamos a crecer.
            </h2>
            <p className="text-base text-[#72767E] mt-3 max-w-xl mx-auto leading-relaxed">
              Más que un proveedor: calidad consistente, precios estables y facturación fiscal en cada pedido.
            </p>
          </div>
          <div className="flex flex-col md:flex-row items-center gap-10">
            {/* Left: image */}
            <div className="w-full md:w-1/2">
              <div className="aspect-[4/3] rounded-2xl bg-gradient-to-br from-[#E8F5E8] to-[#D4F0D4] flex items-center justify-center overflow-hidden">
                <div className="text-center px-8">
                  <span className="text-6xl">🚛</span>
                  <p className="mt-4 text-[#108910] font-semibold text-lg">
                    Más que un proveedor, tu aliado
                  </p>
                  <p className="text-sm text-[#72767E] mt-1">
                    Como tener la central de abastos a la vuelta de tu negocio
                  </p>
                </div>
              </div>
            </div>

            {/* Right: copy */}
            <div className="w-full md:w-1/2">
              <ul className="space-y-3 text-sm text-[#5C6068]">
                {[
                  {
                    title: "Calidad consistente",
                    desc: "Cada entrega pasa por control de calidad. Frescura garantizada, siempre.",
                  },
                  {
                    title: "Precios estables",
                    desc: "Sin sorpresas. Bloqueamos precios por semana para que planees tus costos.",
                  },
                  {
                    title: "Facturación fiscal",
                    desc: "Todos los pedidos incluyen CFDI. Deduce tus compras sin complicaciones.",
                  },
                  {
                    title: "Pedidos recurrentes",
                    desc: "Programa entregas semanales. Tus básicos siempre en stock, sin preocuparte.",
                  },
                  {
                    title: "Atención directa",
                    desc: "Un ejecutivo de cuenta para tu negocio. Resolvemos dudas por WhatsApp en minutos.",
                  },
                ].map((item) => (
                  <li key={item.title} className="flex gap-3">
                    <span className="mt-0.5 text-[#108910] shrink-0">✓</span>
                    <div>
                      <strong className="text-[#242529]">{item.title}</strong>
                      <span className="block text-xs text-[#72767E] mt-0.5">{item.desc}</span>
                    </div>
                  </li>
                ))}
              </ul>

              {/* Action CTA */}
              <div className="mt-6 flex gap-3">
                <a
                  href={`/${currentCity?.slug || DEFAULT_CITY_SLUG}/buscar`}
                  className="inline-flex items-center gap-2 bg-[#108910] text-white text-sm font-semibold px-5 py-2.5 rounded-[10px] hover:bg-[#0D720D] transition-colors"
                >
                  Registra tu negocio
                </a>
                <a
                  href="#"
                  className="inline-flex items-center gap-2 border border-[#C7CACD] text-[#5C6068] text-sm font-semibold px-5 py-2.5 rounded-[10px] hover:border-[#108910] hover:text-[#108910] transition-colors"
                >
                  Agenda una llamada
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Programa de Recompensas — premium editorial */}
      <section className="bg-[#f7f5f0] py-12 md:py-20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="relative bg-white rounded-2xl md:rounded-3xl shadow-[0_2px_40px_rgba(0,0,0,0.04)] border border-[#ede8df] overflow-hidden">
            {/* Subtle top accent bar */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#108910] via-[#3CC73C] to-[#108910]" />
            
            <div className="p-6 sm:p-12 lg:p-16">
              {/* Header */}
              <div className="text-center max-w-2xl mx-auto mb-8 sm:mb-12">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#E9FBE9] text-[#0D720D] text-xs font-semibold tracking-wider uppercase rounded-full mb-4 sm:mb-5">
                  <Percent className="w-3 h-3" /> Programa de Recompensas
                </span>
                <h2 className="text-2xl md:text-4xl font-bold text-[#1a1a1a] tracking-tight leading-tight">
                  Cada compra te hace crecer
                </h2>
                <p className="text-sm sm:text-base text-[#6b6b6b] mt-3 sm:mt-4 leading-relaxed">
                  Genera <strong className="text-[#108910]">recompensas del 5% al 20%</strong> en cada pedido
                  y canjéalas por marketing digital, fotografía profesional y desarrollo web.
                  Sin costo extra — solo crecimiento.
                </p>
              </div>

              {/* Illustration: loyalty tiers — responsive SVG */}
              <div className="flex justify-center mb-10 sm:mb-14 px-2" aria-hidden="true">
                <svg viewBox="0 0 520 170" className="w-full max-w-lg h-auto" fill="none" xmlns="http://www.w3.org/2000/svg">
                  {/* --- Tier labels --- */}
                  <text x="62" y="16" textAnchor="middle" fill="#108910" fillOpacity="0.45" fontFamily="system-ui, sans-serif" fontWeight="600" fontSize="9">NIVEL 1</text>
                  <text x="182" y="16" textAnchor="middle" fill="#108910" fillOpacity="0.55" fontFamily="system-ui, sans-serif" fontWeight="600" fontSize="9">NIVEL 2</text>
                  <text x="302" y="16" textAnchor="middle" fill="#108910" fillOpacity="0.65" fontFamily="system-ui, sans-serif" fontWeight="600" fontSize="9">NIVEL 3</text>
                  <text x="422" y="16" textAnchor="middle" fill="#108910" fillOpacity="0.85" fontFamily="system-ui, sans-serif" fontWeight="600" fontSize="9">NIVEL 4</text>

                  {/* ============ TIER 1: tiny restaurant ============ */}
                  <rect x="28" y="92" width="52" height="48" rx="3" fill="#E9FBE9" stroke="#108910" strokeWidth="1" opacity="0.7" />
                  <polygon points="24,92 54,74 84,92" fill="#108910" fillOpacity="0.1" stroke="#108910" strokeWidth="1" strokeOpacity="0.3" />
                  <rect x="64" y="76" width="7" height="14" rx="1" fill="#108910" fillOpacity="0.15" stroke="#108910" strokeWidth="0.7" opacity="0.25" />
                  <circle cx="67.5" cy="72" r="2" fill="#108910" fillOpacity="0.1" />
                  <circle cx="70" cy="68" r="2.5" fill="#108910" fillOpacity="0.08" />
                  <path d="M24 106 Q28 100 32 106 Q36 100 40 106 Q44 100 48 106 Q52 100 56 106 Q60 100 64 106 Q68 100 72 106 Q76 100 80 106" fill="#3CC73C" fillOpacity="0.2" stroke="#108910" strokeWidth="0.6" opacity="0.3" />
                  <rect x="38" y="114" width="14" height="26" rx="7" fill="#108910" fillOpacity="0.15" stroke="#108910" strokeWidth="0.6" opacity="0.3" />
                  <rect x="41" y="120" width="8" height="6" rx="1" fill="white" fillOpacity="0.6" />
                  <rect x="58" y="100" width="14" height="14" rx="2" fill="white" fillOpacity="0.5" stroke="#108910" strokeWidth="0.6" opacity="0.25" />
                  <line x1="65" y1="100" x2="65" y2="114" stroke="#108910" strokeWidth="0.5" opacity="0.2" />
                  <line x1="58" y1="107" x2="72" y2="107" stroke="#108910" strokeWidth="0.5" opacity="0.2" />
                  <rect x="38" y="86" width="30" height="8" rx="2" fill="#108910" fillOpacity="0.12" />
                  <line x1="53" y1="86" x2="53" y2="80" stroke="#108910" strokeWidth="0.5" opacity="0.15" />
                  <polygon points="54,44 56,50 62,50 57,54 59,60 54,56 49,60 51,54 46,50 52,50" fill="#3CC73C" fillOpacity="0.35" />
                  <rect x="40" y="62" width="28" height="13" rx="6" fill="#108910" fillOpacity="0.1" />
                  <text x="54" y="71" textAnchor="middle" fill="#108910" fillOpacity="0.55" fontFamily="system-ui, sans-serif" fontWeight="700" fontSize="8">5%</text>

                  <path d="M86 118 L108 118" stroke="#108910" strokeWidth="1" strokeDasharray="3 3" opacity="0.2" />
                  <polygon points="110,118 106,115 106,121" fill="#108910" fillOpacity="0.2" />

                  {/* ============ TIER 2 ============ */}
                  <rect x="118" y="78" width="60" height="62" rx="3" fill="#E9FBE9" stroke="#108910" strokeWidth="1" opacity="0.8" />
                  <polygon points="114,78 148,58 182,78" fill="#108910" fillOpacity="0.13" stroke="#108910" strokeWidth="1" strokeOpacity="0.35" />
                  <rect x="156" y="62" width="8" height="16" rx="1" fill="#108910" fillOpacity="0.18" stroke="#108910" strokeWidth="0.7" opacity="0.3" />
                  <circle cx="160" cy="58" r="2.5" fill="#108910" fillOpacity="0.1" />
                  <circle cx="164" cy="53" r="3" fill="#108910" fillOpacity="0.07" />
                  <path d="M114 92 Q118 86 122 92 Q126 86 130 92 Q134 86 138 92 Q142 86 146 92 Q150 86 154 92 Q158 86 162 92 Q166 86 170 92 Q174 86 178 92 Q182 86 186 92" fill="#3CC73C" fillOpacity="0.28" stroke="#108910" strokeWidth="0.7" opacity="0.35" />
                  <rect x="130" y="104" width="15" height="36" rx="7.5" fill="#108910" fillOpacity="0.2" stroke="#108910" strokeWidth="0.6" opacity="0.35" />
                  <rect x="133" y="110" width="9" height="8" rx="1" fill="white" fillOpacity="0.65" />
                  <rect x="154" y="88" width="14" height="14" rx="2" fill="white" fillOpacity="0.55" stroke="#108910" strokeWidth="0.6" opacity="0.3" />
                  <line x1="161" y1="88" x2="161" y2="102" stroke="#108910" strokeWidth="0.5" opacity="0.25" />
                  <line x1="154" y1="95" x2="168" y2="95" stroke="#108910" strokeWidth="0.5" opacity="0.25" />
                  <rect x="132" y="73" width="32" height="9" rx="2.5" fill="#108910" fillOpacity="0.15" />
                  <line x1="148" y1="73" x2="148" y2="66" stroke="#108910" strokeWidth="0.5" opacity="0.2" />
                  <polygon points="132,34 134,40 140,40 135,44 137,50 132,46 127,50 129,44 124,40 130,40" fill="#3CC73C" fillOpacity="0.45" />
                  <polygon points="164,34 166,40 172,40 167,44 169,50 164,46 159,50 161,44 156,40 162,40" fill="#3CC73C" fillOpacity="0.45" />
                  <rect x="130" y="52" width="36" height="13" rx="6" fill="#108910" fillOpacity="0.12" />
                  <text x="148" y="61" textAnchor="middle" fill="#108910" fillOpacity="0.6" fontFamily="system-ui, sans-serif" fontWeight="700" fontSize="8">10%</text>

                  <path d="M184 110 L206 110" stroke="#3CC73C" strokeWidth="1" strokeDasharray="3 3" opacity="0.25" />
                  <polygon points="208,110 204,107 204,113" fill="#3CC73C" fillOpacity="0.25" />

                  {/* ============ TIER 3 ============ */}
                  <rect x="216" y="62" width="72" height="78" rx="3" fill="#E9FBE9" stroke="#108910" strokeWidth="1" opacity="0.9" />
                  <polygon points="210,62 252,38 294,62" fill="#108910" fillOpacity="0.16" stroke="#108910" strokeWidth="1" strokeOpacity="0.4" />
                  <rect x="264" y="44" width="9" height="18" rx="1" fill="#108910" fillOpacity="0.2" stroke="#108910" strokeWidth="0.7" opacity="0.35" />
                  <circle cx="268.5" cy="40" r="3" fill="#108910" fillOpacity="0.12" />
                  <circle cx="273" cy="34" r="3.5" fill="#108910" fillOpacity="0.08" />
                  <path d="M210 78 Q214 72 218 78 Q222 72 226 78 Q230 72 234 78 Q238 72 242 78 Q246 72 250 78 Q254 72 258 78 Q262 72 266 78 Q270 72 274 78 Q278 72 282 78 Q286 72 290 78 Q294 72 298 78" fill="#3CC73C" fillOpacity="0.35" stroke="#108910" strokeWidth="0.8" opacity="0.4" />
                  <rect x="232" y="96" width="13" height="44" rx="6.5" fill="#108910" fillOpacity="0.25" stroke="#108910" strokeWidth="0.7" opacity="0.4" />
                  <rect x="236" y="102" width="7" height="10" rx="1" fill="white" fillOpacity="0.7" />
                  <rect x="248" y="96" width="13" height="44" rx="6.5" fill="#108910" fillOpacity="0.25" stroke="#108910" strokeWidth="0.7" opacity="0.4" />
                  <rect x="252" y="102" width="7" height="10" rx="1" fill="white" fillOpacity="0.7" />
                  <rect x="266" y="74" width="14" height="14" rx="2" fill="white" fillOpacity="0.6" stroke="#108910" strokeWidth="0.7" opacity="0.35" />
                  <line x1="273" y1="74" x2="273" y2="88" stroke="#108910" strokeWidth="0.5" opacity="0.3" />
                  <line x1="266" y1="81" x2="280" y2="81" stroke="#108910" strokeWidth="0.5" opacity="0.3" />
                  <rect x="238" y="58" width="36" height="9" rx="3" fill="#108910" fillOpacity="0.2" />
                  <line x1="256" y1="58" x2="256" y2="50" stroke="#108910" strokeWidth="0.6" opacity="0.25" />
                  <polygon points="224,22 226,27 231,27 227,30 229,35 224,32 219,35 221,30 217,27 222,27" fill="#3CC73C" fillOpacity="0.55" />
                  <polygon points="252,22 254,27 259,27 255,30 257,35 252,32 247,35 249,30 245,27 250,27" fill="#3CC73C" fillOpacity="0.55" />
                  <polygon points="280,22 282,27 287,27 283,30 285,35 280,32 275,35 277,30 273,27 278,27" fill="#3CC73C" fillOpacity="0.55" />
                  <rect x="236" y="38" width="40" height="14" rx="7" fill="#108910" fillOpacity="0.15" />
                  <text x="256" y="48" textAnchor="middle" fill="#108910" fillOpacity="0.65" fontFamily="system-ui, sans-serif" fontWeight="700" fontSize="8">15%</text>

                  <path d="M294 103 L316 103" stroke="#3CC73C" strokeWidth="1.2" strokeDasharray="3 3" opacity="0.3" />
                  <polygon points="318,103 314,100 314,106" fill="#3CC73C" fillOpacity="0.3" />

                  {/* ============ TIER 4: grand restaurant ============ */}
                  <rect x="326" y="44" width="84" height="96" rx="4" fill="#E9FBE9" stroke="#108910" strokeWidth="1.2" opacity="1" />
                  <polygon points="320,44 368,18 416,44" fill="#108910" fillOpacity="0.2" stroke="#108910" strokeWidth="1.2" strokeOpacity="0.45" />
                  <rect x="384" y="24" width="10" height="22" rx="1.5" fill="#108910" fillOpacity="0.25" stroke="#108910" strokeWidth="0.8" opacity="0.4" />
                  <circle cx="389" cy="20" r="3.5" fill="#108910" fillOpacity="0.14" />
                  <circle cx="394" cy="13" r="4" fill="#108910" fillOpacity="0.1" />
                  <path d="M320 64 Q325 57 330 64 Q335 57 340 64 Q345 57 350 64 Q355 57 360 64 Q365 57 370 64 Q375 57 380 64 Q385 57 390 64 Q395 57 400 64 Q405 57 410 64 Q415 57 420 64" fill="#3CC73C" fillOpacity="0.42" stroke="#108910" strokeWidth="0.9" opacity="0.5" />
                  <rect x="344" y="94" width="14" height="46" rx="7" fill="#108910" fillOpacity="0.3" stroke="#108910" strokeWidth="0.7" opacity="0.45" />
                  <rect x="348" y="100" width="8" height="14" rx="1.5" fill="white" fillOpacity="0.75" />
                  <rect x="362" y="94" width="14" height="46" rx="7" fill="#108910" fillOpacity="0.3" stroke="#108910" strokeWidth="0.7" opacity="0.45" />
                  <rect x="366" y="100" width="8" height="14" rx="1.5" fill="white" fillOpacity="0.75" />
                  <rect x="384" y="68" width="16" height="16" rx="2.5" fill="white" fillOpacity="0.65" stroke="#108910" strokeWidth="0.7" opacity="0.4" />
                  <line x1="392" y1="68" x2="392" y2="84" stroke="#108910" strokeWidth="0.5" opacity="0.3" />
                  <line x1="384" y1="76" x2="400" y2="76" stroke="#108910" strokeWidth="0.5" opacity="0.3" />
                  <rect x="348" y="68" width="14" height="14" rx="2" fill="white" fillOpacity="0.6" stroke="#108910" strokeWidth="0.7" opacity="0.35" />
                  <line x1="355" y1="68" x2="355" y2="82" stroke="#108910" strokeWidth="0.5" opacity="0.3" />
                  <rect x="348" y="40" width="40" height="10" rx="3" fill="#108910" fillOpacity="0.25" />
                  <line x1="368" y1="40" x2="368" y2="30" stroke="#108910" strokeWidth="0.6" opacity="0.3" />
                  <polygon points="340,8 341.5,12.5 346,12.5 342.5,15 344,19.5 340,17 336,19.5 337.5,15 334,12.5 338.5,12.5" fill="#3CC73C" fillOpacity="0.6" />
                  <polygon points="368,8 369.5,12.5 374,12.5 370.5,15 372,19.5 368,17 364,19.5 365.5,15 362,12.5 366.5,12.5" fill="#3CC73C" fillOpacity="0.6" />
                  <polygon points="396,8 397.5,12.5 402,12.5 398.5,15 400,19.5 396,17 392,19.5 393.5,15 390,12.5 394.5,12.5" fill="#3CC73C" fillOpacity="0.6" />
                  <path d="M360 15 L363 4 L366 12 L370 6 L373 12 L376 6 L380 12 L383 4 L386 15" fill="#3CC73C" fillOpacity="0.75" />
                  <rect x="358" y="15" width="30" height="6" rx="1.5" fill="#3CC73C" fillOpacity="0.6" />
                  <rect x="352" y="23" width="42" height="15" rx="7.5" fill="#108910" fillOpacity="0.18" />
                  <text x="373" y="33" textAnchor="middle" fill="#108910" fillOpacity="0.75" fontFamily="system-ui, sans-serif" fontWeight="700" fontSize="9">20%</text>

                  {/* --- Bottom growth line --- */}
                  <line x1="54" y1="148" x2="410" y2="148" stroke="#108910" strokeWidth="0.6" opacity="0.06" />
                  <circle cx="54" cy="148" r="2.5" fill="#108910" fillOpacity="0.2" />
                  <circle cx="148" cy="148" r="2.5" fill="#108910" fillOpacity="0.3" />
                  <circle cx="256" cy="148" r="2.5" fill="#108910" fillOpacity="0.4" />
                  <circle cx="373" cy="148" r="3" fill="#108910" fillOpacity="0.5" />
                </svg>
              </div>

              {/* Steps — elegant row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-8 sm:mb-12">
                {[
                  { step: "01", title: "Compra", desc: "Tus insumos al mejor precio de mayoreo." },
                  { step: "02", title: "Acumula", desc: "5% al 20% en Créditos por cada pedido." },
                  { step: "03", title: "Canjea", desc: "Marketing, fotografía, web y más." },
                  { step: "04", title: "Crece", desc: "Sube de nivel y gana más recompensas." },
                ].map((card) => (
                  <div key={card.step} className="flex items-center gap-3 sm:block sm:text-center group p-2 sm:p-0">
                    <span className="shrink-0 block text-[#108910]/30 text-xs font-mono font-bold tracking-widest sm:mb-3 group-hover:text-[#108910]/50 transition-colors sm:text-center w-6 sm:w-auto">
                      {card.step}
                    </span>
                    <div className="sm:text-center">
                      <h3 className="font-bold text-[#242529] sm:text-lg mb-0.5 sm:mb-1.5">
                        {card.title}
                      </h3>
                      <p className="text-sm text-[#6b6b6b] leading-relaxed">{card.desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* CTA */}
              <div className="text-center pt-6 sm:pt-8 border-t border-[#f0ede5]">
                <p className="text-xs sm:text-sm text-[#999893] mb-4">+500 restaurantes ya están creciendo con Resurte.me</p>
                <Link
                  href="/cashback"
                  className="btn-pill btn-pill-primary inline-flex items-center justify-center gap-2 text-sm sm:text-base px-6 sm:px-8 py-2.5 sm:py-3 w-full sm:w-auto"
                >
                  Descubre tu poder de recompensas
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials — Carnemart trust + Erewhon presentation */}
      <section className="bg-white py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <p className="text-xs font-medium tracking-[0.2em] uppercase text-[#108910] mb-3">
              Lo que dicen
            </p>
            <h2 className="text-3xl font-bold text-[#242529] tracking-tight">
              Cocineros que confían en nosotros
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {TESTIMONIALS.map((t) => (
              <div
                key={t.author}
                className="relative bg-[#F7F5F0] rounded-2xl p-6 pt-10 border border-[#E8E9EB]"
              >
                {/* Quote mark */}
                <span className="absolute top-4 left-6 text-5xl leading-none text-[#108910]/20 font-serif select-none">
                  &ldquo;
                </span>
                <p className="text-sm text-[#5C6068] leading-relaxed relative z-10">
                  {t.quote}
                </p>
                <div className="mt-5 pt-4 border-t border-[#E8E9EB] flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-[#108910]/10 flex items-center justify-center text-sm font-bold text-[#108910] shrink-0">
                    {t.author.charAt(0)}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[#242529]">{t.author}</p>
                    <p className="text-xs text-[#72767E]">{t.role} · {t.city}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Newsletter / WhatsApp CTA — Carnemart practical + Erewhon clean */}
      <section className="bg-[#1A1A1A] py-16">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <p className="text-xs font-medium tracking-[0.2em] uppercase text-[#3CC73C] mb-3">
            Mantente al día
          </p>
          <h2 className="text-3xl font-bold text-white tracking-tight">
            Recibe nuestra lista de precios semanal
          </h2>
          <p className="text-base text-white/60 mt-3 max-w-lg mx-auto leading-relaxed">
            Cada lunes te enviamos los precios actualizados. Sin spam, solo lo que necesitas para planear tus compras.
          </p>

          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3 max-w-md mx-auto">
            <a
              href={`https://wa.me/${process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "5216145337486"}?text=Quiero%20recibir%20la%20lista%20de%20precios%20semanal`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-[#25D366] text-white text-sm font-semibold px-6 py-3 rounded-[10px] hover:bg-[#20BD5A] transition-colors"
            >
              <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
              Recibir por WhatsApp
            </a>
            <span className="text-sm text-white/40">o</span>
            <a
              href={`/${currentCity?.slug || DEFAULT_CITY_SLUG}/buscar`}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 border border-white/20 text-white text-sm font-semibold px-6 py-3 rounded-[10px] hover:bg-white/10 transition-colors"
            >
              Ver catálogo
              <ArrowRight className="w-4 h-4" />
            </a>
          </div>

          <p className="mt-6 text-xs text-white/30">
            Sin spam. Solo actualizaciones de precios cada lunes. Cancela cuando quieras.
          </p>
        </div>
      </section>

      {/* Delivery Zones */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-20">
        <div className="text-center mb-8">
          <p className="text-xs font-medium tracking-[0.2em] uppercase text-[#108910] mb-3">
            Cobertura
          </p>
          <h2 className="text-3xl font-bold text-[#242529] tracking-tight">
            Zonas de entrega
          </h2>
          <p className="text-base text-[#72767E] mt-3">
            Entregamos en {MEXICO_CITIES.length} ciudades de México. ¿No está la tuya? Escríbenos.
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-2 max-w-4xl mx-auto">
          {MEXICO_CITIES.map((c) => (
            <a
              key={c.slug}
              href={`/${c.slug}`}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-full border text-sm transition-all ${
                c.slug === (currentCity?.slug || DEFAULT_CITY_SLUG)
                  ? "bg-[#108910] text-white border-[#108910]"
                  : "border-[#E8E9EB] text-[#72767E] hover:border-[#108910]/40 hover:text-[#108910] hover:bg-[#E9FBE9]"
              }`}
            >
              <MapPin className="w-3 h-3" />
              {c.name}
            </a>
          ))}
        </div>
      </section>

      {/* City Selector Modal */}
      {showSelector && (
        <CitySelector onClose={() => setShowSelector(false)} />
      )}

      {/* Sticky catalog button — bottom-left, complements WhatsApp at bottom-right */}
      <StickyCatalogButton citySlug={currentCity?.slug || DEFAULT_CITY_SLUG} />
    </div>
  )
}
