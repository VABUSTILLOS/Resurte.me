"use client"

/**
 * Guarda las ESCRITURAS de una capacidad premium.
 *
 * El nivel no decide si la herramienta se ve —se renderiza completa— pero sí
 * decide si se puede guardar. `run()` mantiene el diálogo de subida de nivel
 * en un solo lugar y evita el viaje al servidor que de todos modos acabaría
 * en `FoodosFeatureLockedError`.
 *
 * Se resuelve en cliente a propósito: el mensaje que Next deja pasar cuando
 * una Server Action lanza no está garantizado en producción, así que esperar
 * el error del servidor para mostrar el aviso sería frágil.
 *
 * El gate del servidor (`requireFoodosFeature`) sigue siendo la autoridad:
 * esto es solo la capa de presentación.
 */

import { useCallback, useState, type ReactNode } from "react"
import { useEntitlements } from "@/components/panel/foodos/entitlements-context"
import TierUpsellDialog from "@/components/panel/foodos/tier-upsell-dialog"
import type { FoodosFeature } from "@/lib/foodos-entitlements"
import type { CashbackTier } from "@/types"

/** Resultado de `run()`: si la acción corrió, y qué devolvió. */
export type TierGuardResult<T> = { ran: true; value: T } | { ran: false }

export interface UseTierGuardReturn {
  /** Nivel que falta para usar la capacidad, o `null` si ya se puede. */
  lockedTier: CashbackTier | null
  /**
   * Ejecuta `action` solo si el nivel alcanza.
   *
   * Cuando falta nivel devuelve `{ ran: false }` **sin llamar al servidor** y
   * abre el diálogo, así el llamador sale antes de anunciar un éxito falso:
   *
   * ```tsx
   * const attempt = await run(() => saveX(input))
   * if (!attempt.ran) return
   * if (!attempt.value.ok) throw new Error(attempt.value.error)
   * ```
   *
   * Los errores reales de `action` se propagan intactos al `catch` del
   * llamador.
   */
  run: <T>(action: () => T | Promise<T>) => Promise<TierGuardResult<T>>
  /** Diálogo de subida de nivel. Montarlo una vez por página. */
  upsellDialog: ReactNode
}

export function useTierGuard(feature: FoodosFeature): UseTierGuardReturn {
  const { lockedTier } = useEntitlements()
  const [open, setOpen] = useState(false)
  const required = lockedTier(feature)

  const run = useCallback(
    async <T,>(action: () => T | Promise<T>): Promise<TierGuardResult<T>> => {
      if (required) {
        setOpen(true)
        return { ran: false }
      }
      return { ran: true, value: await action() }
    },
    [required]
  )

  return {
    lockedTier: required,
    run,
    upsellDialog: (
      <TierUpsellDialog
        open={open}
        feature={feature}
        onClose={() => setOpen(false)}
      />
    ),
  }
}
