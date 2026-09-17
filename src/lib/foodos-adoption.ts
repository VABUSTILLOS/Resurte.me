/**
 * Fase 9 — KPIs de adopción por capacidad.
 *
 * Mide, para cada capacidad de FoodOS, si de verdad se usa. Una capacidad
 * abierta por nivel pero nunca usada no es adopción: es una fila en una tabla.
 * Por eso los tres números son condicionales a que la capacidad esté abierta:
 *
 * - **Activación**: de los restaurantes que YA tienen la capacidad, cuántos la
 *   usaron alguna vez. Activación baja con muchas capacidades abiertas
 *   significa que el nivel se ganó pero el producto no se entendió.
 * - **Uso semanal**: de los que la tienen, cuántos la usaron en los últimos 7
 *   días. Es la señal que se mueve primero cuando algo se rompe.
 * - **Retención**: de los que la usaron en los últimos 7 días, cuántos también
 *   la usaron en los 7 anteriores. 0% con uso semanal alto es una capacidad que
 *   se probó una vez y se abandonó.
 *
 * El módulo es puro: recibe hechos ya leídos y no toca Supabase. La lectura
 * vive en `getAdminFoodosAdoption()`.
 */

import { compareMetric, type MetricComparison } from "@/lib/analytics-periods"
import { FOODOS_FEATURE_ORDER, type FoodosFeature } from "@/lib/foodos-entitlements"

/** Días de cada ventana. Fijo para que dos corridas den el mismo número. */
export const ADOPTION_WINDOW_DAYS = 7

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Actividad de un restaurante en una capacidad.
 *
 * `usesRecent` y `usesPrior` son conteos por ventana, no el histórico: la
 * retención no se puede derivar del total acumulado. `lastUsedAt` se conserva
 * para poder mostrar "usado por última vez" sin volver a leer.
 */
export interface FeatureActivity {
  restaurantId: string
  feature: FoodosFeature
  /** Total histórico de usos. 0 = nunca. */
  uses: number
  /** Usos en los últimos `ADOPTION_WINDOW_DAYS` días. */
  usesRecent: number
  /** Usos en los `ADOPTION_WINDOW_DAYS` días anteriores a esos. */
  usesPrior: number
  lastUsedAt: string | null
}

/** Restaurante con las capacidades que su nivel efectivo le abre. */
export interface RestaurantFeatureState {
  restaurantId: string
  name: string
  unlocked: FoodosFeature[]
}

export interface FeatureAdoption {
  feature: FoodosFeature
  /** Restaurantes con la capacidad abierta. Denominador de todo. */
  unlocked: number
  /** De los abiertos, cuántos la usaron alguna vez. */
  activated: number
  /** De los abiertos, cuántos la usaron en la ventana reciente. */
  activeRecent: number
  /** De los activos recientes, cuántos también la usaron en la previa. */
  retained: number
  /** `activated / unlocked`, 0–100 con un decimal. */
  activationRate: number
  /** `activeRecent / unlocked`, 0–100 con un decimal. */
  weeklyActiveRate: number
  /** `retained / activeRecent`, 0–100 con un decimal; 0 si nadie está activo. */
  retentionRate: number
  /** Usos de la ventana reciente contra la previa. */
  usage: MetricComparison
}

export interface AdoptionSummary {
  restaurants: number
  /** Restaurantes con al menos un uso en la ventana reciente. */
  activeRestaurants: number
  /** Restaurantes con capacidades abiertas y cero usos históricos. */
  dormantRestaurants: number
  /** Media de capacidades abiertas por restaurante, con un decimal. */
  averageUnlocked: number
}

function pct(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0
  return Math.round((numerator / denominator) * 1000) / 10
}

/**
 * Reparte una lista de timestamps de uso en las dos ventanas y devuelve los
 * conteos. Un timestamp inválido se ignora en vez de contar como "ahora": un
 * dato corrupto no debe inflar el uso semanal.
 */
export function bucketUsage(
  timestamps: (string | null | undefined)[],
  now: Date = new Date()
): Pick<FeatureActivity, "uses" | "usesRecent" | "usesPrior" | "lastUsedAt"> {
  const recentStart = now.getTime() - ADOPTION_WINDOW_DAYS * DAY_MS
  const priorStart = now.getTime() - 2 * ADOPTION_WINDOW_DAYS * DAY_MS

  let uses = 0
  let usesRecent = 0
  let usesPrior = 0
  let lastMs: number | null = null

  for (const raw of timestamps) {
    if (!raw) continue
    const ms = Date.parse(raw)
    if (!Number.isFinite(ms)) continue
    uses += 1
    if (ms >= recentStart) usesRecent += 1
    else if (ms >= priorStart) usesPrior += 1
    if (lastMs === null || ms > lastMs) lastMs = ms
  }

  return {
    uses,
    usesRecent,
    usesPrior,
    lastUsedAt: lastMs === null ? null : new Date(lastMs).toISOString(),
  }
}

/**
 * Cuenta, por capacidad, cuántos restaurantes que la tienen abierta la usaron.
 *
 * `now` se inyecta para que los tests no dependan del reloj. Los restaurantes
 * sin actividad registrada cuentan como "no usada" — que es exactamente la
 * señal que buscamos.
 */
export function computeFeatureAdoption(
  restaurants: RestaurantFeatureState[],
  activity: FeatureActivity[]
): FeatureAdoption[] {
  // Un restaurante puede reportar la misma capacidad desde varias fuentes
  // (p. ej. sesiones y mensajes del Mesero IA). Se suman, no se pisan.
  const byKey = new Map<string, FeatureActivity>()
  for (const row of activity) {
    const key = `${row.restaurantId}::${row.feature}`
    const prev = byKey.get(key)
    byKey.set(key, {
      restaurantId: row.restaurantId,
      feature: row.feature,
      uses: (prev?.uses ?? 0) + Math.max(row.uses, 0),
      usesRecent: (prev?.usesRecent ?? 0) + Math.max(row.usesRecent, 0),
      usesPrior: (prev?.usesPrior ?? 0) + Math.max(row.usesPrior, 0),
      lastUsedAt: laterOf(prev?.lastUsedAt ?? null, row.lastUsedAt),
    })
  }

  return FOODOS_FEATURE_ORDER.map((feature) => {
    let unlocked = 0
    let activated = 0
    let activeRecent = 0
    let retained = 0
    let recentUses = 0
    let priorUses = 0

    for (const restaurant of restaurants) {
      if (!restaurant.unlocked.includes(feature)) continue
      unlocked += 1

      const state = byKey.get(`${restaurant.restaurantId}::${feature}`)
      if (!state || state.uses <= 0) continue
      activated += 1

      if (state.usesRecent > 0) {
        activeRecent += 1
        recentUses += state.usesRecent
        // Retenido = usó en la ventana reciente Y en la anterior. Sin la
        // anterior es una prueba, no una costumbre.
        if (state.usesPrior > 0) retained += 1
      }
      // El uso previo se cuenta siempre, incluso si el restaurante está activo
      // ahora: si no, la comparación de uso daría una caída falsa.
      priorUses += state.usesPrior
    }

    return {
      feature,
      unlocked,
      activated,
      activeRecent,
      retained,
      activationRate: pct(activated, unlocked),
      weeklyActiveRate: pct(activeRecent, unlocked),
      retentionRate: pct(retained, activeRecent),
      usage: compareMetric(recentUses, priorUses),
    }
  })
}

function laterOf(a: string | null, b: string | null): string | null {
  if (!a) return b
  if (!b) return a
  const am = Date.parse(a)
  const bm = Date.parse(b)
  if (!Number.isFinite(am)) return b
  if (!Number.isFinite(bm)) return a
  return am >= bm ? a : b
}

export function summarizeAdoption(
  restaurants: RestaurantFeatureState[],
  activity: FeatureActivity[]
): AdoptionSummary {
  const activeIds = new Set<string>()
  const everUsedIds = new Set<string>()
  for (const row of activity) {
    if (row.usesRecent > 0) activeIds.add(row.restaurantId)
    if (row.uses > 0) everUsedIds.add(row.restaurantId)
  }

  const unlockedTotal = restaurants.reduce((sum, r) => sum + r.unlocked.length, 0)
  const dormant = restaurants.filter(
    (r) => r.unlocked.length > 0 && !everUsedIds.has(r.restaurantId)
  ).length

  return {
    restaurants: restaurants.length,
    activeRestaurants: activeIds.size,
    dormantRestaurants: dormant,
    // No es un porcentaje: es el promedio de capacidades por restaurante.
    averageUnlocked:
      restaurants.length > 0
        ? Math.round((unlockedTotal / restaurants.length) * 10) / 10
        : 0,
  }
}
