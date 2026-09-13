"use client"

import { useEffect } from "react"
import { logger } from "@/lib/logger"

/**
 * Error boundary del área /admin: un fallo en una sección (pedidos, métricas,
 * WhatsApp) no debe dejar al operador sin navegación ni salida.
 */
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    logger.error("Error en /admin", error)
  }, [error])

  return (
    <div className="flex flex-col items-center justify-center py-24 text-center px-4">
      <p className="text-4xl mb-4" aria-hidden="true">🛠️</p>
      <h1 className="text-lg font-bold text-gray-900 mb-2">
        Esta sección tuvo un problema
      </h1>
      <p className="text-sm text-gray-500 mb-6 max-w-sm">
        El resto del panel de administración sigue disponible en el menú superior.
      </p>
      <button
        type="button"
        onClick={reset}
        className="inline-flex items-center gap-2 px-5 py-2.5 bg-gray-900 text-white text-sm font-semibold rounded-lg hover:bg-gray-700 transition-colors"
      >
        Reintentar
      </button>
    </div>
  )
}
