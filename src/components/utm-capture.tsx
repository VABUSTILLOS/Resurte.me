"use client"

import { useEffect } from "react"
import { usePathname, useSearchParams } from "next/navigation"
import { captureUtmParams } from "@/lib/utm"

/**
 * Captura la atribución UTM de la URL de aterrizaje (migración 00061).
 *
 * Se monta una sola vez en el layout raíz. En cada cambio de ruta intenta
 * capturar: solo persisten URLs que realmente traen parámetros utm_* (la
 * navegación interna no pisa la atribución original).
 */
export function UtmCapture() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    captureUtmParams(`?${searchParams.toString()}`)
  }, [pathname, searchParams])

  return null
}
