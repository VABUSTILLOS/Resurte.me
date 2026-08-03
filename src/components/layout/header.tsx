"use client"

import Link from "next/link"
import { ShoppingCart, User, MapPin, ChevronDown } from "lucide-react"
import { useCity } from "@/contexts/city-context"
import { useCart } from "@/contexts/cart-context"
import { CitySelector } from "@/components/city/city-selector"
import { SearchBar } from "@/components/search/search-bar"
import { CART_DRAWER_EVENT } from "@/components/cart/cart-drawer"
import { useState } from "react"

export function Header() {
  const { city } = useCity()
  const { itemCount } = useCart()
  const [showCitySelector, setShowCitySelector] = useState(false)

  const toggleCartDrawer = () => {
    window.dispatchEvent(new Event(CART_DRAWER_EVENT))
  }

  return (
    <header className="sticky top-0 z-50 bg-white border-b border-[#E8E9EB]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16 gap-3">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <span className="text-2xl font-bold text-[#108910]">Resurte</span>
            <span className="text-2xl font-bold text-[#242529]">.me</span>
          </Link>

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

            <button
              onClick={toggleCartDrawer}
              className="relative p-2 rounded-[10px] hover:bg-[#F7F5F0] transition-colors"
            >
              <ShoppingCart className="w-5 h-5 text-[#343538]" />
              {itemCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-[#108910] text-white text-[10px] font-bold rounded-full flex items-center justify-center px-0.5">
                  {itemCount > 99 ? "99+" : itemCount}
                </span>
              )}
            </button>

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
