"use client"

import { useEffect } from "react"
import { logger } from "@/lib/logger"

export default function StorefrontError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  useEffect(() => {
    logger.error("storefront.error_boundary", error, { digest: error.digest })
  }, [error])

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 text-center px-4 bg-white">
      <div className="text-5xl">🍽️</div>
      <h2 className="text-xl font-bold text-gray-900">
        No pudimos cargar este restaurante
      </h2>
      <p className="text-sm text-gray-500 max-w-md">
        Ocurrió un error al cargar el menú. Intenta de nuevo en un momento o
        vuelve a la página anterior.
      </p>
      <button
        onClick={unstable_retry}
        className="mt-2 px-5 py-2.5 rounded-xl bg-[#0E7A0E] text-white text-sm font-semibold hover:bg-[#0d6f0d] transition-colors"
      >
        Reintentar
      </button>
    </div>
  )
}
