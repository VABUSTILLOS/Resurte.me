"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { LayoutDashboard, Users, ShoppingCart, Bot } from "lucide-react"
import { ToastProvider } from "@/components/toast"
import { useState, useEffect } from "react"
import type { User } from "@supabase/supabase-js"

const NAV_ITEMS = [
  { href: "/comercializacion", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/comercializacion/prospectos", label: "Prospectos", icon: Users },
  { href: "/comercializacion/agente", label: "Agente IA", icon: Bot },
  { href: "/comercializacion/pedidos", label: "Pedidos", icon: ShoppingCart },
]

export function ComercializacionLayoutClient({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const [user, setUser] = useState<User | null>(null)

  useEffect(() => {
    let cancelled = false
    import("@/lib/supabase/client").then(({ createClient }) => {
      if (cancelled) return
      const supabase = createClient()
      if (!supabase) return
      supabase.auth.getUser().then(({ data }) => {
        if (!cancelled) setUser(data.user ?? null)
      })
    })
    return () => {
      cancelled = true
    }
  }, [])

  const displayName =
    user?.user_metadata?.full_name || user?.email?.split("@")[0] || "Vendedor"

  return (
    <div className="min-h-screen" style={{ backgroundColor: "var(--background)", color: "var(--foreground)" }}>
      {/* Top bar */}
      <div className="sticky top-[var(--header-top-offset)] z-40 bg-white/90 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-lg font-bold text-gray-900 truncate">
                Comercialización
              </span>
              <span className="hidden sm:inline text-xs bg-[#0E7A0E]/10 text-[#0E7A0E] px-2 py-0.5 rounded-full font-semibold">
                {displayName}
              </span>
            </div>

            {/* Desktop nav */}
            <nav className="hidden md:flex items-center gap-1">
              {NAV_ITEMS.map((item) => {
                const active = item.exact
                  ? pathname === item.href
                  : pathname.startsWith(item.href)
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium transition-colors ${
                      active
                        ? "bg-[#0E7A0E]/10 text-[#0E7A0E]"
                        : "text-gray-600 hover:bg-gray-100"
                    }`}
                  >
                    <item.icon className="w-4 h-4" />
                    {item.label}
                  </Link>
                )
              })}
            </nav>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 pb-24 md:pb-10">
        <ToastProvider>{children}</ToastProvider>
      </div>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-gray-100 pb-[env(safe-area-inset-bottom)] flex">
        {NAV_ITEMS.map((item) => {
          const active = item.exact
            ? pathname === item.href
            : pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex-1 flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium ${
                active ? "text-[#0E7A0E]" : "text-gray-500"
              }`}
            >
              <item.icon className="w-5 h-5" />
              {item.label}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
