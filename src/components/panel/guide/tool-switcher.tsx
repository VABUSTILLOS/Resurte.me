"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { PANEL_NAV } from "./tool-demo"

/**
 * Barra de navegación del panel: permite saltar entre herramientas.
 * Se muestra persistente en todas las páginas del panel y también dentro
 * del overlay del modo demo. La herramienta actual se resalta.
 * Scrolleable en mobile.
 */
export default function ToolSwitcher() {
  const pathname = usePathname()

  return (
    <nav
      className="bg-white/95 backdrop-blur"
      aria-label="Navegar entre herramientas"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2 overflow-x-auto">
        <div className="flex items-center gap-1.5 min-w-max">
          {PANEL_NAV.map((item, idx) => {
            const active = pathname === item.pathname
            // Separador visual al cambiar de familia (operación → costos →
            // planeación → sistema): misma agrupación que el hub de /panel.
            const prev = idx > 0 ? PANEL_NAV[idx - 1] : undefined
            const showDivider = item.area !== undefined && item.area !== prev?.area
            return (
              <span key={item.pathname} className="flex items-center gap-1.5">
                {showDivider && (
                  <span
                    aria-hidden="true"
                    className="mx-1 h-4 w-px bg-gray-200 shrink-0"
                  />
                )}
                <Link
                  href={item.pathname}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors ${
                    active
                      ? "bg-emerald-600 text-white shadow-sm"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  <span aria-hidden>{item.icon}</span>
                  {item.label}
                </Link>
              </span>
            )
          })}
        </div>
      </div>
    </nav>
  )
}
