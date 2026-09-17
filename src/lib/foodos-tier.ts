/**
 * Nivel de FoodOS del restaurante y sus entitlements.
 *
 * Server-only. El nivel "ganado" se calcula con la MISMA lógica del programa
 * de recompensas (`computeWeekProgress`, migración 00029): compras pagadas del
 * dueño del restaurante, semana ISO en hora de México, $2,500 por semana.
 * Encima se aplican los overrides manuales de admin
 * (`foodos_entitlement_overrides`), que ganan mientras no expiren.
 *
 * No duplica el cálculo de cashback ni el de totales de pedidos: solo lee
 * `orders` y delega en el módulo puro.
 */

import { cache } from "react"
import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"
import { isSupabaseConfigured } from "@/lib/supabase/env"
import { logger } from "@/lib/logger"
import {
  effectiveTier,
  earnedTierFromOrders,
  FEATURE_MIN_TIER,
  hasFeature,
  summarizeEntitlements,
  type FoodosEntitlementState,
  type FoodosFeature,
} from "@/lib/foodos-entitlements"
import type { RewardsOrder } from "@/lib/wallet-progress"
import type { CashbackTier } from "@/types"

export type { FoodosEntitlementState }

/**
 * Ventana de órdenes a leer. Cubre la semana ISO en curso aunque haya
 * empezado el mes anterior; el filtro por mes lo hace el cálculo puro.
 */
const LOOKBACK_DAYS = 45

/** Entitlements de un restaurante sin compras registradas. */
const EMPTY_STATE: FoodosEntitlementState = {
  ...summarizeEntitlements("Verde"),
  earnedTier: "Verde",
  tier: "Verde",
  overridden: false,
  qualifyingWeeksThisMonth: 0,
  weeksToNextTier: null,
  weekSpend: 0,
  remainingToQualify: 0,
  daysLeft: 0,
}

/**
 * Nivel ganado por compras. Puro y determinista (recibe `now`), para poder
 * testearlo sin base de datos.
 */
export { earnedTierFromOrders, effectiveTier }

/**
 * Entitlements del dueño de un restaurante, leyendo con service role para no
 * depender de RLS en superficies de servidor (webhooks, crons, API).
 */
export async function getRestaurantEntitlements(
  restaurantId: string
): Promise<FoodosEntitlementState> {
  let supabase: Awaited<ReturnType<typeof createServiceClient>>
  try {
    supabase = await createServiceClient()
  } catch (err) {
    logger.warn("foodos.entitlements.serviceClient", { error: String(err) })
    return EMPTY_STATE
  }

  const { data: restaurant, error: rErr } = await supabase
    .from("foodos_restaurants")
    .select("user_id")
    .eq("id", restaurantId)
    .maybeSingle()

  if (rErr || !restaurant?.user_id) {
    if (rErr) logger.warn("foodos.entitlements.restaurant", { error: rErr.message })
    return EMPTY_STATE
  }

  const since = new Date(Date.now() - LOOKBACK_DAYS * 86400000).toISOString()

  const [ordersRes, overrideRes] = await Promise.all([
    supabase
      .from("orders")
      .select("created_at, total")
      .eq("user_id", restaurant.user_id)
      .eq("payment_status", "paid")
      .neq("status", "cancelled")
      .gte("created_at", since),
    supabase
      .from("foodos_entitlement_overrides")
      .select("tier, expires_at")
      .eq("restaurant_id", restaurantId)
      .maybeSingle(),
  ])

  if (ordersRes.error) {
    logger.warn("foodos.entitlements.orders", { error: ordersRes.error.message })
  }

  const { tier: earned, progress } = earnedTierFromOrders(
    (ordersRes.data as RewardsOrder[] | null) ?? []
  )
  const { tier, overridden } = effectiveTier(earned, overrideRes.data)

  return {
    ...summarizeEntitlements(tier),
    earnedTier: earned,
    tier,
    overridden,
    qualifyingWeeksThisMonth: progress.qualifyingWeeksThisMonth,
    weeksToNextTier: progress.weeksToNextTier,
    weekSpend: progress.weekSpend,
    remainingToQualify: progress.remainingToQualify,
    daysLeft: progress.daysLeft,
  }
}

/**
 * Entitlements del usuario autenticado, para las superficies del panel.
 * La sesión sale del client con cookies; el nivel se lee con service role.
 * `cache()` deduplica ambas lecturas dentro de la misma request.
 */
export const getMyEntitlements = cache(async (): Promise<FoodosEntitlementState> => {
  // Sin Supabase configurado (dev local / preview sin secrets) no puede haber
  // sesión: degradamos a Verde en lugar de lanzar, igual que `getUserRole`.
  if (!isSupabaseConfigured()) return EMPTY_STATE

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return EMPTY_STATE

  const { data: restaurant } = await supabase
    .from("foodos_restaurants")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle()

  if (!restaurant?.id) return EMPTY_STATE
  return getRestaurantEntitlements(restaurant.id)
})

// ------------------------------------------------------------
// Gate de servidor
// ------------------------------------------------------------

/** Error de nivel insuficiente. La UI lo reconoce por `code`. */
export class FoodosFeatureLockedError extends Error {
  readonly code = "FOODOS_FEATURE_LOCKED"
  readonly feature: FoodosFeature
  readonly requiredTier: CashbackTier
  readonly currentTier: CashbackTier

  constructor(feature: FoodosFeature, requiredTier: CashbackTier, currentTier: CashbackTier) {
    super(
      `FoodOS feature "${feature}" requires tier ${requiredTier} (current: ${currentTier}).`
    )
    this.name = "FoodosFeatureLockedError"
    this.feature = feature
    this.requiredTier = requiredTier
    this.currentTier = currentTier
  }
}

/**
 * Puerta de entrada de las server actions premium: devuelve los entitlements
 * del usuario o lanza `FoodosFeatureLockedError`.
 *
 * Toda acción que toque una capacidad premium debe empezar por aquí: la UI
 * puede ocultar la herramienta, pero el permiso real se verifica en servidor.
 */
export async function requireFoodosFeature(
  feature: FoodosFeature
): Promise<FoodosEntitlementState> {
  const entitlements = await getMyEntitlements()
  if (!hasFeature(entitlements.tier, feature)) {
    throw new FoodosFeatureLockedError(
      feature,
      FEATURE_MIN_TIER[feature],
      entitlements.tier
    )
  }
  return entitlements
}
