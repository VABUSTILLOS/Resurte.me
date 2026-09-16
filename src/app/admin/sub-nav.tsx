"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { ShieldCheck } from "lucide-react"
import { PendingOrdersBadge } from "./components/PendingOrdersBadge"
import { AdminNotificationCenter } from "./components/AdminNotificationCenter"

/**
 * Navegación del área /admin agrupada por dominio. Antes eran 20 píldoras
 * sueltas en una sola fila sin jerarquía, incluyendo entradas duplicadas
 * (visibilidad / por ciudad) y bitácoras dispersas. Ahora cada sección vive en
 * el grupo del dominio al que pertenece.
 */
const ADMIN_NAV_GROUPS = [
  {
    label: "Operación",
    items: [
      { href: "/admin", label: "Dashboard", exact: true },
      { href: "/admin/pedidos", label: "Pedidos", exact: false },
      { href: "/admin/repartidores", label: "Repartidores", exact: false },
      { href: "/admin/comisiones", label: "Comisiones", exact: false },
    ],
  },
  {
    label: "Catálogo",
    items: [
      { href: "/admin/productos", label: "Productos", exact: false },
      { href: "/admin/proveedores", label: "Proveedores", exact: false },
    ],
  },
  {
    label: "Crecimiento",
    items: [
      { href: "/admin/marketing", label: "Marketing", exact: false },
      { href: "/admin/leads", label: "Leads", exact: false },
      { href: "/admin/whatsapp", label: "WhatsApp", exact: true },
      { href: "/admin/whatsapp/automations", label: "Automatizaciones", exact: false },
      { href: "/admin/seo-ia", label: "SEO IA", exact: false },
    ],
  },
  {
    label: "Clientes",
    items: [
      { href: "/admin/usuarios", label: "Usuarios", exact: false },
      { href: "/admin/recompensas", label: "Recompensas", exact: false },
    ],
  },
  {
    label: "Sistema",
    items: [
      { href: "/admin/conversion", label: "Conversión", exact: false },
      { href: "/admin/bitacoras", label: "Bitácoras", exact: false },
    ],
  },
]

/**
 * Subnavegación persistente del área /admin para que el administrador
 * siempre sepa que está en el área interna y pueda saltar entre secciones.
 *
 * En móvil la fila hace scroll horizontal; los separadores de grupo son
 * decorativos (`aria-hidden`) para no inflar el árbol de accesibilidad.
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
          {ADMIN_NAV_GROUPS.map((group, groupIndex) => (
            <div key={group.label} className="flex items-center gap-1.5">
              {groupIndex > 0 && (
                <span aria-hidden="true" className="mx-0.5 h-5 w-px bg-gray-200 shrink-0" />
              )}
              {group.items.map((item) => {
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
                    {/* Fase 3 — badge de pedidos pendientes (polling 30 s) */}
                    {item.href === "/admin/pedidos" && <PendingOrdersBadge />}
                  </Link>
                )
              })}
            </div>
          ))}
        </nav>
        {/* Fase 10 — centro de notificaciones (pedidos nuevos en vivo) */}
        <div className="ml-auto">
          <AdminNotificationCenter />
        </div>
      </div>
    </div>
  )
}
