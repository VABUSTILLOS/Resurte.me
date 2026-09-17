"use client"

/**
 * Nivel de compras y capacidades premium de FoodOS, compartidos por el panel.
 *
 * El valor se resuelve en el servidor (`src/app/panel/layout.tsx`, que ya es
 * `force-dynamic`) y se hidrata aquí. No hay fetch en cliente ni parpadeo:
 * el hub y las páginas de FoodOS leen el mismo objeto.
 */

import { createContext, useContext, useMemo } from "react"
import {
  canUseFeature,
  featuresForTier,
  lockedTierFor,
  summarizeEntitlements,
  type FoodosEntitlementState,
  type FoodosFeature,
} from "@/lib/foodos-entitlements"
import type { CashbackTier } from "@/types"

/** Estado de un visitante sin restaurante: todo bloqueado, nada roto. */
export const EMPTY_ENTITLEMENTS: FoodosEntitlementState = {
  ...summarizeEntitlements("Verde"),
  earnedTier: "Verde",
  overridden: false,
  qualifyingWeeksThisMonth: 0,
  weeksToNextTier: null,
  weekSpend: 0,
  remainingToQualify: 0,
  daysLeft: 0,
}

interface EntitlementsContextValue {
  entitlements: FoodosEntitlementState
  /**
   * ¿Se puede USAR la capacidad (guardar, ejecutar, cobrar)?
   *
   * Es el único predicado que debe decidir si una escritura se permite. El
   * nivel ya no decide si la herramienta se VE: el contenido completo se
   * renderiza siempre y solo la acción final pide el nivel.
   */
  canUse: (feature: FoodosFeature) => boolean
  /** Nivel que falta para usar la capacidad, o `null` si ya se puede. */
  lockedTier: (feature: FoodosFeature) => CashbackTier | null
  /** ¿La capacidad se muestra en vista previa (solo lectura + demo)? */
  isPreview: (feature: FoodosFeature) => boolean
  /** Capacidades disponibles en el nivel actual. */
  available: FoodosFeature[]
  /** Vista de administrador de plataforma: todo desbloqueado. */
  isAdmin: boolean
}

const EntitlementsContext = createContext<EntitlementsContextValue | null>(null)

export function FoodosEntitlementsProvider({
  value,
  isAdmin = false,
  children,
}: {
  value: FoodosEntitlementState
  /** El layout del panel lo resuelve con `getUserRole()`. */
  isAdmin?: boolean
  children: React.ReactNode
}) {
  const ctx = useMemo<EntitlementsContextValue>(() => {
    const canUse = (feature: FoodosFeature) => canUseFeature(value.tier, feature, { isAdmin })
    return {
      entitlements: value,
      canUse,
      lockedTier: (feature) => lockedTierFor(value.tier, feature, { isAdmin }),
      isPreview: (feature) => !canUse(feature),
      available: featuresForTier(value.tier),
      isAdmin,
    }
  }, [value, isAdmin])
  return <EntitlementsContext.Provider value={ctx}>{children}</EntitlementsContext.Provider>
}

/**
 * Entitlements del panel. Fuera del provider devuelve el estado vacío en vez
 * de lanzar: una superficie que se monte sin provider simplemente ve el gate
 * cerrado, nunca una pantalla en blanco.
 */
export function useEntitlements(): EntitlementsContextValue {
  const ctx = useContext(EntitlementsContext)
  if (ctx) return ctx
  return {
    entitlements: EMPTY_ENTITLEMENTS,
    canUse: () => false,
    lockedTier: (feature) => lockedTierFor(EMPTY_ENTITLEMENTS.tier, feature),
    isPreview: () => true,
    available: [],
    isAdmin: false,
  }
}
