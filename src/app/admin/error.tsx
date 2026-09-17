"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { logger } from "@/lib/logger"
import { reportClientError } from "@/lib/report-client-error"

/**
 * Error boundary del área /admin: un fallo en una sección (pedidos, métricas,
 * WhatsApp) no debe dejar al operador sin navegación ni salida.
 *
 * Además del reintento, el error se reporta a `error_logs` para que quede
 * visible en `/admin/bitacoras?tab=errores` (antes solo iba a la consola, así
 * que un fallo en producción era indiagnosticable) y se muestra el detalle
 * técnico — la sección es admin-only, ya gateada server-side en el layout.
 */
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const pathname = usePathname()
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    logger.error("Error en /admin", error)
    reportClientError(error, {
      context: "admin.error_boundary",
      extra: { section: pathname },
    })
  }, [error, pathname])

  const detail = [
    `Sección: ${pathname}`,
    `Mensaje: ${error.message}`,
    error.digest ? `Digest: ${error.digest}` : null,
    error.stack ? `\n${error.stack}` : null,
  ]
    .filter(Boolean)
    .join("\n")

  const copyDetail = () => {
    void navigator.clipboard
      ?.writeText(detail)
      .then(() => setCopied(true))
      .catch(() => setCopied(false))
  }

  return (
    <div className="flex flex-col items-center justify-center py-24 text-center px-4">
      <p className="text-4xl mb-4" aria-hidden="true">🛠️</p>
      <h1 className="text-lg font-bold text-gray-900 mb-2">
        Esta sección tuvo un problema
      </h1>
      <p className="text-sm text-gray-500 mb-6 max-w-sm">
        El resto del panel de administración sigue disponible en el menú superior.
      </p>

      <details className="w-full max-w-lg text-left mb-6">
        <summary className="cursor-pointer text-xs font-semibold text-gray-500 hover:text-gray-700 select-none">
          Detalle técnico
        </summary>
        <pre className="mt-2 p-3 rounded-lg bg-gray-50 border border-gray-100 text-[11px] leading-relaxed text-gray-600 whitespace-pre-wrap break-words max-h-48 overflow-auto">
          {detail}
        </pre>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={copyDetail}
            className="text-xs font-semibold text-brand-600 hover:text-brand-700"
          >
            {copied ? "Copiado ✓" : "Copiar detalle"}
          </button>
          <Link
            href="/admin/bitacoras?tab=errores"
            className="text-xs font-semibold text-gray-500 hover:text-gray-700"
          >
            Ver errores registrados
          </Link>
        </div>
      </details>

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
