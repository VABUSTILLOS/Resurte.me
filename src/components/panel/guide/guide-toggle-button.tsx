"use client"

import { HelpCircle } from "lucide-react"

interface GuideToggleButtonProps {
  onClick: () => void
  label?: string
}

/**
 * Botón flotante "Guía" para reabrir el panel de la guía en cualquier
 * momento. En móvil flota por encima del FAB de herramientas (que ocupa la
 * esquina inferior derecha); en desktop vuelve a la esquina.
 */
export default function GuideToggleButton({ onClick, label = "Guía" }: GuideToggleButtonProps) {
  return (
    <button
      onClick={onClick}
      className="fixed bottom-[calc(var(--inset-bottom)+4.5rem)] lg:bottom-5 right-4 z-[85] flex items-center gap-1.5 rounded-full bg-gray-900 text-white pl-2.5 pr-3 py-2 shadow-lg hover:bg-gray-700 transition-colors touch-target"
      aria-label={`Abrir guía paso a paso (${label})`}
      title="Ver guía paso a paso"
    >
      <HelpCircle className="w-4 h-4" />
      <span className="text-xs font-semibold">{label}</span>
    </button>
  )
}
