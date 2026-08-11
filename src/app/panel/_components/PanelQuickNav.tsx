"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { LayoutGrid, Receipt, Calculator, Trash2, UtensilsCrossed } from "lucide-react"

const NAV_ITEMS = [
  { href: "/panel", label: "Inicio", icon: LayoutGrid, exact: true },
  { href: "/panel/ventas", label: "Ventas", icon: Receipt, exact: false },
  { href: "/panel/costeo", label: "Costeo", icon: Calculator, exact: false },
  { href: "/panel/mermas", label: "Mermas", icon: Trash2, exact: false },
  { href: "/panel/foodos/menu", label: "Menú digital", icon: UtensilsCrossed, exact: false },
]

export function PanelQuickNav() {
  const pathname = usePathname()

  return (
    <nav
      aria-label="Accesos rápidos del panel"
      className="fixed bottom-0 inset-x-0 lg:hidden z-40 bg-white border-t border-gray-100 pb-[var(--inset-bottom)]"
    >
      <div className="flex">
        {NAV_ITEMS.map((item) => {
          const active = item.exact ? pathname === item.href : pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`flex-1 flex flex-col items-center gap-1 pt-2.5 pb-1.5 touch-target ${
                active ? "text-[#0E7A0E]" : "text-gray-400 active:text-gray-600"
              }`}
            >
              <item.icon className="w-5 h-5" />
              <span className="text-[10px] font-medium leading-none">{item.label}</span>
              <span
                className={`w-1 h-1 rounded-full ${active ? "bg-[#0E7A0E]" : "bg-transparent"}`}
                aria-hidden="true"
              />
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
