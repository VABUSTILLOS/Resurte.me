"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { RestaurantProvider, useRestaurant } from "@/contexts/restaurant-context"
import { ToastProvider } from "@/components/toast"
import ThemeToggle from "@/components/panel/ThemeToggle"
import { PanelMobileNav } from "./_components/PanelMobileNav"
import { PanelQuickNav } from "./_components/PanelQuickNav"
import { PanelCompactFooter } from "@/components/panel/PanelCompactFooter"
import { t } from "@/lib/i18n/es"
import type { RestaurantCollection } from "@/types"
import {
  Store, ChefHat, ChevronDown, Sparkles, Menu,
} from "lucide-react"

const COLLECTION_ICONS: Record<string, string> = {
    "hamburguesas-hot-dogs": "🍔",
    "taquerias-antojitos": "🌮",
    "sushi-comida-asiatica": "🍣",
    "pizzas-comida-italiana": "🍕",
    "pollo-alitas": "🍗",
    "comida-mexicana-corrida": "🍲",
    "mariscos-pescados": "🦐",
    "cortes-carne-asaderos": "🥩",
    "cafeterias-crepas-desayunos": "☕",
    "saludable-ensaladas-pokes": "🥗",
    "postres-panaderia-helados": "🍰",
    "comida-arabe-griega": "🥙",
    "comida-venezolana-latina": "🇻🇪",
    "bebidas-bares-botanas": "🍺",
}

function PanelContent({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  // Lazy browser-only client: creating it during SSR would throw when
  // NEXT_PUBLIC_SUPABASE_URL is a placeholder/unset.
  const [supabase] = useState(() => (typeof window === "undefined" ? null : createClient()))
  const { selectedCollection, setSelectedCollection, collections, setCollections } = useRestaurant()
  const [loading, setLoading] = useState(true)
  const [showPicker, setShowPicker] = useState(false)
  const [showMobileNav, setShowMobileNav] = useState(false)

  useEffect(() => {
    async function load() {
      if (!supabase) return
      const { data } = await supabase
        .from("restaurant_collections")
        .select("*")
        .eq("is_active", true)
        .order("display_order")
      if (data) setCollections(data as RestaurantCollection[])
      setLoading(false)
    }
    load()
  }, [supabase, setCollections])

  // Redirect to panel home if no collection selected and not already there
  useEffect(() => {
    if (!loading && !selectedCollection && window.location.pathname !== "/panel") {
      router.push("/panel")
    }
  }, [loading, selectedCollection, router])

  // Publish a body class so floating elements (cookie banner, toast)
  // move above the quick-nav bar on mobile.
  useEffect(() => {
    if (!loading && selectedCollection) {
      document.body.classList.add("has-panel-bottom-nav")
    } else {
      document.body.classList.remove("has-panel-bottom-nav")
    }
    return () => document.body.classList.remove("has-panel-bottom-nav")
  }, [loading, selectedCollection])

  return (
    <div className="min-h-screen transition-colors duration-300" style={{ backgroundColor: "var(--background)", color: "var(--foreground)" }}>
      {/* Top bar with restaurant type selector */}
      <div className="sticky top-[var(--header-top-offset)] z-40 bg-white/90 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3">
          <div className="flex items-center justify-between gap-2 sm:gap-4">
            <div className="flex items-center gap-2 min-w-0">
              <button
                onClick={() => setShowMobileNav(true)}
                aria-label="Abrir menú de herramientas"
                aria-haspopup="dialog"
                aria-expanded={showMobileNav}
                className="lg:hidden shrink-0 p-2 rounded-xl hover:bg-gray-100 transition-colors touch-target"
              >
                <Menu className="w-5 h-5 text-gray-700" />
              </button>
              <Store className="hidden lg:block w-5 h-5 text-[#0E7A0E] shrink-0" />
              <h1 className="hidden lg:block text-lg font-bold text-gray-900 truncate">
                {t("panel.title")}
              </h1>
            </div>

            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <ThemeToggle />

              <div className="relative min-w-0">
                <button
                  onClick={() => setShowPicker(!showPicker)}
                  className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-2 rounded-xl border text-sm font-medium transition-all ${
                    selectedCollection
                      ? "border-[#0E7A0E]/30 bg-[#F0FDF4] text-[#0E7A0E]"
                      : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"
                  }`}
                >
                  {selectedCollection ? (
                    <>
                      <span>{COLLECTION_ICONS[selectedCollection.slug] || "🍽️"}</span>
                      <span className="max-w-[110px] sm:max-w-[160px] truncate">{selectedCollection.name}</span>
                    </>
                  ) : (
                    <>
                      <ChefHat className="w-4 h-4 shrink-0" />
                      <span className="hidden sm:inline">{t("panel.pickRestaurantType")}</span>
                    </>
                  )}
                  <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${showPicker ? "rotate-180" : ""}`} />
                </button>

              {showPicker && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setShowPicker(false)}
                  />
                  <div className="absolute right-0 top-full mt-1 w-80 max-w-[calc(100vw-2rem)] bg-white rounded-xl shadow-xl border border-gray-100 py-2 z-20 max-h-80 overflow-y-auto">
                    <div className="px-3 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                      {t("panel.cuisinePrompt")}
                    </div>
                    {collections.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => { setSelectedCollection(c); setShowPicker(false) }}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm text-left hover:bg-gray-50 transition-colors ${
                          selectedCollection?.id === c.id ? "bg-[#F0FDF4] text-[#0E7A0E] font-semibold" : "text-gray-700"
                        }`}
                      >
                        <span className="text-lg">{COLLECTION_ICONS[c.slug] || "🍽️"}</span>
                        <span>{c.name}</span>
                        {selectedCollection?.id === c.id && (
                          <span className="ml-auto text-[10px] bg-[#0E7A0E]/10 text-[#0E7A0E] px-1.5 py-0.5 rounded-full font-bold">
                            {t("panel.current")}
                          </span>
                        )}
                      </button>
                    ))}
                    {selectedCollection && (
                      <>
                        <div className="border-t border-gray-100 my-1" />
                        <button
                          onClick={() => { setSelectedCollection(null); setShowPicker(false); router.push("/panel") }}
                          className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-red-500 hover:bg-red-50 transition-colors"
                        >
                          {t("panel.clearSelection")}
                        </button>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
          </div>

          {/* Selected collection banner — hidden on mobile (reclaims the sticky nav row) */}
          {selectedCollection && (
            <div className="hidden sm:mt-2 sm:flex items-center gap-2 text-xs text-gray-400">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>{t("panel.toolsPersonalizedFor")}</span>
              <span className="font-semibold text-gray-600">{selectedCollection.name}</span>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 pb-24 lg:pb-6">
        <ToastProvider>{children}</ToastProvider>
      </div>

      <PanelCompactFooter />

      {selectedCollection && <PanelQuickNav />}

      <PanelMobileNav
        open={showMobileNav}
        onClose={() => setShowMobileNav(false)}
        selectedCollection={selectedCollection}
      />
    </div>
  )
}

export function PanelLayoutClient({ children }: { children: React.ReactNode }) {
  return (
    <RestaurantProvider>
      <PanelContent>{children}</PanelContent>
    </RestaurantProvider>
  )
}
