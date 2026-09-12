"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { ShieldCheck } from "lucide-react"

const ADMIN_NAV = [
  { href: "/admin", label: "Dashboard", exact: true },
  { href: "/admin/conversion", label: "Conversión", exact: false },
  { href: "/admin/marketing", label: "Marketing", exact: false },
  { href: "/admin/pedidos", label: "Pedidos", exact: false },
  { href: "/admin/repartidores", label: "Repartidores", exact: false },
  { href: "/admin/productos", label: "Productos", exact: false },
  { href: "/admin/usuarios", label: "Usuarios", exact: false },
  { href: "/admin/facturas", label: "Facturas", exact: false },
  { href: "/admin/recompensas", label: "Recompensas", exact: false },
  { href: "/admin/emails", label: "Emails", exact: false },
  { href: "/admin/visibilidad", label: "Visibilidad", exact: false },
  { href: "/admin/disponibilidad", label: "Por ciudad", exact: false },
  { href: "/admin/proveedores", label: "Proveedores", exact: false },
  { href: "/admin/whatsapp", label: "WhatsApp", exact: false },
  { href: "/admin/workflows", label: "Workflows", exact: false },
]

/**
 * Subnavegación persistente del área /admin para que el administrador
 * siempre sepa que está en el área interna y pueda saltar entre secciones.
 */
export function AdminSubNav() {
  const pathname = usePathname()
  const isActive = (href: string, exact: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`)

  return (
    <div className="sticky top-[var(--header-top-offset)] z-40 bg-white/90 backdrop-blur-md border-b border-gray-200 print:hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2 flex items-center gap-3 overflow-x-auto">
        <span className="inline-flex items-center gap-1.5 shrink-0 rounded-full bg-gray-900 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-white">
          <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
          Administración
        </span>
        <nav aria-label="Secciones de administración" className="flex items-center gap-1.5 min-w-max">
          {ADMIN_NAV.map((item) => {
            const active = isActive(item.href, item.exact)
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors ${
                  active
                    ? "bg-gray-900 text-white shadow-sm"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>
      </div>
    </div>
  )
}
