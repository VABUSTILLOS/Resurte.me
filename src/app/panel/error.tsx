"use client"

import { useEffect } from "react"
import { logger } from "@/lib/logger"

export default function PanelError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  useEffect(() => {
    logger.error("panel.error_boundary", error, { digest: error.digest })
  }, [error])

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 text-center px-4">
      <div className="text-5xl">⚠️</div>
      <h2 className="text-xl font-bold text-gray-900">
        Ocurrió un error al cargar esta herramienta
      </h2>
      <p className="text-sm text-gray-500 max-w-md">
        No se pudo cargar el contenido. Intenta de nuevo; si el problema persiste,
        revisa tu conexión o cierra sesión y vuelve a entrar al panel.
      </p>
      <button
        onClick={unstable_retry}
        className="mt-2 px-5 py-2.5 rounded-xl bg-[#108910] text-white text-sm font-semibold hover:bg-[#0d6f0d] transition-colors"
      >
        Reintentar
      </button>
    </div>
  )
}
