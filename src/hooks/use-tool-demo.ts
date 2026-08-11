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
 * Estado global del modo demo del panel.
 *
 * El flag es único para todo el panel (`resurte-demo-mode`): al activarlo en
 * cualquier herramienta se mantiene activo al navegar a las demás. El modo
 * demo NUNCA escribe datos: la página decide qué renderizar leyendo los
 * datasets de `tool-demo.ts` y pre-llenando formularios en memoria.
 */
export function useToolDemo(): UseToolDemoReturn {
  const [demoOn, setDemoOn] = useLocalStorage<boolean>("demo-mode", false)

  return {
    demoOn,
    enableDemo: () => setDemoOn(true),
    disableDemo: () => setDemoOn(false),
    toggleDemo: () => setDemoOn((v) => !v),
  }
}
