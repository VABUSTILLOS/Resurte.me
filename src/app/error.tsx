"use client"

import { useEffect } from "react"
import Link from "next/link"
import { logger } from "@/lib/logger"

/**
 * Error boundary raíz: sin él, cualquier excepción en una página pública
 * mostraba la pantalla genérica de Next.js (sin branding ni salida). Ofrece
 * reintentar (reset) y rutas de escape.
 */
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    logger.error("Error no controlado en la app", error)
  }, [error])

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center px-4 text-center">
      <p className="text-5xl mb-4" aria-hidden="true">😵‍💫</p>
      <h1 className="text-xl font-bold text-gray-900 mb-2">
        Algo salió mal
      </h1>
      <p className="text-gray-500 text-sm mb-8 max-w-md">
        Ocurrió un error inesperado. Puedes intentarlo de nuevo; si el problema
        persiste, escríbenos por WhatsApp y lo revisamos.
      </p>
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center gap-2 px-6 py-3 bg-brand-600 text-white font-semibold rounded-full hover:bg-brand-700 transition-colors"
        >
          Intentar de nuevo
        </button>
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-6 py-3 bg-gray-100 text-gray-700 font-semibold rounded-full hover:bg-gray-200 transition-colors"
        >
          Ir al inicio
        </Link>
      </div>
    </div>
  )
}
