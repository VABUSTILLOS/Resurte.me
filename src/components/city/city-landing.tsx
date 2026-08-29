"use client"

import { useCity, DEFAULT_CITY_SLUG } from "@/contexts/city-context"
import { CitySelector } from "@/components/city/city-selector"
import { useState, useEffect, useMemo } from "react"
import { MEXICO_CITIES } from "@/lib/cities"
import { StickyCatalogButton } from "@/components/ui/sticky-catalog-button"
import { UserShopView } from "@/components/shop/user-shop-view"
import { useRouter } from "next/navigation"
import { useMediaQuery } from "@/hooks/use-media-query"
import { MobileSearchOverlay } from "@/components/search/mobile-search-overlay"
import { createClient } from "@/lib/supabase/client"
import type { Category, Product, RestaurantCollection } from "@/types"
import { CollectionSlider } from "@/components/collections/collection-slider"
import { PromoBanner } from "@/components/ui/promo-banner"
import { HeroSection } from "./landing/hero"
import { SocialProof } from "./landing/social-proof"
import { CatalogSearchBar } from "./landing/search-bar"
import { CategoryGrid } from "./landing/category-grid"
import { CatalogByCategory } from "./landing/catalog-by-category"
import { PricingBanner } from "./landing/pricing-banner"
import { CustomerSegments } from "./landing/segments"
import { HowItWorks } from "./landing/how-it-works"
import { AliadoNegocio } from "./landing/aliado-negocio"
import { RewardsProgram } from "./landing/rewards-program"
import { TestimonialsSection } from "./landing/testimonials"
import { NewsletterCta } from "./landing/newsletter-cta"
import { DeliveryZones } from "./landing/delivery-zones"

// Restaurant-essential categories shown on the homepage — ordered by priority
const FEATURED_CATEGORY_SLUGS = [
  "frutas-verduras",
  "carnes-pescados",
  "lacteos-huevos",
  "despensa",
  "bebidas",
]

export function CityLanding({
  citySlug,
  categories,
  products,
  collections,
}: {
  citySlug?: string
  categories: Category[]
  products: Product[]
  collections?: RestaurantCollection[]
}) {
  const { city, setCity } = useCity()
  const [showSelector, setShowSelector] = useState(false)
  const [heroSearch, setHeroSearch] = useState("")
  const [catalogSearch, setCatalogSearch] = useState("")
  const [heroOverlayOpen, setHeroOverlayOpen] = useState(false)
  const router = useRouter()

  // La página es ISR/estática, así que la sesión se detecta en el cliente
  // tras la hidratación (antes el servidor leía cookies() y eso convertía
  // todas las páginas de catálogo en SSR por request). Usuarios logueados
  // verán el landing público un instante antes de cambiar a UserShopView.
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  useEffect(() => {
    const supabase = createClient()
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => {
      setIsLoggedIn(!!data.session)
    })
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsLoggedIn(!!session)
    })
    return () => subscription.unsubscribe()
  }, [])

  // En móvil el hero search abre el overlay de búsqueda en vivo (readOnly
  // input + tap). En sm+ conserva la navegación del form.
  const isMobileHero = useMediaQuery("(max-width: 639px)", true)

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

  // Products now have price/sale_price/stock_status directly

  // Group by category — memoized
  const productsByCategory = useMemo(() => {
    const map = new Map<number, typeof products>()
    products.forEach((p) => {
      const list = map.get(p.category_id) || []
      list.push(p)
      map.set(p.category_id, list)
    })
    return map
  }, [products])

  // Only show categories that have products — memoized
  const activeCategories = useMemo(() =>
    categories.filter((c) => {
      const catProducts = productsByCategory.get(c.id)
      return catProducts && catProducts.length > 0
    }),
    [categories, productsByCategory]
  )

  // Featured categories for the product grid (only 4 restaurant-essential) — memoized
  const featuredCategories = useMemo(() =>
    activeCategories.filter((c) =>
      FEATURED_CATEGORY_SLUGS.includes(c.slug)
    ),
    [activeCategories]
  )

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    // En móvil el hero search delega al overlay de búsqueda en vivo.
    if (isMobileHero) {
      setHeroOverlayOpen(true)
      return
    }
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

  // ── Logged-in user: dynamic shop experience ──
  if (isLoggedIn) {
    return (
      <UserShopView
        categories={categories}
        products={products}
        citySlug={currentCity?.slug || DEFAULT_CITY_SLUG}
      />
    )
  }
  
  return (
    <div className="min-h-[80vh] flex flex-col">
      <HeroSection
        cityName={currentCity?.name || "Ciudad de México"}
        cityState={currentCity?.state || "CDMX"}
        citySlug={currentCity?.slug || DEFAULT_CITY_SLUG}
        heroSearch={heroSearch}
        onSearchChange={setHeroSearch}
        isMobileHero={isMobileHero}
        onOpenSearchOverlay={() => setHeroOverlayOpen(true)}
        onSearch={handleSearch}
        onChangeCity={() => setShowSelector(true)}
      />

      {/* Promo banner (feature-flag controlled) */}
      <PromoBanner />

      <SocialProof />

      <CatalogSearchBar
        value={catalogSearch}
        onChange={setCatalogSearch}
        onSubmit={handleCatalogSearch}
      />

      <CategoryGrid
        activeCategories={activeCategories}
        productsByCategory={productsByCategory}
        citySlug={currentCity?.slug || DEFAULT_CITY_SLUG}
      />

      {/* Restaurant collection slider — curated by business type */}
      {collections && collections.length > 0 && (
        <CollectionSlider collections={collections} citySlug={currentCity?.slug || DEFAULT_CITY_SLUG} />
      )}

      <CatalogByCategory
        featuredCategories={featuredCategories}
        activeCategories={activeCategories}
        productsByCategory={productsByCategory}
        productsCount={products.length}
        citySlug={currentCity?.slug || DEFAULT_CITY_SLUG}
      />

      <PricingBanner />

      <CustomerSegments />

      <HowItWorks />

      <AliadoNegocio />

      <RewardsProgram />

      <TestimonialsSection />

      <NewsletterCta citySlug={currentCity?.slug || DEFAULT_CITY_SLUG} />

      <DeliveryZones currentCitySlug={currentCity?.slug || DEFAULT_CITY_SLUG} />

      {/* City Selector Modal */}
      {showSelector && (
        <CitySelector onClose={() => setShowSelector(false)} />
      )}

      {/* Mobile hero search overlay */}
      {heroOverlayOpen && (
        <MobileSearchOverlay
          citySlug={currentCity?.slug || DEFAULT_CITY_SLUG}
          onClose={() => setHeroOverlayOpen(false)}
        />
      )}

      {/* Sticky catalog button — bottom-left, complements WhatsApp at bottom-right */}
      <StickyCatalogButton citySlug={currentCity?.slug || DEFAULT_CITY_SLUG} />
    </div>
  )
}
