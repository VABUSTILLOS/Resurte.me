"use client"

import Link from "next/link"
import { ShoppingCart, User, MapPin, ChevronDown, Coins, LogOut, Package, Search } from "lucide-react"
import { useCity } from "@/contexts/city-context"
import { useCart } from "@/contexts/cart-context"
import { CitySelector } from "@/components/city/city-selector"
import { SearchBar } from "@/components/search/search-bar"
import { CART_DRAWER_EVENT } from "@/components/cart/cart-drawer"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import { useState, useEffect, useRef } from "react"
import type { User as SupabaseUser } from "@supabase/supabase-js"

export function Header() {
  const { city } = useCity()
  const { itemCount } = useCart()
  const router = useRouter()
  // Lazy browser-only client: creating it during SSR would throw when
  // NEXT_PUBLIC_SUPABASE_URL is a placeholder/unset.
  const [supabase] = useState(() => (typeof window === "undefined" ? null : createClient()))
  const [showCitySelector, setShowCitySelector] = useState(false)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [user, setUser] = useState<SupabaseUser | null>(null)
  const [cashbackBalance, setCashbackBalance] = useState<number | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // Detect auth state on mount and fetch wallet balance
  useEffect(() => {
    if (!supabase) return
    supabase.auth.getUser().then(async ({ data }) => {
      const currentUser = data.user ?? null
      setUser(currentUser)

      // Fetch wallet balance from Supabase if logged in
      if (currentUser) {
        try {
          const { data: wallet } = await supabase
            .from("wallets")
            .select("balance_credits")
            .eq("user_id", currentUser.id)
            .single()
          setCashbackBalance(wallet ? Number(wallet.balance_credits) : 0)
        } catch {
          // Fallback to localStorage for offline/unauthenticated
          const saved = localStorage.getItem("cashback-balance")
          setCashbackBalance(saved ? Number(saved) : null)
        }
      }
    })
  }, [supabase])

  // Close user menu on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false)
      }
    }
    document.addEventListener("click", handleClick)
    return () => document.removeEventListener("click", handleClick)
  }, [])

  async function handleSignOut() {
    if (!supabase) return
    await supabase.auth.signOut()
    setUser(null)
    setShowUserMenu(false)
    router.refresh()
    router.push("/")
  }

  return (
    <header
      className="sticky top-0 z-50 glass-header"
      style={{ paddingTop: "var(--header-inset-top)" }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16 gap-3">
          {/* Logo — Erewhon-style with refined type */}
          <Link href="/" className="flex items-center gap-1.5 shrink-0">
            <span className="text-[1.35rem] font-bold text-[#108910] tracking-tight">Resurte</span>
            <span className="text-[1.35rem] font-bold text-[#1a1a1a] tracking-tight">.me</span>
          </Link>

          {/* Recompensas badge — shown when user has balance */}
          {cashbackBalance !== null && cashbackBalance > 0 && (
            <Link
              href="/recompensas"
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] bg-[#108910]/10 border border-[#108910]/20 hover:bg-[#108910]/15 transition-colors text-sm shrink-0"
            >
              <Coins className="w-4 h-4 text-[#108910]" />
              <span className="font-semibold text-[#108910]">
                ${cashbackBalance.toLocaleString("es-MX")}
              </span>
              <span className="text-xs text-[#108910]/70 hidden lg:inline">recompensas</span>
            </Link>
          )}

          {/* City Selector Trigger */}
          <button
            onClick={() => setShowCitySelector(!showCitySelector)}
            aria-label="Seleccionar ciudad"
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] hover:bg-[#F7F5F0] transition-colors text-sm shrink-0 touch-target"
          >
            <MapPin className="w-4 h-4 text-[#108910]" aria-hidden="true" />
            <span className="font-medium text-[#343538]">
              {city ? city.name : "Seleccionar ciudad"}
            </span>
            <ChevronDown className="w-4 h-4 text-[#72767E]" aria-hidden="true" />
          </button>

          {/* Search Bar — hidden on mobile, shown on md+ */}
          {city && (
            <div className="hidden md:block flex-1 max-w-lg">
              <SearchBar citySlug={city.slug} compact />
            </div>
          )}

          {/* Right actions */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Mobile search shortcut */}
            {city && (
              <Link
                href={`/${city.slug}/buscar`}
                aria-label="Buscar productos"
                className="sm:hidden p-2 rounded-[10px] hover:bg-[#F7F5F0] transition-colors touch-target"
              >
                <Search className="w-5 h-5 text-[#343538]" aria-hidden="true" />
              </Link>
            )}

            {/* Mobile city trigger */}
            <button
              onClick={() => setShowCitySelector(!showCitySelector)}
              aria-label="Seleccionar ciudad"
              className="sm:hidden p-2 rounded-[10px] hover:bg-[#F7F5F0] transition-colors touch-target"
            >
              <MapPin className="w-5 h-5 text-[#343538]" aria-hidden="true" />
            </button>

            {/* Mobile: cart icon opens the drawer instantly (no page load).
                Desktop: keep the full /cart page (coupons, checkout). */}
            <button
              type="button"
              onClick={() => window.dispatchEvent(new Event(CART_DRAWER_EVENT))}
              aria-label={`Abrir carrito de compras${itemCount > 0 ? `, ${itemCount} artículos` : ""}`}
              className="sm:hidden relative p-2 rounded-[10px] hover:bg-[#F7F5F0] transition-colors touch-target"
            >
              <ShoppingCart className="w-5 h-5 text-[#343538]" aria-hidden="true" />
              {itemCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-[#108910] text-white text-[10px] font-bold rounded-full flex items-center justify-center px-0.5" role="status">
                  {itemCount > 99 ? "99+" : itemCount}
                </span>
              )}
            </button>

            <Link
              href="/cart"
              aria-label={`Carrito de compras${itemCount > 0 ? `, ${itemCount} artículos` : ""}`}
              className="hidden sm:flex relative p-2 rounded-[10px] hover:bg-[#F7F5F0] transition-colors touch-target"
            >
              <ShoppingCart className="w-5 h-5 text-[#343538]" aria-hidden="true" />
              {itemCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-[#108910] text-white text-[10px] font-bold rounded-full flex items-center justify-center px-0.5" role="status">
                  {itemCount > 99 ? "99+" : itemCount}
                </span>
              )}
            </Link>

            {user ? (
              <div ref={menuRef} className="relative">
                <button
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  aria-label="Menú de usuario"
                  aria-haspopup="menu"
                  aria-expanded={showUserMenu}
                  className="flex items-center gap-1.5 p-2 rounded-[10px] hover:bg-[#F7F5F0] transition-colors touch-target"
                >
                  <User className="w-5 h-5 text-[#108910]" aria-hidden="true" />
                </button>

                {showUserMenu && (
                  <div className="absolute right-0 top-full mt-1 w-56 bg-white rounded-xl shadow-lg border border-gray-100 py-1.5 z-50">
                    <div className="px-4 py-2 border-b border-gray-100">
                      <p className="text-sm font-medium text-[#343538] truncate">
                        {user.user_metadata?.full_name || user.email}
                      </p>
                      <p className="text-xs text-[#72767E] truncate">{user.email}</p>
                    </div>
                    <Link
                      href={city ? `/${city.slug}/mis-pedidos` : "/auth/login"}
                      onClick={() => setShowUserMenu(false)}
                      className="flex items-center gap-2 px-4 py-2.5 text-sm text-[#343538] hover:bg-[#F7F5F0] transition-colors"
                    >
                      <Package className="w-4 h-4" />
                      Mis pedidos
                    </Link>
                    <button
                      onClick={handleSignOut}
                      className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <LogOut className="w-4 h-4" />
                      Cerrar sesión
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <Link
                href="/auth/login"
                aria-label="Iniciar sesión"
                className="p-2 rounded-[10px] hover:bg-[#F7F5F0] transition-colors touch-target"
              >
                <User className="w-5 h-5 text-[#343538]" aria-hidden="true" />
              </Link>
            )}
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
