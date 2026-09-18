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
import { isCurrentUserAdmin } from "@/lib/foodos-admin"
import { getOperatingContext, loadOperatingRestaurantName } from "@/lib/foodos-operating"
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

/**
 * Entitlements de un restaurante sin compras registradas, o de una lectura que
 * no se pudo completar.
 *
 * `available` se vacía a propósito aunque el nivel sea Verde: este estado
 * significa "no se pudo leer", no "leyó y no tiene nada". Dejarlo en lo que
 * `summarizeEntitlements("Verde")` devuelva afirmaría capacidades que nadie
 * verificó contra la base.
 */
const EMPTY_STATE: FoodosEntitlementState = {
  ...summarizeEntitlements("Verde"),
  available: [],
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
 *
 * El restaurante lo resuelve el seam de operación (`getOperatingContext`), no
 * una lectura directa por `user_id`: en el camino normal eso es exactamente el
 * restaurante propio, y mientras un admin impersona (P14) es el restaurante
 * visitado, con **su nivel real** — nunca el del admin ni un bypass.
 *
 * La sesión sale del client con cookies; el nivel se lee con service role.
 * `cache()` deduplica las lecturas dentro de la misma request.
 */
const resolveEntitlements = cache(
  async (): Promise<{
    entitlements: FoodosEntitlementState
    impersonating: boolean
    operatingRestaurantName: string | null
  }> => {
    // Sin Supabase configurado (dev local / preview sin secrets) no puede haber
    // sesión: degradamos a Verde en lugar de lanzar, igual que `getUserRole`.
    if (!isSupabaseConfigured())
      return { entitlements: EMPTY_STATE, impersonating: false, operatingRestaurantName: null }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user)
      return { entitlements: EMPTY_STATE, impersonating: false, operatingRestaurantName: null }

    const ctx = await getOperatingContext(supabase, user)
    if (!ctx.restaurantId) {
      return {
        entitlements: EMPTY_STATE,
        impersonating: ctx.impersonating,
        operatingRestaurantName: null,
      }
    }

    const [entitlements, operatingRestaurantName] = await Promise.all([
      getRestaurantEntitlements(ctx.restaurantId),
      // Devuelve `null` sin consultar nada si no hay impersonación, así que el
      // camino normal no paga una lectura extra.
      loadOperatingRestaurantName(ctx),
    ])
    return { entitlements, impersonating: ctx.impersonating, operatingRestaurantName }
  }
)

/**
 * Lo que necesita la cabecera del panel: el nivel del restaurante operado, si
 * la sesión es de soporte y, en ese caso, el nombre del restaurante visitado
 * (para el banner "Operando como X").
 *
 * Existe para resolver las tres cosas con **una sola** lectura de contexto: el
 * layout necesita el nivel y el nombre a la vez, y pedirlos por separado
 * duplicaría el sondeo del restaurante en cada render.
 */
export async function getPanelOperatingState(): Promise<{
  entitlements: FoodosEntitlementState
  impersonating: boolean
  operatingRestaurantName: string | null
}> {
  return resolveEntitlements()
}

/** Nivel del restaurante operado. Atajo de `getPanelOperatingState()`. */
export async function getMyEntitlements(): Promise<FoodosEntitlementState> {
  return (await resolveEntitlements()).entitlements
}

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
 * ¿El usuario actual es administrador de plataforma?
 *
 * El admin no tiene restaurante propio, así que su nivel real siempre es
 * Verde: sin este bypass no podría probar ni dar soporte a las herramientas
 * premium. La implementación vive en `foodos-admin.ts` porque el seam de
 * impersonación también la necesita y no puede depender de este módulo.
 */
export { isCurrentUserAdmin } from "@/lib/foodos-admin"

/**
 * Puerta de entrada de las server actions premium: devuelve los entitlements
 * del usuario o lanza `FoodosFeatureLockedError`.
 *
 * Toda acción que toque una capacidad premium debe empezar por aquí: la UI
 * puede mostrar la herramienta en vista previa, pero el permiso real se
 * verifica en servidor.
 */
export async function requireFoodosFeature(
  feature: FoodosFeature
): Promise<FoodosEntitlementState> {
  const { entitlements, impersonating } = await resolveEntitlements()
  if (!hasFeature(entitlements.tier, feature)) {
    // El bypass del admin se consulta solo cuando el nivel no alcanza, para
    // no pagar la verificación extra en el camino normal de un restaurantero.
    //
    // Al impersonar NO aplica nunca: el punto de P14 es ver exactamente lo que
    // ve el dueño, así que el nivel que decide es el real del restaurante
    // visitado (ya resuelto por `resolveEntitlements`), sin privilegio extra.
    if (!impersonating && (await isCurrentUserAdmin())) return entitlements
    throw new FoodosFeatureLockedError(
      feature,
      FEATURE_MIN_TIER[feature],
      entitlements.tier
    )
  }
  return entitlements
}
