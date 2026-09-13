"use client"

import { useEffect } from "react"
import { Printer } from "lucide-react"

/** Botón de impresión: dispara window.print() (y auto-print al cargar). */
export function PrintButton() {
  useEffect(() => {
    const timer = setTimeout(() => window.print(), 400)
    return () => clearTimeout(timer)
  }, [])

  return (
    <button
      onClick={() => window.print()}
      className="no-print flex items-center gap-2 px-4 py-2 rounded-xl bg-stone-900 text-white text-sm font-bold"
    >
      <Printer className="w-4 h-4" /> Imprimir
    </button>
  )
}
