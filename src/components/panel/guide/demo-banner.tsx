"use client"

import { X } from "lucide-react"
import { DEMO_BANNER_TEXT } from "./tool-demo"

interface DemoBannerProps {
  onExit: () => void
}

/**
 * Banner fijo superior que aparece cuando el modo demo está activo.
 * Aclara que los datos son de ejemplo y permite salir del modo demo.
 */
export default function DemoBanner({ onExit }: DemoBannerProps) {
  return (
    <div className="sticky top-0 z-40 bg-emerald-600 text-white px-4 py-1.5">
      <div className="max-w-7xl mx-auto flex items-center gap-2">
        <span className="text-sm leading-none" aria-hidden>🧪</span>
        <p className="flex-1 text-[11px] sm:text-xs font-medium leading-tight truncate">{DEMO_BANNER_TEXT}</p>
        <button
          onClick={onExit}
          className="flex items-center gap-1 shrink-0 text-[11px] font-bold bg-white/20 hover:bg-white/30 rounded-md px-2 py-1 transition-colors"
        >
          <X className="w-3 h-3" />
          <span className="hidden sm:inline">Salir del modo demo</span>
          <span className="sm:hidden">Salir</span>
        </button>
      </div>
    </div>
  )
}
