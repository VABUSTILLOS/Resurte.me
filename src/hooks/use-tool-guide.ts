"use client"

import { useState } from "react"
import { useLocalStorage } from "@/hooks/use-local-storage"

export interface UseToolGuideReturn {
  /** Panel abierto/cerrado */
  open: boolean
  /** El usuario ya cerró la guía de esta herramienta (ya la vio) */
  seen: boolean
  /** El panel quedó colapsado a una tira lateral */
  collapsed: boolean
  openGuide: () => void
  closeGuide: () => void
  markSeen: () => void
  toggleCollapsed: () => void
}

/**
 * Estado de la guía paso a paso de una herramienta.
 *
 * - Auto-abre la primera vez por herramienta y por tipo de restaurante
 *   (persistido en `resurte-guide-seen-<toolKey>-<slug>`).
 * - Recuerda si el usuario colapsó el panel
 *   (`resurte-guide-collapsed-<toolKey>-<slug>`).
 * - Es puramente presentación: no toca los datos de la herramienta.
 */
export function useToolGuide(
  toolKey: string,
  collectionSlug?: string | null,
): UseToolGuideReturn {
  const [seen, setSeen] = useLocalStorage<boolean>(`guide-seen-${toolKey}`, false, collectionSlug)
  const [collapsed, setCollapsed] = useLocalStorage<boolean>(`guide-collapsed-${toolKey}`, false, collectionSlug)
  const [open, setOpen] = useState(() => !seen)

  return {
    open,
    seen,
    collapsed,
    openGuide: () => setOpen(true),
    closeGuide: () => {
      setOpen(false)
      setSeen(true)
    },
    markSeen: () => setSeen(true),
    toggleCollapsed: () => setCollapsed((v) => !v),
  }
}
