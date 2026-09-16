"use client"

import Link from "next/link"
import { ShoppingCart, User, MapPin, ChevronDown, Coins, LogOut, Package, Search, Handshake, LayoutGrid, ShieldCheck } from "lucide-react"
import { useCity } from "@/contexts/city-context"
import { useCart } from "@/contexts/cart-context"
import { CitySelector } from "@/components/city/city-selector"
import { CategoryMegaMenu } from "@/components/layout/category-mega-menu"
import { SearchBar } from "@/components/search/search-bar"
import { CART_DRAWER_EVENT } from "@/components/cart/cart-drawer"
import { MobileSearchOverlay, MOBILE_SEARCH_EVENT } from "@/components/search/mobile-search-overlay"
import { useRouter, usePathname } from "next/navigation"
import { useState, useEffect, useRef, useCallback } from "react"
import { useScrollDirection } from "@/hooks/use-scroll-direction"
import { useEscapeKey } from "@/hooks/use-escape-key"
import type { User as SupabaseUser, SupabaseClient } from "@supabase/supabase-js"

export function Header() {
  const { city } = useCity()
  const { itemCount } = useCart()
  const router = useRouter()
  const pathname = usePathname()
  // Lazy browser-only client: created via dynamic import after mount so
  // auth-js (78KB) no longer ships in the initial layout bundle. The
  // consumer degrades gracefully while `supabase` is null.
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null)
  const [showCitySelector, setShowCitySelector] = useState(false)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [showMobileSearch, setShowMobileSearch] = useState(false)
  const [showCategories, setShowCategories] = useState(false)
  const [user, setUser] = useState<SupabaseUser | null>(null)
  const [cashbackBalance, setCashbackBalance] = useState<number | null>(null)
  const [role, setRole] = useState<"admin" | "vendedor" | "cliente" | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // Auto-hide: el header se desliza fuera al bajar y reaparece al subir.
  // Con cualquier overlay/menú abierto se fuerza visible.
  const overlayOpen = showCitySelector || showUserMenu || showMobileSearch || showCategories
  const scrollDirection = useScrollDirection({ forceVisible: overlayOpen })
  const headerHidden = scrollDirection === "down" && !overlayOpen

  // Publica el estado para que --header-top-offset colapse (barras sticky
  // secundarias como la del panel suben al top cuando el header se oculta).
  useEffect(() => {
    document.body.classList.toggle("header-hidden", headerHidden)
    return () => document.body.classList.remove("header-hidden")
  }, [headerHidden])

  // Teclado: Escape cierra los menús flotantes (selector de ciudad y menú de
  // usuario) — patrón ARIA disclosure; antes solo se cerraban con clic fuera.
  useEscapeKey(useCallback(() => setShowUserMenu(false), []), showUserMenu)
  useEscapeKey(useCallback(() => setShowCitySelector(false), []), showCitySelector)

  // El mega-menú de categorías gestiona su propio estado; el header solo
  // necesita saber si está abierto para mantener la barra visible.
  const handleCategoriesOpenChange = useCallback((open: boolean) => setShowCategories(open), [])

  // Resolver el rol del usuario (server action) para navegación por sección
  useEffect(() => {
    let cancelled = false
    import("@/lib/roles-actions").then(({ getMyRole }) =>
      getMyRole().then((r) => {
        if (!cancelled) setRole(r)
      })
    )
    return () => {
      cancelled = true
    }
  }, [])

  // Dynamically load the Supabase client once the shell is interactive
  useEffect(() => {
    let cancelled = false
    import("@/lib/supabase/client").then(({ createClient }) => {
      if (!cancelled) setSupabase(createClient())
    })
    return () => {
      cancelled = true
    }
  }, [])

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
            .maybeSingle()
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

  // Abre el overlay de búsqueda móvil desde cualquier superficie que dispare
  // MOBILE_SEARCH_EVENT (MobileCartBar "Ver más productos", /catalogo, etc.)
  useEffect(() => {
    const openSearch = () => setShowMobileSearch(true)
    window.addEventListener(MOBILE_SEARCH_EVENT, openSearch)
    return () => window.removeEventListener(MOBILE_SEARCH_EVENT, openSearch)
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
      className="sticky top-0 z-50 glass-header print:hidden transition-transform duration-300 motion-reduce:transition-none"
      style={{
        paddingTop: "var(--header-inset-top)",
        transform: headerHidden ? "translateY(-100%)" : undefined,
      }}
    >
      <div className="max-w-7xl mx-auto px-3 sm:px-6">
        <div className="relative flex items-center justify-between h-16 gap-2 sm:gap-3">
          {/* Logo — Erewhon-style with refined type */}
          <Link
            href="/"
            aria-label="Resurte — ir al inicio"
            className="flex items-center gap-1.5 shrink-0 self-stretch px-2 -ml-2 select-none"
          >
            <span className="text-base min-[360px]:text-lg min-[400px]:text-[1.25rem] md:text-[1.35rem] font-bold text-[#0E7A0E] tracking-tight">Resurte</span>
            <span className="text-base min-[360px]:text-lg min-[400px]:text-[1.25rem] md:text-[1.35rem] font-bold text-[#1a1a1a] tracking-tight">.me</span>
          </Link>

          {/* Recompensas badge — shown when user has balance */}
          {cashbackBalance !== null && cashbackBalance > 0 && (
            <Link
              href="/recompensas"
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] bg-[#0E7A0E]/10 border border-[#0E7A0E]/20 hover:bg-[#0E7A0E]/15 transition-colors text-sm shrink-0"
              aria-label={`Tienes $${cashbackBalance.toLocaleString("es-MX")} en recompensas — ir a Recompensas`}
            >
              <Coins className="w-4 h-4 text-[#0E7A0E]" />
              <span className="font-semibold text-[#0E7A0E]">
                ${cashbackBalance.toLocaleString("es-MX")}
              </span>
              <span className="text-xs text-[#0E7A0E]/70 hidden lg:inline">recompensas</span>
            </Link>
          )}

          {/* City Selector Trigger */}
          <button
            onClick={() => setShowCitySelector(!showCitySelector)}
            aria-label="Seleccionar ciudad"
            aria-expanded={showCitySelector}
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] hover:bg-[#F7F5F0] transition-colors text-sm shrink-0 touch-target"
          >
            <MapPin className="w-4 h-4 text-[#0E7A0E]" aria-hidden="true" />
            <span
              className="font-medium text-[#343538]"
              suppressHydrationWarning
            >
              {city ? city.name : "Seleccionar ciudad"}
            </span>
            <ChevronDown className="w-4 h-4 text-[var(--text-secondary)]" aria-hidden="true" />
          </button>

          {/* Search Bar — hidden on mobile, shown on md+ */}
          {city && (
            <div className="hidden md:block flex-1 max-w-lg">
              <SearchBar citySlug={city.slug} compact />
            </div>
          )}

          {/* Right actions */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Desktop: acceso directo al catálogo por categoría (N11) */}
            {city && (
              <CategoryMegaMenu
                citySlug={city.slug}
                onOpenChange={handleCategoriesOpenChange}
              />
            )}

            {/* Mobile: acceso persistente a "todos los productos" de la tienda */}
            {city && (
              <Link
                href={`/${city.slug}/buscar`}
                aria-label="Ver todos los productos"
                aria-current={pathname === `/${city.slug}/buscar` ? "page" : undefined}
                className={`sm:hidden flex items-center gap-1 p-2 min-[360px]:pr-2.5 rounded-[10px] transition-colors touch-target ${
                  pathname === `/${city.slug}/buscar`
                    ? "bg-[#0E7A0E]/10 text-[#0E7A0E]"
                    : "hover:bg-[#F7F5F0] text-[#343538]"
                }`}
              >
                <LayoutGrid className="w-5 h-5" aria-hidden="true" />
                <span className="hidden min-[360px]:inline text-xs font-semibold">Todo</span>
              </Link>
            )}

            {/* Mobile search shortcut — opens live search overlay */}
            {city && (
              <button
                onClick={() => setShowMobileSearch(true)}
                aria-label="Buscar productos"
                aria-expanded={showMobileSearch}
                className="sm:hidden p-2 rounded-[10px] hover:bg-[#F7F5F0] transition-colors touch-target"
              >
                <Search className="w-5 h-5 text-[#343538]" aria-hidden="true" />
              </button>
            )}

            {/* Mobile city trigger */}
            <button
              onClick={() => setShowCitySelector(!showCitySelector)}
              aria-label="Seleccionar ciudad"
              aria-expanded={showCitySelector}
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
                <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-[#0E7A0E] text-white text-[10px] font-bold rounded-full flex items-center justify-center px-0.5" role="status">
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
                <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-[#0E7A0E] text-white text-[10px] font-bold rounded-full flex items-center justify-center px-0.5" role="status">
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
                  <User className="w-5 h-5 text-[#0E7A0E]" aria-hidden="true" />
                </button>

                {showUserMenu && (
                  <div role="menu" aria-label="Cuenta" className="absolute right-0 top-full mt-1 w-56 bg-white rounded-xl shadow-lg border border-gray-100 py-1.5 z-50">
                    <div className="px-4 py-2 border-b border-gray-100">
                      <p className="text-sm font-medium text-[#343538] truncate">
                        {user.user_metadata?.full_name || user.email}
                      </p>
                      <p className="text-xs text-[var(--text-secondary)] truncate">{user.email}</p>
                      {cashbackBalance !== null && cashbackBalance > 0 && (
                        <Link
                          href="/recompensas"
                          onClick={() => setShowUserMenu(false)}
                          className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-[#0E7A0E]"
                        >
                          <Coins className="w-3.5 h-3.5" aria-hidden="true" />
                          ${cashbackBalance.toLocaleString("es-MX")} en recompensas
                        </Link>
                      )}
                    </div>
                    <Link
                      role="menuitem"
                      href={city ? `/${city.slug}/mis-pedidos` : "/auth/login"}
                      onClick={() => setShowUserMenu(false)}
                      className="flex items-center gap-2 px-4 py-2.5 text-sm text-[#343538] hover:bg-[#F7F5F0] transition-colors"
                    >
                      <Package className="w-4 h-4" aria-hidden="true" />
                      Mis pedidos
                    </Link>
                    <Link
                      role="menuitem"
                      href={city ? `/${city.slug}/mis-direcciones` : "/auth/login"}
                      onClick={() => setShowUserMenu(false)}
                      className="flex items-center gap-2 px-4 py-2.5 text-sm text-[#343538] hover:bg-[#F7F5F0] transition-colors"
                    >
                      <MapPin className="w-4 h-4" aria-hidden="true" />
                      Mis direcciones
                    </Link>
                    {(role === "vendedor" || role === "admin") && (
                      <Link
                        role="menuitem"
                        href="/comercializacion"
                        onClick={() => setShowUserMenu(false)}
                        className="flex items-center gap-2 px-4 py-2.5 text-sm text-[#343538] hover:bg-[#F7F5F0] transition-colors"
                      >
                        <Handshake className="w-4 h-4" aria-hidden="true" />
                        Comercialización
                      </Link>
                    )}
                    {role === "admin" && (
                      <Link
                        role="menuitem"
                        href="/admin"
                        onClick={() => setShowUserMenu(false)}
                        className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-[#0E7A0E] hover:bg-[#F7F5F0] transition-colors"
                      >
                        <ShieldCheck className="w-4 h-4" aria-hidden="true" />
                        Panel admin
                      </Link>
                    )}
                    <button
                      role="menuitem"
                      onClick={handleSignOut}
                      className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <LogOut className="w-4 h-4" aria-hidden="true" />
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

      {/* Mobile live search overlay */}
      {showMobileSearch && city && (
        <MobileSearchOverlay
          citySlug={city.slug}
          onClose={() => setShowMobileSearch(false)}
        />
      )}
    </header>
  )
}
