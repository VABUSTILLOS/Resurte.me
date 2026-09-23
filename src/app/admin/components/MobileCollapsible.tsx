"use client"

import type { ReactNode } from "react"
import { ChevronDown, ChevronUp, SlidersHorizontal } from "lucide-react"

/**
 * Envuelve un bloque para que en móvil se pueda plegar y en escritorio se
 * muestre siempre. Un solo árbol de render (el mismo nodo se oculta con
 * `hidden`), así que no hay desajuste de hidratación.
 *
 * Vivía dentro de `page.tsx` y se movió aquí cuando el apartado "Proveedores"
 * pasó a usarlo desde su propio archivo: tres bloques del panel (filtros,
 * salud del catálogo y proveedores) comparten el mismo comportamiento, así que
 * la pieza tiene que estar fuera del archivo de 6 700 líneas.
 */
export function MobileCollapsible({
  id,
  label,
  badge,
  icon,
  open,
  onToggle,
  children,
}: {
  id: string
  label: string
  badge?: number
  icon?: ReactNode
  open: boolean
  onToggle: () => void
  children: ReactNode
}) {
  return (
    <div className="mb-3 sm:mb-4">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={id}
        className="touch-target mb-1.5 flex w-full items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 sm:hidden"
      >
        {icon ?? <SlidersHorizontal className="w-4 h-4 text-gray-600" />}
        <span className="flex-1 text-left">
          {label}
          {badge !== undefined && badge > 0 && (
            <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">
              {badge}
            </span>
          )}
        </span>
        {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>
      <div id={id} className={open ? "block" : "hidden sm:block"}>
        {children}
      </div>
    </div>
  )
}
