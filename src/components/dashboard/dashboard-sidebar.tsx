"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { useCity } from "@/contexts/city-context"
import { useCart } from "@/contexts/cart-context"
import { useRouter } from "next/navigation"
import {
  Package,
  Coins,
  ChevronRight,
  LogOut,
  ShoppingBag,
  Gift,
  ChevronDown,
  Zap,
  PanelLeftClose,
  PanelLeft,
  LayoutDashboard,
} from "lucide-react"
import Link from "next/link"
import type { User as SupabaseUser } from "@supabase/supabase-js"

interface OrderSummary {
  id: number
  total: number
  status: string
  itemCount: number
  created_at: string
}

const STATUS_LABEL: Record<string, string> = {
  pending: "Pendiente",
  confirmed: "Confirmado",
  preparing: "Preparando",
  out_for_delivery: "En camino",
  delivered: "Entregado",
  cancelled: "Cancelado",
}

const STATUS_COLOR: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  confirmed: "bg-blue-50 text-blue-700 border-blue-200",
  preparing: "bg-purple-50 text-purple-700 border-purple-200",
  out_for_delivery: "bg-orange-50 text-orange-700 border-orange-200",
  delivered: "bg-green-50 text-green-700 border-green-200",
  cancelled: "bg-red-50 text-red-700 border-red-200",
}

function generateMockOrders(count: number): OrderSummary[] {
  const statuses = ["pending", "confirmed", "preparing", "out_for_delivery", "delivered"]
  return Array.from({ length: count }, (_, i) => {
    const daysAgo = i * 3 + 1
    const d = new Date()
    d.setDate(d.getDate() - daysAgo)
    return {
      id: count - i,
      total: Math.round((250 + Math.random() * 1800) * 100) / 100,
      status: statuses[i % statuses.length],
      itemCount: 2 + Math.floor(Math.random() * 6),
      created_at: d.toISOString(),
    }
  })
}

export function DashboardSidebar() {
  const { city } = useCity()
  const { itemCount } = useCart()
  const router = useRouter()
  // Lazy browser-only client: creating it during SSR would throw when
  // NEXT_PUBLIC_SUPABASE_URL is a placeholder/unset.
  const [supabase] = useState(() => (typeof window === "undefined" ? null : createClient()))
  const [user, setUser] = useState<SupabaseUser | null>(null)
  const [orders] = useState<OrderSummary[]>(() => generateMockOrders(5))
  const [cashback] = useState(0)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false
    return localStorage.getItem("sidebar-collapsed") === "true"
  })

  function toggleCollapsed() {
    const next = !collapsed
    setCollapsed(next)
    localStorage.setItem("sidebar-collapsed", String(next))
  }

  // Match WhatsApp button vertical position: higher when MobileCartBar is visible
  const hasCartItems = itemCount > 0
  const pillBottom = hasCartItems ? "bottom-[80px]" : "bottom-[20px]"

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getUser().then(({ data }) => setUser(data.user ?? null))
  }, [supabase])

  async function handleSignOut() {
    if (!supabase) return
    await supabase.auth.signOut()
    setUser(null)
    router.refresh()
    router.push("/")
  }

  if (!user) return null

  const displayName = user.user_metadata?.full_name || user.email?.split("@")[0] || "Usuario"
  const initial = displayName.charAt(0).toUpperCase()

  return (
    <>
      {/* Desktop sidebar — collapsed */}
      {collapsed ? (
        <aside className="hidden lg:flex w-[56px] bg-white border-r border-gray-100 flex-col shrink-0 min-h-[calc(100vh-64px)] sticky top-16 items-center gap-2 py-3">
          {/* Toggle expand */}
          <button
            onClick={toggleCollapsed}
            className="w-9 h-9 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors shrink-0"
            aria-label="Expandir panel"
          >
            <PanelLeft className="w-4 h-4" />
          </button>

          {/* Avatar */}
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#108910] to-[#16a34a] flex items-center justify-center text-white font-bold text-xs shrink-0">
            {initial}
          </div>

          {/* Nav icons */}
          <Link
            href={city ? `/${city.slug}` : "/"}
            className="w-9 h-9 rounded-lg flex items-center justify-center bg-[#F0FDF4] text-[#108910] hover:bg-[#dcfce7] transition-colors shrink-0"
            title="Catálogo"
          >
            <ShoppingBag className="w-4 h-4" />
          </Link>
          <Link
            href={city ? `/${city.slug}/mis-pedidos` : "/auth/login"}
            className="w-9 h-9 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors shrink-0"
            title="Mis pedidos"
          >
            <Package className="w-4 h-4" />
          </Link>
          <Link
            href="/panel"
            className="w-9 h-9 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors shrink-0"
            title="Herramientas"
          >
            <LayoutDashboard className="w-4 h-4" />
          </Link>
          <Link
            href="/recompensas"
            className="w-9 h-9 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors shrink-0"
            title="Recompensas"
          >
            <Gift className="w-4 h-4" />
          </Link>

          <div className="flex-1" />

          {/* Sign out */}
          <button
            onClick={handleSignOut}
            className="w-9 h-9 rounded-lg flex items-center justify-center text-red-400 hover:bg-red-50 hover:text-red-500 transition-colors shrink-0"
            title="Cerrar sesión"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </aside>
      ) : (
        /* Desktop sidebar — expanded */
        <aside className="hidden lg:flex w-[272px] bg-white border-r border-gray-100 flex-col shrink-0 min-h-[calc(100vh-64px)] sticky top-16">
          {/* Collapse toggle */}
          <div className="flex justify-end p-2">
            <button
              onClick={toggleCollapsed}
              className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors"
              aria-label="Ocultar panel"
            >
              <PanelLeftClose className="w-4 h-4" />
            </button>
          </div>

          {/* User card */}
          <div className="px-4 pb-4 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-full bg-gradient-to-br from-[#108910] to-[#16a34a] flex items-center justify-center text-white font-bold text-base shrink-0 shadow-sm">
                {initial}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{displayName}</p>
                <p className="text-xs text-gray-400 truncate">{user.email}</p>
              </div>
            </div>
            <div className="flex gap-2.5 mt-3">
              <div className="flex-1 bg-[#F0FDF4] rounded-xl px-3 py-2.5 flex flex-col justify-between min-h-[68px]">
                <div className="flex items-center gap-1.5 text-xs text-[#108910]">
                  <ShoppingBag className="w-3.5 h-3.5 shrink-0" />
                  <span className="font-medium leading-tight">Pedidos</span>
                </div>
                <p className="text-xl font-bold text-gray-900">{orders.length}</p>
              </div>
              <div className="flex-1 bg-amber-50 rounded-xl px-3 py-2.5 flex flex-col justify-between min-h-[68px]">
                <div className="flex items-start gap-1.5 text-xs text-amber-700">
                  <Coins className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span className="font-medium leading-tight">Puntos de Recompensa</span>
                </div>
                <p className="text-xl font-bold text-gray-900">${cashback}</p>
              </div>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
            <Link
              href={city ? `/${city.slug}` : "/"}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-[#F0FDF4] text-[#108910] text-sm font-semibold transition-colors"
            >
              <ShoppingBag className="w-4 h-4 shrink-0" />
              Catálogo
            </Link>
            <Link
              href={city ? `/${city.slug}/mis-pedidos` : "/auth/login"}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-gray-600 hover:bg-gray-50 text-sm font-medium transition-colors"
            >
              <Package className="w-4 h-4 shrink-0" />
              Mis pedidos
            </Link>
            <Link
              href="/panel"
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-gray-600 hover:bg-gray-50 text-sm font-medium transition-colors"
            >
              <LayoutDashboard className="w-4 h-4 shrink-0" />
              Herramientas
              <span className="text-[10px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full font-bold ml-auto">
                Nuevo
              </span>
            </Link>
            <Link
              href="/recompensas"
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-gray-600 hover:bg-gray-50 text-sm font-medium transition-colors"
            >
              <Gift className="w-4 h-4 shrink-0" />
              Recompensas
              <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-bold ml-auto">
                Nuevo
              </span>
            </Link>
          </nav>

          {/* Recent orders */}
          {orders.length > 0 && (
            <div className="border-t border-gray-100 p-3">
              <div className="flex items-center justify-between mb-2.5 px-1">
                <h3 className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                  Pedidos recientes
                </h3>
                <Link
                  href={city ? `/${city.slug}/mis-pedidos` : "#"}
                  className="text-[11px] text-[#108910] font-semibold hover:underline"
                >
                  Ver todo
                </Link>
              </div>
              <div className="space-y-1">
                {orders.slice(0, 3).map((order) => (
                  <Link
                    key={order.id}
                    href={city ? `/${city.slug}/mis-pedidos/${order.id}` : "#"}
                    className="flex items-center justify-between px-2.5 py-2 rounded-lg hover:bg-gray-50 transition-colors group"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-gray-700">
                        #{order.id} · {order.itemCount} items
                      </p>
                      <p className="text-[10px] text-gray-400">
                        {new Date(order.created_at).toLocaleDateString("es-MX", { day: "numeric", month: "short" })}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-xs font-bold text-gray-900">
                        ${order.total.toFixed(0)}
                      </span>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium border ${STATUS_COLOR[order.status]}`}
                      >
                        {STATUS_LABEL[order.status]}
                      </span>
                      <ChevronRight className="w-3 h-3 text-gray-300 group-hover:text-gray-500" />
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Sign out */}
          <div className="border-t border-gray-100 p-3">
            <button
              onClick={handleSignOut}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-red-500 hover:bg-red-50 text-sm font-medium transition-colors w-full"
            >
              <LogOut className="w-4 h-4 shrink-0" />
              Cerrar sesión
            </button>
          </div>
        </aside>
      )}

      {/* Mobile: Floating user pill + bottom sheet */}
      {!collapsed ? (
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className={`lg:hidden fixed ${pillBottom} left-3 z-[60] flex items-center gap-2.5 bg-white text-gray-900 pl-1.5 pr-4 py-1.5 rounded-full shadow-[0_4px_24px_rgba(0,0,0,0.15)] ring-1 ring-gray-200 hover:shadow-[0_6px_28px_rgba(0,0,0,0.2)] active:scale-[0.97] transition-all`}
          aria-label={mobileOpen ? "Cerrar mi cuenta" : "Abrir mi cuenta"}
          style={{ touchAction: "manipulation" }}
        >
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#108910] to-[#16a34a] flex items-center justify-center text-white font-bold text-sm shadow-sm shrink-0">
            {initial}
          </div>
          <div className="text-left min-w-0 leading-tight">
            <p className="text-xs font-semibold text-gray-900 truncate max-w-[100px]">
              {displayName.split(" ")[0]}
            </p>
            <p className="text-[11px] text-gray-400">
              {mobileOpen ? "Cerrar" : "Mi cuenta"}
            </p>
          </div>
          <span className="w-1.5 h-1.5 rounded-full bg-[#108910] shrink-0" />
        </button>
      ) : (
        /* Collapsed — just the avatar, tap to expand */
        <button
          onClick={toggleCollapsed}
          className={`lg:hidden fixed ${pillBottom} left-3 z-[60] w-11 h-11 rounded-full bg-white shadow-[0_4px_24px_rgba(0,0,0,0.15)] ring-1 ring-gray-200 flex items-center justify-center hover:shadow-[0_6px_28px_rgba(0,0,0,0.2)] active:scale-95 transition-all`}
          aria-label="Mostrar panel"
          style={{ touchAction: "manipulation" }}
        >
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#108910] to-[#16a34a] flex items-center justify-center text-white font-bold text-xs">
            {initial}
          </div>
        </button>
      )}

      {mobileOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-[65]"
            onClick={() => setMobileOpen(false)}
          />
          <div className="fixed inset-x-0 bottom-0 z-[70] bg-white rounded-t-2xl shadow-2xl max-h-[80vh] overflow-y-auto animate-slide-up">
            <div className="sticky top-0 bg-white rounded-t-2xl border-b border-gray-100 p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#108910] to-[#16a34a] flex items-center justify-center text-white font-bold text-sm">
                  {initial}
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">{displayName}</p>
                  <p className="text-xs text-gray-400">{user.email}</p>
                </div>
              </div>
              <button onClick={() => setMobileOpen(false)} className="p-2 rounded-lg hover:bg-gray-100">
                <ChevronDown className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            <div className="p-4 space-y-3">
              <div className="flex gap-3">
                <div className="flex-1 bg-[#F0FDF4] rounded-xl p-3 flex flex-col justify-between min-h-[68px]">
                  <div className="flex items-center gap-1.5 text-xs text-[#108910]">
                    <ShoppingBag className="w-3.5 h-3.5 shrink-0" />
                    <span className="font-medium leading-tight">Pedidos</span>
                  </div>
                  <p className="text-xl font-bold text-gray-900">{orders.length}</p>
                </div>
                <div className="flex-1 bg-amber-50 rounded-xl p-3 flex flex-col justify-between min-h-[68px]">
                  <div className="flex items-start gap-1.5 text-xs text-amber-700">
                    <Coins className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span className="font-medium leading-tight">Puntos de Recompensa</span>
                  </div>
                  <p className="text-xl font-bold text-gray-900">${cashback}</p>
                </div>
              </div>

              <Link
                href={city ? `/${city.slug}` : "/"}
                onClick={() => setMobileOpen(false)}
                className="flex items-center gap-3 p-3.5 rounded-xl bg-[#F0FDF4] text-[#108910] font-semibold"
              >
                <ShoppingBag className="w-5 h-5" />
                Catálogo de productos
                <ChevronRight className="w-4 h-4 ml-auto" />
              </Link>
              <Link
                href={city ? `/${city.slug}/mis-pedidos` : "/auth/login"}
                onClick={() => setMobileOpen(false)}
                className="flex items-center gap-3 p-3.5 rounded-xl bg-gray-50 text-gray-700 font-semibold"
              >
                <Package className="w-5 h-5" />
                Mis pedidos
                <ChevronRight className="w-4 h-4 ml-auto" />
              </Link>
              <Link
                href="/panel"
                onClick={() => setMobileOpen(false)}
                className="flex items-center gap-3 p-3.5 rounded-xl bg-indigo-50 text-indigo-800 font-semibold"
              >
                <LayoutDashboard className="w-5 h-5" />
                Herramientas para tu negocio
                <span className="text-xs bg-indigo-200 text-indigo-800 px-2 py-0.5 rounded-full font-bold ml-auto">
                  Nuevo
                </span>
              </Link>
              <Link
                href="/recompensas"
                onClick={() => setMobileOpen(false)}
                className="flex items-center gap-3 p-3.5 rounded-xl bg-amber-50 text-amber-800 font-semibold"
              >
                <Zap className="w-5 h-5" />
                Resurte Rewards
                <span className="text-xs bg-amber-200 text-amber-800 px-2 py-0.5 rounded-full font-bold ml-auto">
                  Nuevo
                </span>
              </Link>
              <Link
                href="/recompensas"
                onClick={() => setMobileOpen(false)}
                className="flex items-center gap-3 p-3.5 rounded-xl bg-gray-50 text-gray-700 font-semibold"
              >
                <Gift className="w-5 h-5" />
                Programa de recompensas
                <ChevronRight className="w-4 h-4 ml-auto" />
              </Link>

              {orders.length > 0 && (
                <div>
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 px-1">
                    Pedidos recientes
                  </h3>
                  <div className="space-y-1">
                    {orders.slice(0, 3).map((order) => (
                      <Link
                        key={order.id}
                        href={city ? `/${city.slug}/mis-pedidos/${order.id}` : "#"}
                        onClick={() => setMobileOpen(false)}
                        className="flex items-center justify-between p-3 rounded-xl hover:bg-gray-50"
                      >
                        <div>
                          <p className="text-sm font-medium text-gray-900">Pedido #{order.id}</p>
                          <p className="text-xs text-gray-400">{order.itemCount} productos</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold text-gray-900">${order.total.toFixed(0)}</p>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium border ${STATUS_COLOR[order.status]}`}>
                            {STATUS_LABEL[order.status]}
                          </span>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              <button
                onClick={() => { setMobileOpen(false); handleSignOut() }}
                className="flex items-center gap-3 p-3.5 rounded-xl text-red-500 font-semibold w-full hover:bg-red-50"
              >
                <LogOut className="w-5 h-5" />
                Cerrar sesión
              </button>
            </div>
          </div>
        </>
      )}
    </>
  )
}
