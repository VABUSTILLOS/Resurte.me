/**
 * Entitlements de FoodOS por nivel de compra.
 *
 * Las capas de IA, logística y automatización (paridad con FluxSales) no se
 * cobran aparte: se desbloquean con el nivel que el restaurantero ya gana
 * comprando en el marketplace (migración 00029 / `wallet-progress.ts`).
 *
 * Módulo puro, sin dependencias de servidor ni de React: lo usan por igual
 * las server actions (gate real, responde 403) y los componentes del panel
 * (ocultar la herramienta y mostrar el CTA de nivel).
 *
 * El `pct` de cashback de cada nivel vive en `CASHBACK_TIERS`
 * (`src/types/index.ts`) y NO se toca aquí: son dos ejes distintos.
 */

import type { CashbackTier } from "@/types"
import {
  computeWeekProgress,
  TIER_LADDER,
  type RewardsOrder,
  type WeekProgress,
} from "@/lib/wallet-progress"
import { QUALIFYING_WEEK_MIN } from "@/lib/utils"

/** Capacidades premium de FoodOS. */
export type FoodosFeature =
  | "marketing_ia"
  | "flotilla"
  | "mesero_ia"
  | "pos_mostrador"
  | "comandero"
  | "wallet_passes"
  | "app_marca"
  | "sitio_ia"
  | "pos_integraciones"
  | "catering"

/** Orden de los niveles: mayor = más alto. */
export const TIER_RANK: Record<CashbackTier, number> = {
  Verde: 1,
  Plata: 2,
  Oro: 3,
  Diamante: 4,
}

/** Clave i18n del nombre del nivel, dentro del namespace `foodos.entitlements`. */
export const TIER_LABEL_KEY: Record<CashbackTier, string> = {
  Verde: "foodos.entitlements.tierVerde",
  Plata: "foodos.entitlements.tierPlata",
  Oro: "foodos.entitlements.tierOro",
  Diamante: "foodos.entitlements.tierDiamante",
}

/**
 * Nivel mínimo que desbloquea cada capacidad.
 *
 * Regla del producto: Plata abre marketing, Oro abre Flotilla, Diamante abre
 * Mesero IA y todo lo demás.
 */
export const FEATURE_MIN_TIER: Record<FoodosFeature, CashbackTier> = {
  marketing_ia: "Plata",
  flotilla: "Oro",
  mesero_ia: "Diamante",
  // POS nativo y comandero: el restaurantero cobra y opera el salón aquí mismo.
  // Ojo: `pos_integraciones` es lo OPUESTO — conectar un punto de venta ajeno.
  pos_mostrador: "Diamante",
  comandero: "Diamante",
  wallet_passes: "Diamante",
  app_marca: "Diamante",
  sitio_ia: "Diamante",
  pos_integraciones: "Diamante",
  catering: "Diamante",
}

export interface FoodosFeatureInfo {
  feature: FoodosFeature
  /** Clave i18n del nombre, dentro del namespace `foodos.entitlements`. */
  labelKey: string
  /** Clave i18n de la descripción, dentro del namespace `foodos.entitlements`. */
  descriptionKey: string
  minTier: CashbackTier
}

/** Catálogo de capacidades. El orden de presentación lo fija FOODOS_FEATURE_ORDER. */
export const FOODOS_FEATURES: Record<FoodosFeature, FoodosFeatureInfo> = {
  marketing_ia: {
    feature: "marketing_ia",
    labelKey: "foodos.entitlements.featureMarketingIa",
    descriptionKey: "foodos.entitlements.featureMarketingIaDesc",
    minTier: "Plata",
  },
  flotilla: {
    feature: "flotilla",
    labelKey: "foodos.entitlements.featureFlotilla",
    descriptionKey: "foodos.entitlements.featureFlotillaDesc",
    minTier: "Oro",
  },
  mesero_ia: {
    feature: "mesero_ia",
    labelKey: "foodos.entitlements.featureMeseroIa",
    descriptionKey: "foodos.entitlements.featureMeseroIaDesc",
    minTier: "Diamante",
  },
  pos_mostrador: {
    feature: "pos_mostrador",
    labelKey: "foodos.entitlements.featurePosMostrador",
    descriptionKey: "foodos.entitlements.featurePosMostradorDesc",
    minTier: "Diamante",
  },
  comandero: {
    feature: "comandero",
    labelKey: "foodos.entitlements.featureComandero",
    descriptionKey: "foodos.entitlements.featureComanderoDesc",
    minTier: "Diamante",
  },
  wallet_passes: {
    feature: "wallet_passes",
    labelKey: "foodos.entitlements.featureWalletPasses",
    descriptionKey: "foodos.entitlements.featureWalletPassesDesc",
    minTier: "Diamante",
  },
  app_marca: {
    feature: "app_marca",
    labelKey: "foodos.entitlements.featureAppMarca",
    descriptionKey: "foodos.entitlements.featureAppMarcaDesc",
    minTier: "Diamante",
  },
  sitio_ia: {
    feature: "sitio_ia",
    labelKey: "foodos.entitlements.featureSitioIa",
    descriptionKey: "foodos.entitlements.featureSitioIaDesc",
    minTier: "Diamante",
  },
  pos_integraciones: {
    feature: "pos_integraciones",
    labelKey: "foodos.entitlements.featurePosIntegraciones",
    descriptionKey: "foodos.entitlements.featurePosIntegracionesDesc",
    minTier: "Diamante",
  },
  catering: {
    feature: "catering",
    labelKey: "foodos.entitlements.featureCatering",
    descriptionKey: "foodos.entitlements.featureCateringDesc",
    minTier: "Diamante",
  },
}

/**
 * Capacidades en orden ascendente de nivel. Dentro del mismo nivel el orden
 * es explícito (no alfabético) para controlar qué se muestra primero.
 */
const FEATURE_ORDER_BY_TIER: FoodosFeature[] = [
  // Plata
  "marketing_ia",
  // Oro
  "flotilla",
  // Diamante
  "mesero_ia",
  "pos_mostrador",
  "comandero",
  "wallet_passes",
  "app_marca",
  "sitio_ia",
  "pos_integraciones",
  "catering",
]

export const FOODOS_FEATURE_ORDER: FoodosFeature[] = [...FEATURE_ORDER_BY_TIER].sort(
  (a, b) => TIER_RANK[FEATURE_MIN_TIER[a]] - TIER_RANK[FEATURE_MIN_TIER[b]]
)

const TIER_NAMES = Object.keys(TIER_RANK) as CashbackTier[]

/** ¿El valor viene de un nivel conocido? (útil al leer de BD o de props). */
export function isCashbackTier(value: unknown): value is CashbackTier {
  return typeof value === "string" && (TIER_NAMES as string[]).includes(value)
}

/**
 * Normaliza el `tier` (string) que devuelve `computeWeekProgress` a
 * `CashbackTier`, con Verde como fallback.
 */
export function asCashbackTier(value: string | null | undefined): CashbackTier {
  return isCashbackTier(value) ? value : "Verde"
}

/** Nivel mínimo para usar una capacidad. */
export function minTierFor(feature: FoodosFeature): CashbackTier {
  return FEATURE_MIN_TIER[feature]
}

/** ¿El nivel alcanza para la capacidad? */
export function hasFeature(tier: CashbackTier, feature: FoodosFeature): boolean {
  return TIER_RANK[tier] >= TIER_RANK[FEATURE_MIN_TIER[feature]]
}

/** Capacidades disponibles en un nivel. */
export function featuresForTier(tier: CashbackTier): FoodosFeature[] {
  return FOODOS_FEATURE_ORDER.filter((f) => hasFeature(tier, f))
}

/** Capacidades que el nivel todavía no alcanza. */
export function lockedFeatures(tier: CashbackTier): FoodosFeature[] {
  return FOODOS_FEATURE_ORDER.filter((f) => !hasFeature(tier, f))
}

/** Siguiente nivel del escalón (null en el tope). */
export function nextTier(tier: CashbackTier): CashbackTier | null {
  return TIER_NAMES.find((t) => TIER_RANK[t] === TIER_RANK[tier] + 1) ?? null
}

/**
 * Qué capacidades se abren al subir del nivel actual al siguiente.
 * Es lo que el CTA de nivel promete al restaurantero.
 */
export function featuresUnlockedByNextTier(tier: CashbackTier): FoodosFeature[] {
  const up = nextTier(tier)
  if (!up) return []
  return FOODOS_FEATURE_ORDER.filter(
    (f) => !hasFeature(tier, f) && hasFeature(up, f)
  )
}

/** Resumen de entitlements de un nivel, listo para serializar a la UI. */
export interface EntitlementSummary {
  tier: CashbackTier
  available: FoodosFeature[]
  locked: FoodosFeature[]
  nextTier: CashbackTier | null
  unlocksNext: FoodosFeature[]
}

/**
 * Entitlements completos del restaurante: el resumen de capacidades más el
 * avance de compras que explica *por qué* está en ese nivel.
 *
 * Serializable a componentes cliente (solo primitivas y arrays).
 */
export interface FoodosEntitlementState extends EntitlementSummary {
  /** Nivel ganado con compras, sin overrides. */
  earnedTier: CashbackTier
  /** true si el nivel efectivo viene de un override y no de compras. */
  overridden: boolean
  qualifyingWeeksThisMonth: number
  /** null cuando ya está en el nivel tope. */
  weeksToNextTier: number | null
  /** Consumo de la semana ISO en curso. */
  weekSpend: number
  /** Cuánto falta para calificar la semana en curso (0 si ya calificó). */
  remainingToQualify: number
  /** Días restantes de la semana ISO en curso. */
  daysLeft: number
}

export function summarizeEntitlements(tier: CashbackTier): EntitlementSummary {
  return {
    tier,
    available: featuresForTier(tier),
    locked: lockedFeatures(tier),
    nextTier: nextTier(tier),
    unlocksNext: featuresUnlockedByNextTier(tier),
  }
}

// ============================================================
// NIVEL GANADO (delega en la lógica de recompensas, no la duplica)
// ============================================================

/**
 * Nivel ganado por compras, a partir de las órdenes pagadas del dueño.
 * Puro y determinista (recibe `now`): testeable sin base de datos.
 */
export function earnedTierFromOrders(
  orders: RewardsOrder[],
  now: Date = new Date()
): { tier: CashbackTier; progress: WeekProgress } {
  const progress = computeWeekProgress(orders, now)
  return { tier: asCashbackTier(progress.tier), progress }
}

/**
 * Combina el nivel ganado con el override de admin.
 *
 * El override gana mientras no expire y no sea "Verde" (conceder Verde no es
 * un privilegio, así que no baja el nivel ganado). Sin override, manda el
 * nivel ganado por compras.
 */
export function effectiveTier(
  earned: CashbackTier,
  override: { tier: string; expires_at?: string | null } | null | undefined,
  now: Date = new Date()
): { tier: CashbackTier; overridden: boolean } {
  if (!override?.tier) return { tier: earned, overridden: false }
  if (override.expires_at && new Date(override.expires_at).getTime() <= now.getTime()) {
    return { tier: earned, overridden: false }
  }
  const overrideTier = asCashbackTier(override.tier)
  if (overrideTier === "Verde") return { tier: earned, overridden: false }
  return { tier: overrideTier, overridden: true }
}

// ============================================================
// ESCALÓN PÚBLICO (para la landing de /restaurantes)
// ============================================================

/** Cómo se presenta un nivel hacia fuera: requisito, cashback y capacidades. */
export interface PublicTierInfo {
  tier: CashbackTier
  /** Semanas calificadas del mes que exige el nivel. */
  weeks: number
  /** % de cashback del nivel. Es un eje DISTINTO al de las capacidades. */
  cashbackPct: number
  /** Capacidades premium que abre el nivel. */
  features: FoodosFeature[]
}

/**
 * Escalón de niveles tal como se publica en la landing B2B.
 *
 * Se deriva de `TIER_LADDER` (recompensas) y de `FEATURE_MIN_TIER`
 * (capacidades), así que no hay una segunda copia de los umbrales: si mañana
 * cambia el requisito de un nivel, la landing cambia sola.
 */
export const PUBLIC_TIER_LADDER: PublicTierInfo[] = TIER_LADDER.map((step) => ({
  tier: step.tier,
  weeks: step.weeks,
  cashbackPct: step.pct,
  features: featuresForTier(step.tier),
}))

/** Gasto mínimo (MXN) que califica una semana. Único origen: `utils`. */
export { QUALIFYING_WEEK_MIN }
