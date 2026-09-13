"use client"

import { LayoutGrid } from "lucide-react"
import { useScrollDirection } from "@/hooks/use-scroll-direction"

interface PanelFabProps {
  onOpen: () => void
  /** Mientras el sheet está abierto el FAB se mantiene visible (y estable). */
  sheetOpen: boolean
}

/**
 * FAB "Herramientas" — reemplaza en móvil al bottom nav fijo del panel.
 * Flota abajo a la derecha respetando safe-area, se oculta al bajar y
 * reaparece al subir (auto-hide), y abre el bottom sheet de navegación.
 * Solo visible bajo `lg` (desktop conserva el ToolSwitcher sticky).
 */
export function PanelFab({ onOpen, sheetOpen }: PanelFabProps) {
  const direction = useScrollDirection({ forceVisible: sheetOpen })
  const hidden = direction === "down" && !sheetOpen

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="Abrir menú de herramientas"
      aria-haspopup="dialog"
      aria-expanded={sheetOpen}
      className={`fixed right-4 z-40 lg:hidden flex items-center gap-2 rounded-full bg-[#0E7A0E] text-white pl-4 pr-5 py-3.5 shadow-lg shadow-emerald-900/20 hover:bg-[#0A5F0A] active:scale-95 transition-all duration-300 motion-reduce:transition-none ${
        hidden ? "translate-y-24 opacity-0 pointer-events-none" : "translate-y-0 opacity-100"
      }`}
      style={{ bottom: "calc(var(--inset-bottom) + 1rem)" }}
    >
      <LayoutGrid className="w-5 h-5" aria-hidden="true" />
      <span className="text-sm font-semibold">Herramientas</span>
    </button>
  )
}
