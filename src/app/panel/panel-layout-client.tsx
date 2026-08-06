"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { RestaurantProvider, useRestaurant } from "@/contexts/restaurant-context"
import type { RestaurantCollection } from "@/types"
import {
  Store, ChefHat, ChevronDown, Sparkles,
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

  return (
    <div className="min-h-screen bg-[#faf8f5]">
      {/* Top bar with restaurant type selector */}
      <div className="sticky top-16 z-40 bg-white/90 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 min-w-0">
              <Store className="w-5 h-5 text-[#108910] shrink-0" />
              <h1 className="text-lg font-bold text-gray-900 truncate">
                Panel de Herramientas
              </h1>
            </div>

            <div className="relative">
              <button
                onClick={() => setShowPicker(!showPicker)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-medium transition-all ${
                  selectedCollection
                    ? "border-[#108910]/30 bg-[#F0FDF4] text-[#108910]"
                    : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"
                }`}
              >
                {selectedCollection ? (
                  <>
                    <span>{COLLECTION_ICONS[selectedCollection.slug] || "🍽️"}</span>
                    <span className="max-w-[160px] truncate">{selectedCollection.name}</span>
                  </>
                ) : (
                  <>
                    <ChefHat className="w-4 h-4" />
                    <span>Elige tu tipo de restaurante</span>
                  </>
                )}
                <ChevronDown className={`w-4 h-4 transition-transform ${showPicker ? "rotate-180" : ""}`} />
              </button>

              {showPicker && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setShowPicker(false)}
                  />
                  <div className="absolute right-0 top-full mt-1 w-80 bg-white rounded-xl shadow-xl border border-gray-100 py-2 z-20 max-h-80 overflow-y-auto">
                    <div className="px-3 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                      ¿Qué tipo de cocina tienes?
                    </div>
                    {collections.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => { setSelectedCollection(c); setShowPicker(false) }}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm text-left hover:bg-gray-50 transition-colors ${
                          selectedCollection?.id === c.id ? "bg-[#F0FDF4] text-[#108910] font-semibold" : "text-gray-700"
                        }`}
                      >
                        <span className="text-lg">{COLLECTION_ICONS[c.slug] || "🍽️"}</span>
                        <span>{c.name}</span>
                        {selectedCollection?.id === c.id && (
                          <span className="ml-auto text-[10px] bg-[#108910]/10 text-[#108910] px-1.5 py-0.5 rounded-full font-bold">
                            Actual
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
                          Quitar selección
                        </button>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Selected collection banner */}
          {selectedCollection && (
            <div className="mt-2 flex items-center gap-2 text-xs text-gray-400">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>Todas las herramientas están personalizadas para</span>
              <span className="font-semibold text-gray-600">{selectedCollection.name}</span>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {children}
      </div>
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
