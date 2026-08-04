"use client"

import Link from "next/link"
import { ShoppingCart, User, MapPin, ChevronDown, Coins } from "lucide-react"
import { useCity } from "@/contexts/city-context"
import { useCart } from "@/contexts/cart-context"
import { CitySelector } from "@/components/city/city-selector"
import { SearchBar } from "@/components/search/search-bar"
import { useState, useEffect } from "react"

export function Header() {
  const { city } = useCity()
  const { itemCount } = useCart()
  const [showCitySelector, setShowCitySelector] = useState(false)
  const [cashbackBalance, setCashbackBalance] = useState<number | null>(null)

  // Load cashback balance from localStorage (set by cashback page)
  useEffect(() => {
    const saved = localStorage.getItem("cashback-balance")
    if (saved) {
      setCashbackBalance(Number(saved))
    }
  }, [])

  return (
    <header className="sticky top-0 z-50 glass-header">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16 gap-3">
          {/* Logo — Erewhon-style with refined type */}
          <Link href="/" className="flex items-center gap-1.5 shrink-0">
            <span className="text-[1.35rem] font-bold text-[#108910] tracking-tight">Resurte</span>
            <span className="text-[1.35rem] font-bold text-[#1a1a1a] tracking-tight">.me</span>
          </Link>

          {/* Cashback badge — shown when user has balance */}
          {cashbackBalance !== null && cashbackBalance > 0 && (
            <Link
              href="/cashback"
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] bg-[#108910]/10 border border-[#108910]/20 hover:bg-[#108910]/15 transition-colors text-sm shrink-0"
            >
              <Coins className="w-4 h-4 text-[#108910]" />
              <span className="font-semibold text-[#108910]">
                ${cashbackBalance.toLocaleString("es-MX")}
              </span>
              <span className="text-xs text-[#108910]/70 hidden lg:inline">cashback</span>
            </Link>
          )}

          {/* City Selector Trigger */}
          <button
            onClick={() => setShowCitySelector(!showCitySelector)}
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] hover:bg-[#F7F5F0] transition-colors text-sm shrink-0"
          >
            <MapPin className="w-4 h-4 text-[#108910]" />
            <span className="font-medium text-[#343538]">
              {city ? city.name : "Seleccionar ciudad"}
            </span>
            <ChevronDown className="w-4 h-4 text-[#72767E]" />
          </button>

          {/* Search Bar — hidden on mobile, shown on md+ */}
          {city && (
            <div className="hidden md:block flex-1 max-w-lg">
              <SearchBar citySlug={city.slug} compact />
            </div>
          )}

          {/* Right actions */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Mobile city trigger */}
            <button
              onClick={() => setShowCitySelector(!showCitySelector)}
              className="sm:hidden p-2 rounded-[10px] hover:bg-[#F7F5F0] transition-colors"
            >
              <MapPin className="w-5 h-5 text-[#343538]" />
            </button>

            <Link
              href="/cart"
              className="relative p-2 rounded-[10px] hover:bg-[#F7F5F0] transition-colors"
            >
              <ShoppingCart className="w-5 h-5 text-[#343538]" />
              {itemCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-[#108910] text-white text-[10px] font-bold rounded-full flex items-center justify-center px-0.5">
                  {itemCount > 99 ? "99+" : itemCount}
                </span>
              )}
            </Link>

            <Link
              href="/auth/login"
              className="p-2 rounded-[10px] hover:bg-[#F7F5F0] transition-colors"
            >
              <User className="w-5 h-5 text-[#343538]" />
            </Link>
          </div>
        </div>
      </div>

      {/* City Selector Modal */}
      {showCitySelector && (
        <CitySelector onClose={() => setShowCitySelector(false)} />
      )}
    </header>
  )
}
