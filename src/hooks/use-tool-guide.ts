"use client"

import { useEffect, useState } from "react"
import { useLocalStorage } from "@/hooks/use-local-storage"
import { readStored } from "@/lib/storage"
import { readConsentDecision } from "@/lib/cookie-consent"

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
 *   (persistido en `resurte-guide-seen-<toolKey>-<slug>`), pero **solo si el
 *   usuario ya decidió sobre las cookies**. Ver `open` más abajo.
 * - Recuerda si el usuario colapsó el panel
 *   (`resurte-guide-collapsed-<toolKey>-<slug>`).
 * - Es puramente presentación: no toca los datos de la herramienta.
 */
export function useToolGuide(
  toolKey: string,
  collectionSlug?: string | null,
): UseToolGuideReturn {
  const seenKey = `guide-seen-${toolKey}`
  const [seen, setSeen] = useLocalStorage<boolean>(seenKey, false, collectionSlug)
  const [collapsed, setCollapsed] = useLocalStorage<boolean>(`guide-collapsed-${toolKey}`, false, collectionSlug)

  // Nunca `true` en el primer render: el HTML prerenderizado no conoce
  // localStorage, así que un `open` inicial verdadero pintaría un drawer que
  // aparece y desaparece al hidratar. La decisión se toma una sola vez, en el
  // efecto de montaje.
  const [open, setOpen] = useState(false)

  useEffect(() => {
    // Primera visita de esta herramienta para este tipo de restaurante...
    if (readStored<boolean>(seenKey, false, collectionSlug)) return
    // ...y sin banner de consentimiento pendiente. El banner ocupa el mismo
    // primer tap: su franja de botones vive en el carril inferior, y en móvil
    // el drawer de la guía (`z-[90]`, ancho `100vw - 3rem`) más su backdrop
    // (`z-[85]`, `inset-0`) la tapan. Si ambos aparecen a la vez, el primer tap
    // del usuario nuevo cierra la guía en vez de consentir — y el que puede
    // esperar es la guía, no una obligación legal.
    if (readConsentDecision() === null) return
    // Diferido a un macrotask: escribir el estado en el cuerpo del efecto
    // encadena un render extra (react-hooks/set-state-in-effect). Mismo patrón
    // que src/components/comercializacion/whatsapp-templates.tsx.
    const timeout = setTimeout(() => setOpen(true), 0)
    return () => clearTimeout(timeout)
    // Solo al montar, a propósito: si el usuario consiente durante esta misma
    // vista, la guía espera a la siguiente navegación en vez de saltarle encima
    // (un popup sobre otro popup le roba el tap que iba a dar).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
