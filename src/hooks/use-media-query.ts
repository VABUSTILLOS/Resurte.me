"use client"

import { useSyncExternalStore } from "react"

/**
 * Hook para evaluar una media query CSS desde React.
 *
 * Devuelve `initialValue` (por defecto `false`) en el primer render
 * (SSR/hidratación) y se ajusta al valor real tras montar, evitando
 * hydration mismatches. Pasa `initialValue: true` cuando el estado móvil
 * debe ser el correcto desde el primer paint (p. ej. defaults de accordion).
 */
export function useMediaQuery(query: string, initialValue = false): boolean {
  const subscribe = (onStoreChange: () => void) => {
    const mql = window.matchMedia(query)
    mql.addEventListener("change", onStoreChange)
    return () => mql.removeEventListener("change", onStoreChange)
  }

  const getSnapshot = () => window.matchMedia(query).matches

  return useSyncExternalStore(subscribe, getSnapshot, () => initialValue)
}
