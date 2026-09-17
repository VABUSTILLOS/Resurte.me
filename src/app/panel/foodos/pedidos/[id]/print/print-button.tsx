"use client"

import { useEffect } from "react"
import { Printer } from "lucide-react"

/**
 * Botón de impresión. Dispara `window.print()` y, con `auto`, abre el diálogo
 * solo al cargar la página (`?auto=1`).
 */
export function PrintButton({ auto = true }: { auto?: boolean }) {
  useEffect(() => {
    if (!auto) return
    const timer = setTimeout(() => window.print(), 400)
    return () => clearTimeout(timer)
  }, [auto])

  return (
    <button
      onClick={() => window.print()}
      className="no-print flex items-center gap-2 px-4 py-2 rounded-xl bg-stone-900 text-white text-sm font-bold"
    >
      <Printer className="w-4 h-4" /> Imprimir
    </button>
  )
}
