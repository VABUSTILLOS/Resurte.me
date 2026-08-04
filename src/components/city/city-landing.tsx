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
  const [searchQuery, setSearchQuery] = useState("")
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
    if (searchQuery.trim()) {
      router.push(`/${currentCity?.slug || DEFAULT_CITY_SLUG}/buscar?q=${encodeURIComponent(searchQuery.trim())}`)
    }
  }

  const handleCatalogSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (searchQuery.trim()) {
      router.push(`/${currentCity?.slug || DEFAULT_CITY_SLUG}/buscar?q=${encodeURIComponent(searchQuery.trim())}`)
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
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
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
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
            {[
              { value: "1,200+", label: "Negocios abastecidos", icon: Building2 },
              { value: "20", label: "Ciudades en México", icon: MapPin },
              { value: "Hoy", label: "Tiempo de entrega", icon: Truck },
              { value: "CFDI", label: "Facturación incluida", icon: CreditCard },
            ].map((stat) => (
              <div key={stat.label} className="flex flex-col items-center gap-1.5">
                <stat.icon className="w-5 h-5 text-[#108910]/60 mb-1" />
                <span className="text-2xl sm:text-3xl font-bold text-[#242529] tracking-tight">{stat.value}</span>
                <span className="text-xs text-[#72767E]">{stat.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Search bar for products */}
      <section className="bg-white py-8 border-b border-[#E8E9EB]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <form onSubmit={handleCatalogSearch} className="max-w-2xl mx-auto">
            <div className="flex items-stretch bg-[#F7F5F0] rounded-xl overflow-hidden border border-[#E8E9EB] focus-within:border-[#108910]/40 focus-within:ring-2 focus-within:ring-[#108910]/10 transition-all">
              <div className="flex items-center gap-2 flex-1 pl-4">
                <Search className="w-5 h-5 text-[#B0B3B8] shrink-0" />
                <input
                  type="text"
                  placeholder="Buscar frutas, verduras, carnes, abarrotes..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
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
      <section className="bg-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <ScrollReveal className="text-center mb-8">
            <p className="text-xs font-medium tracking-[0.2em] uppercase text-[#108910] mb-3">
              Categorías
            </p>
            <h2 className="text-2xl font-bold text-[#1a1a1a] tracking-tight">
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

      {/* "Ver todos los productos" button — Erewhon-style, below category icons */}
      <section className="bg-[#f7f4ef] py-6 border-b border-[#ede8df]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 text-center">
          <Link
            href={`/${currentCity?.slug || DEFAULT_CITY_SLUG}/buscar`}
            className="btn-pill btn-pill-primary inline-flex items-center gap-2 text-base px-8 py-3"
          >
            <Grid3X3 className="w-5 h-5" />
            Ver todos los productos
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* Product catalog by category — with "Ver Todo" links (Erewhon-style) */}
      <section className="bg-white py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <ScrollReveal className="text-center mb-10">
            <p className="text-xs font-medium tracking-[0.2em] uppercase text-[#108910] mb-3">
              Catálogo completo
            </p>
            <h2 className="text-3xl font-bold text-[#1a1a1a] tracking-tight">
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

          {/* "Ver todos los productos" CTA — after steps */}
          <div className="mt-10 text-center">
            <Link
              href={`/${currentCity?.slug || DEFAULT_CITY_SLUG}/buscar`}
              className="btn-pill btn-pill-primary inline-flex items-center gap-2 text-base px-8 py-3"
            >
              <Grid3X3 className="w-5 h-5" />
              Ver todos los productos
              <ArrowRight className="w-4 h-4" />
            </Link>
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
      <section className="bg-[#F7F5F0] py-14">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
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
              <span className="text-xs font-bold tracking-widest uppercase text-[#108910]">
                Aliado de tu negocio
              </span>
              <h2 className="text-2xl font-bold text-[#242529] mt-2 mb-4">
                No solo entregamos insumos. Te ayudamos a crecer.
              </h2>
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
                  className="inline-flex items-center gap-2 bg-[#108910] text-white text-sm font-semibold px-5 py-2.5 rounded-lg hover:bg-[#0D720D] transition-colors"
                >
                  Registra tu negocio
                </a>
                <a
                  href="#"
                  className="inline-flex items-center gap-2 border border-[#C7CACD] text-[#5C6068] text-sm font-semibold px-5 py-2.5 rounded-lg hover:border-[#108910] hover:text-[#108910] transition-colors"
                >
                  Agenda una llamada
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Programa de Recompensas — Potencia tu restaurante */}
      <section className="bg-[#0D5E0D] py-20 relative overflow-hidden">
        {/* Decorative elements */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-[#3CC73C]/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl" />
        <div className="absolute bottom-0 left-0 w-72 h-72 bg-[#3CC73C]/8 rounded-full translate-y-1/2 -translate-x-1/2 blur-3xl" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 relative z-10">
          <div className="text-center mb-12">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-white/15 text-[#3CC73C] text-xs font-bold tracking-wider uppercase rounded-full border border-[#3CC73C]/30 mb-4">
              <Percent className="w-3 h-3" /> Programa de Recompensas
            </span>
            <h2 className="text-3xl md:text-4xl font-black text-white tracking-tight">
              Potencia tu restaurante{" "}
              <span className="text-[#3CC73C]">con Resurte.me</span>
            </h2>
            <p className="text-base text-white/70 mt-4 max-w-2xl mx-auto leading-relaxed">
              Tus compras de insumos ya están trabajando para ti. Cada pedido genera{" "}
              <strong className="text-white">recompensas del 5% al 20%</strong>{" "}
              que puedes canjear por servicios de marketing digital, fotografía profesional,
              desarrollo web y más. Sin costo extra. Solo crecimiento.
            </p>

            {/* Before vs After — the Resurte.me difference */}
            <div className="mt-8 max-w-xl mx-auto">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl bg-white/5 border border-white/10 p-4 text-left">
                  <p className="text-white/40 text-[10px] uppercase tracking-wider font-medium mb-2">Antes</p>
                  <p className="text-white/50 text-xs leading-relaxed">
                    Tenías que elegir entre{" "}
                    <span className="text-white/70 line-through">comprar insumos</span>{" "}
                    o{" "}
                    <span className="text-white/70 line-through">pagar marketing</span>.
                    Uno hacía funcionar tu cocina, el otro traía clientes.{" "}
                    <strong className="text-red-400/80">Perdías uno sí o sí.</strong>
                  </p>
                </div>
                <div className="rounded-xl bg-[#3CC73C]/10 border border-[#3CC73C]/30 p-4 text-left relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-16 h-16 bg-[#3CC73C]/10 rounded-full -translate-y-1/2 translate-x-1/2" />
                  <p className="text-[#3CC73C] text-[10px] uppercase tracking-wider font-bold mb-2 relative z-10">Ahora</p>
                  <p className="text-white/80 text-xs leading-relaxed relative z-10">
                    <strong className="text-white">Sigues comprando tus insumos</strong>{" "}
                    y automáticamente generas recompensas para canjear por marketing, fotografía y web.{" "}
                    <strong className="text-[#3CC73C]">Los dos, sin pagar extra.</strong>
                  </p>
                </div>
              </div>
              <p className="text-center text-[#3CC73C] text-xs font-bold mt-3 tracking-wide">
                La diferencia Resurte.me
              </p>
            </div>
          </div>

          {/* Benefit cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
            {[
              {
                icon: "🛒",
                title: "Compra tus insumos",
                desc: "Frutas, verduras, carnes y abarrotes. Como siempre, al mejor precio de mayoreo.",
              },
              {
                icon: "💎",
                title: "Acumula recompensas",
                desc: "Del 5% al 20% de cada compra se convierte en Créditos según tu nivel.",
              },
              {
                icon: "🚀",
                title: "Canjea por crecimiento",
                desc: "Marketing digital, fotografía, menús web y más. Servicios que atraen más clientes.",
              },
              {
                icon: "📈",
                title: "Sube de nivel",
                desc: "Verde → Plata → Oro → Negro. Más compras semanales, más recompensas.",
              },
            ].map((card) => (
              <div
                key={card.title}
                className="group p-6 rounded-xl bg-white/10 backdrop-blur-sm border border-white/15 hover:bg-white/15 hover:border-[#3CC73C]/40 hover:-translate-y-1 transition-all duration-200"
              >
                <div className="text-3xl mb-3">{card.icon}</div>
                <h3 className="font-bold text-white mb-1.5 group-hover:text-[#3CC73C] transition-colors">
                  {card.title}
                </h3>
                <p className="text-sm text-white/60 leading-relaxed">{card.desc}</p>
              </div>
            ))}
          </div>

          {/* Social proof + CTA */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <div className="flex items-center gap-2 text-white/50 text-sm">
              <span className="flex -space-x-2">
                {["🍽️", "🥩", "🥑", "🧀"].map((emoji, i) => (
                  <span key={i} className="w-7 h-7 rounded-full bg-white/20 border-2 border-[#0D5E0D] flex items-center justify-center text-xs">
                    {emoji}
                  </span>
                ))}
              </span>
              <span>+500 restaurantes ya están creciendo</span>
            </div>
            <Link
              href="/cashback"
              className="inline-flex items-center gap-2 bg-[#3CC73C] text-[#0D5E0D] text-sm font-bold px-6 py-3 rounded-[10px] hover:bg-[#4DD94D] hover:scale-105 active:scale-95 transition-all shadow-[0_4px_20px_rgba(60,199,60,0.35)]"
            >
              Descubre tu poder de recompensas
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          {/* Bottom micro-copy */}
          <p className="text-center text-white/30 text-xs mt-6">
            Sin letras chiquitas. Tus Créditos se canjean por servicios en la Tienda de Crecimiento.
          </p>
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
