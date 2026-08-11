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
    <div className="sticky top-0 z-40 bg-emerald-600 text-white px-4 py-2.5">
      <div className="max-w-7xl mx-auto flex items-center gap-3">
        <span className="text-base" aria-hidden>🧪</span>
        <p className="flex-1 text-xs sm:text-[13px] font-medium leading-snug">{DEMO_BANNER_TEXT}</p>
        <button
          onClick={onExit}
          className="flex items-center gap-1.5 shrink-0 text-xs font-bold bg-white/20 hover:bg-white/30 rounded-lg px-3 py-1.5 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
          Salir del modo demo
        </button>
      </div>
    </div>
  )
}
