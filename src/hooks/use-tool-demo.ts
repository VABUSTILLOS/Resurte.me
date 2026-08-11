"use client"

import { useLocalStorage } from "@/hooks/use-local-storage"

export interface UseToolDemoReturn {
  /** Modo demo activo */
  demoOn: boolean
  enableDemo: () => void
  disableDemo: () => void
  toggleDemo: () => void
}

/**
 * Estado del modo demo de una herramienta.
 *
 * Solo persiste el flag (`resurte-demo-on-<toolKey>-<slug>`). El modo demo
 * NUNCA escribe datos: la página decide qué renderizar leyendo los datasets
 * de `tool-demo.ts` y pre-llenando formularios en memoria.
 */
export function useToolDemo(
  toolKey: string,
  collectionSlug?: string | null,
): UseToolDemoReturn {
  const [demoOn, setDemoOn] = useLocalStorage<boolean>(`demo-on-${toolKey}`, false, collectionSlug)

  return {
    demoOn,
    enableDemo: () => setDemoOn(true),
    disableDemo: () => setDemoOn(false),
    toggleDemo: () => setDemoOn((v) => !v),
  }
}
