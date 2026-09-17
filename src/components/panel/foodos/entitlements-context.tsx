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
  featuresForTier,
  hasFeature,
  summarizeEntitlements,
  type FoodosEntitlementState,
  type FoodosFeature,
} from "@/lib/foodos-entitlements"

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
  /** ¿El nivel alcanza para esta capacidad? */
  can: (feature: FoodosFeature) => boolean
  /** Capacidades disponibles en el nivel actual. */
  available: FoodosFeature[]
}

const EntitlementsContext = createContext<EntitlementsContextValue | null>(null)

export function FoodosEntitlementsProvider({
  value,
  children,
}: {
  value: FoodosEntitlementState
  children: React.ReactNode
}) {
  const ctx = useMemo<EntitlementsContextValue>(
    () => ({
      entitlements: value,
      can: (feature) => hasFeature(value.tier, feature),
      available: featuresForTier(value.tier),
    }),
    [value]
  )
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
    can: () => false,
    available: [],
  }
}
