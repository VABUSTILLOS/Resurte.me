"use client"

import { useEffect } from "react"
import { logger } from "@/lib/logger"

/**
 * Error boundary de /recompensas: la app de recompensas corre casi toda en
 * cliente (wallet, canje, scanner); un fallo no debe tumbar la navegación
 * del sitio. Ofrece reintentar sin perder el contexto.
 */
export default function RecompensasError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    logger.error("Error en /recompensas", error)
  }, [error])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <p className="text-5xl mb-4" aria-hidden="true">💳</p>
      <h1 className="text-xl font-bold text-warm-900 mb-2">
        No pudimos cargar tus recompensas
      </h1>
      <p className="text-sm text-[var(--text-secondary)] mb-8 max-w-sm">
        Tu saldo está seguro. Revisa tu conexión e inténtalo de nuevo.
      </p>
      <button
        type="button"
        onClick={reset}
        className="inline-flex items-center gap-2 px-6 py-3 bg-brand-600 text-white font-semibold rounded-full hover:bg-brand-700 transition-colors"
      >
        Reintentar
      </button>
    </div>
  )
}
