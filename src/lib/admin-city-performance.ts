/**
 * Desempeño por ciudad (dashboard admin).
 *
 * `orders.city_id` existe desde el esquema inicial, pero el panel solo mostraba
 * agregados globales: no había forma de saber qué ciudades venden y cuáles no,
 * ni por qué. Aquí vive la lógica pura —agregación, score, ranking y reglas de
 * tips— para que la acción admin y sus tests no dependan de Supabase; el
 * componente solo pinta el resultado.
 *
 * El score es RELATIVO a la mejor ciudad de la ventana: no hay población ni
 * metas por ciudad en la base, así que un absoluto no sería comparable. La UI
 * lo rotula como relativo para que no se lea como un KPI entre periodos.
 */

import { sortAlertsBySeverity, type AdminAlertSeverity } from "./admin-alerts"

export type CityTier = "top" | "estable" | "atencion" | "sin_pedidos"

export type CityTipId =
  | "sin_catalogo"
  | "ciudad_sin_pedidos"
  | "inactividad"
  | "cancelaciones_altas"
  | "demanda_baja"
  | "ticket_bajo"
  | "sin_whatsapp"
  | "referencia"

export interface CityTip {
  id: CityTipId
  severity: AdminAlertSeverity
  title: string
  detail: string
  /** Deep-link a la superficie donde se arregla; `null` si es solo informativo. */
  href: string | null
}

/** Pesos del score compuesto. Suman 1. */
export const CITY_SCORE_WEIGHTS = {
  revenue: 0.4,
  orders: 0.25,
  trend: 0.2,
  quality: 0.15,
} as const

export const CITY_TIER_TOP = 70
export const CITY_TIER_ESTABLE = 45

/** % de cancelación a partir del cual la ciudad es un problema operativo. */
export const CANCEL_ALERT_RATE = 15
/** Caída de ingresos (%) a partir de la cual se sugiere una campaña. */
export const DEMAND_DROP_PCT = -25
/** Ticket por debajo de esta fracción de la mediana se considera bajo. */
export const LOW_TICKET_RATIO = 0.8
/** Cobertura por debajo de esta fracción del mejor catálogo se considera incompleta. */
export const LOW_CATALOG_RATIO = 0.4
/** Un catálogo por debajo de esto está prácticamente vacío. */
export const MIN_CATALOG_PRODUCTS = 20
/** Pedidos mínimos antes de opinar sobre el mix de WhatsApp. */
export const MIN_WHATSAPP_ORDERS = 5
/** Pedidos mínimos antes de opinar sobre cancelaciones. */
export const MIN_CANCEL_SAMPLE = 5

const CANCELLED = "cancelled"
const WHATSAPP = "whatsapp"

export interface CityOrderRow {
  city_id: number | string | null
  total: number | string | null
  status: string | null
  payment_status: string | null
  source: string | null
}

export interface CityRow {
  id: number
  name: string
  is_active?: boolean | null
}

/**
 * Disponibilidad de catálogo por ciudad.
 *
 * Semántica de `product_city_availability` (migración `00065`): un producto SIN
 * filas está disponible en TODAS las ciudades; en cuanto tiene al menos una
 * fila, solo está disponible donde `is_available = true`. Por eso la cobertura
 * de una ciudad no es "filas propias" sino:
 *
 *   (productos visibles sin ninguna fila) + (productos visibles disponibles aquí)
 *
 * Contar solo las filas `is_available = false` daría por vacío el catálogo de
 * una ciudad que simplemente no tiene excepciones.
 */
export interface CatalogAvailabilityInput {
  /** Productos visibles: denominador de la cobertura. */
  totalProducts: number
  /** Productos visibles con al menos una fila (dejaron de ser globales). */
  restrictedProducts: number
  /** Productos visibles disponibles por ciudad (`is_available = true`). */
  availableByCity: ReadonlyMap<number, number>
}

export interface CityMetrics {
  cityId: number
  name: string
  isActive: boolean
  /** Pedidos no cancelados de la ventana. */
  orders: number
  /** Todos los pedidos de la ventana, cancelados incluidos. */
  totalOrders: number
  cancelled: number
  /** Pedidos no cancelados de la ventana anterior de igual duración. */
  previousOrders: number
  /** Ingresos de pedidos pagados. */
  revenue: number
  /** Ingresos de pedidos pagados en la ventana anterior. */
  previousRevenue: number
  /** Ticket promedio sobre pedidos PAGADOS (mismo criterio que la comparativa global). */
  aov: number
  /** % (0-100) de cancelados sobre el total de la ventana. */
  cancellationRate: number
  /** % (0-100) de pedidos no cancelados que entraron por WhatsApp. */
  whatsappShare: number
  whatsappOrders: number
  ordersDeltaPct: number | null
  revenueDeltaPct: number | null
  /** Productos disponibles en la ciudad; `null` si la disponibilidad no se pudo leer. */
  catalogCoverage: number | null
}

export interface CityPerformanceRow extends CityMetrics {
  score: number
  tier: CityTier
  tips: CityTip[]
}

export interface CityPerformanceInput {
  cities: readonly CityRow[]
  currentOrders: readonly CityOrderRow[]
  previousOrders: readonly CityOrderRow[]
  /** `null` cuando `product_city_availability` no respondió: se omiten los tips de catálogo. */
  catalog?: CatalogAvailabilityInput | null
}

export interface CityPerformanceResult {
  /** Ciudades con pedidos en la ventana, ordenadas por score. */
  cities: CityPerformanceRow[]
  /** Ciudades sin pedidos en la ventana (activas primero, luego alfabético). */
  withoutOrders: CityPerformanceRow[]
  /** Ciudades con pedidos que requieren acción: peor score primero. */
  needsAttention: CityPerformanceRow[]
  medianAov: number
  maxCatalogCoverage: number | null
  totals: { withOrders: number; withoutOrders: number; revenue: number }
}

interface Aggregate {
  orders: number
  totalOrders: number
  cancelled: number
  paidOrders: number
  revenue: number
  whatsappOrders: number
}

const EMPTY_AGGREGATE: Aggregate = {
  orders: 0,
  totalOrders: 0,
  cancelled: 0,
  paidOrders: 0,
  revenue: 0,
  whatsappOrders: 0,
}

function toNumber(value: number | string | null | undefined): number {
  const n = typeof value === "number" ? value : Number(value ?? 0)
  return Number.isFinite(n) ? n : 0
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n
}

function money(value: number): string {
  return `$${Math.round(value).toLocaleString("es-MX")}`
}

/** Agrupa pedidos por ciudad. Las filas sin `city_id` válido se descartan. */
function aggregateOrders(rows: readonly CityOrderRow[]): Map<number, Aggregate> {
  const byCity = new Map<number, Aggregate>()
  for (const row of rows) {
    const cityId = Number(row.city_id)
    if (!Number.isFinite(cityId) || cityId <= 0) continue
    let agg = byCity.get(cityId)
    if (!agg) {
      agg = { ...EMPTY_AGGREGATE }
      byCity.set(cityId, agg)
    }
    agg.totalOrders += 1
    if (row.status === CANCELLED) {
      agg.cancelled += 1
      continue
    }
    agg.orders += 1
    if (row.source === WHATSAPP) agg.whatsappOrders += 1
    if (row.payment_status === "paid") {
      agg.paidOrders += 1
      agg.revenue += toNumber(row.total)
    }
  }
  return byCity
}

/** % de cambio vs el periodo anterior; `null` sin base de comparación. */
export function deltaPct(current: number, previous: number): number | null {
  if (previous <= 0) return null
  return round1(((current - previous) / previous) * 100)
}

/** Mediana de los tickets con venta; 0 si ninguna ciudad vendió. */
export function medianAov(values: readonly number[]): number {
  const sorted = values.filter((v) => v > 0).sort((a, b) => a - b)
  const count = sorted.length
  if (count === 0) return 0
  const mid = Math.floor(count / 2)
  if (count % 2 === 1) return round2(sorted[mid] ?? 0)
  return round2(((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2)
}

/**
 * Score 0-100 relativo al mejor de la ventana. Sin pedidos es 0: una ciudad que
 * no vende no puede puntuar por tendencia ni por calidad.
 */
export function scoreCity(
  input: Pick<CityMetrics, "orders" | "revenue" | "revenueDeltaPct" | "cancellationRate">,
  best: { revenue: number; orders: number }
): number {
  if (input.orders <= 0) return 0
  const revenueScore = best.revenue > 0 ? clamp01(input.revenue / best.revenue) : 0
  const ordersScore = best.orders > 0 ? clamp01(input.orders / best.orders) : 0
  // Sin base de comparación el periodo anterior se asume neutro: ni premia ni castiga.
  const trendScore =
    input.revenueDeltaPct === null ? 0.5 : clamp01((input.revenueDeltaPct + 50) / 100)
  // 0 % de cancelación ⇒ 1; 30 % o más ⇒ 0.
  const qualityScore = clamp01(1 - input.cancellationRate / 30)
  const weighted =
    CITY_SCORE_WEIGHTS.revenue * revenueScore +
    CITY_SCORE_WEIGHTS.orders * ordersScore +
    CITY_SCORE_WEIGHTS.trend * trendScore +
    CITY_SCORE_WEIGHTS.quality * qualityScore
  return Math.round(weighted * 100)
}

export function tierOf(orders: number, score: number): CityTier {
  if (orders <= 0) return "sin_pedidos"
  if (score >= CITY_TIER_TOP) return "top"
  if (score >= CITY_TIER_ESTABLE) return "estable"
  return "atencion"
}

/**
 * Cobertura de catálogo insuficiente frente a la mejor ciudad. El umbral
 * absoluto solo aplica cuando el catálogo completo da para tener 20 productos:
 * con una tienda chica, "menos de 20" no significa nada.
 */
export function needsCatalogAttention(coverage: number, maxCoverage: number): boolean {
  if (maxCoverage <= 0) return false
  if (coverage < maxCoverage * LOW_CATALOG_RATIO) return true
  return maxCoverage >= MIN_CATALOG_PRODUCTS && coverage < MIN_CATALOG_PRODUCTS
}

export interface TipContext {
  medianAov: number
  maxCatalogCoverage: number | null
}

/**
 * Tips deterministas y accionables. Cada uno apunta a la superficie donde se
 * arregla; el de IA es un extra y nunca los sustituye.
 */
export function buildCityTips(
  metrics: Omit<CityPerformanceRow, "tips">,
  context: TipContext
): CityTip[] {
  const tips: CityTip[] = []
  const productsHref = `/admin/productos?city=${metrics.cityId}`

  // Catálogo incompleto: la causa más común de "esta ciudad no vende".
  if (
    metrics.catalogCoverage !== null &&
    context.maxCatalogCoverage !== null &&
    needsCatalogAttention(metrics.catalogCoverage, context.maxCatalogCoverage)
  ) {
    tips.push({
      id: "sin_catalogo",
      severity: "critical",
      title: "Catálogo incompleto en esta ciudad",
      detail: `Solo ${metrics.catalogCoverage} productos disponibles aquí, contra ${context.maxCatalogCoverage} de la mejor ciudad. Revisa la disponibilidad por ciudad y publica los faltantes.`,
      href: productsHref,
    })
  }

  if (metrics.orders === 0 && metrics.isActive) {
    if (metrics.previousOrders > 0) {
      tips.push({
        id: "inactividad",
        severity: "warning",
        title: "Dejó de vender",
        detail: `Tuvo ${metrics.previousOrders} pedidos en el periodo anterior y ninguno en este. Revisa catálogo, zona de entrega y stock antes de invertir en promoción.`,
        href: productsHref,
      })
    } else {
      tips.push({
        id: "ciudad_sin_pedidos",
        severity: "critical",
        title: "Sin pedidos todavía",
        detail:
          "Checklist: 1) confirma que el catálogo esté publicado para esta ciudad, 2) valida la zona de entrega y el costo de envío, 3) marca los productos en el catálogo de WhatsApp.",
        href: productsHref,
      })
    }
  }

  if (metrics.totalOrders >= MIN_CANCEL_SAMPLE && metrics.cancellationRate > CANCEL_ALERT_RATE) {
    tips.push({
      id: "cancelaciones_altas",
      severity: "critical",
      title: `Cancelaciones al ${round1(metrics.cancellationRate)}%`,
      detail: `${metrics.cancelled} de ${metrics.totalOrders} pedidos se cancelaron. Revisa los motivos y confirma stock y tiempos de entrega antes de aceptar el pedido.`,
      href: "/admin/pedidos?status=cancelled",
    })
  }

  if (metrics.revenueDeltaPct !== null && metrics.revenueDeltaPct <= DEMAND_DROP_PCT) {
    tips.push({
      id: "demanda_baja",
      severity: "warning",
      title: `Ingresos ${round1(metrics.revenueDeltaPct)}% vs periodo anterior`,
      detail: `Pasó de ${money(metrics.previousRevenue)} a ${money(metrics.revenue)}. Una campaña local o una promoción de envío suele recuperar el ritmo.`,
      href: "/admin/marketing",
    })
  }

  if (metrics.aov > 0 && context.medianAov > 0 && metrics.aov < context.medianAov * LOW_TICKET_RATIO) {
    tips.push({
      id: "ticket_bajo",
      severity: "warning",
      title: "Ticket promedio por debajo de la mediana",
      detail: `Su ticket es ${money(metrics.aov)} contra ${money(context.medianAov)} de la mediana entre ciudades. Prueba combos o un mínimo de compra para envío gratis.`,
      href: "/admin/marketing",
    })
  }

  if (metrics.orders >= MIN_WHATSAPP_ORDERS && metrics.whatsappOrders === 0) {
    tips.push({
      id: "sin_whatsapp",
      severity: "info",
      title: "Ningún pedido por WhatsApp",
      detail: `${metrics.orders} pedidos y todos entraron por la web. Marca productos en el catálogo de WhatsApp para captar la demanda que ya busca por chat.`,
      href: "/admin/whatsapp",
    })
  }

  if (metrics.tier === "top") {
    tips.push({
      id: "referencia",
      severity: "info",
      title: "Ciudad de referencia",
      detail: `${money(metrics.revenue)} con ${metrics.orders} pedidos y ${round1(metrics.cancellationRate)}% de cancelación. Replica su catálogo y su operación en las ciudades que van por detrás.`,
      href: null,
    })
  }

  return sortAlertsBySeverity(tips)
}

/** Mejor score primero; empates por ingresos y luego alfabético. */
export function rankCities(rows: readonly CityPerformanceRow[]): CityPerformanceRow[] {
  return [...rows].sort(
    (a, b) =>
      b.score - a.score || b.revenue - a.revenue || a.name.localeCompare(b.name, "es-MX")
  )
}

export function buildCityPerformance(input: CityPerformanceInput): CityPerformanceResult {
  const currentAgg = aggregateOrders(input.currentOrders)
  const previousAgg = aggregateOrders(input.previousOrders)

  const catalog = input.catalog ?? null
  const totalProducts = catalog?.totalProducts ?? 0
  const globalProducts = catalog
    ? Math.max(0, catalog.totalProducts - catalog.restrictedProducts)
    : 0
  const coverageOf = (cityId: number): number | null => {
    if (!catalog) return null
    const available = globalProducts + (catalog.availableByCity.get(cityId) ?? 0)
    return Math.max(0, Math.min(totalProducts, available))
  }
  const maxCatalogCoverage = catalog
    ? input.cities.reduce((max, city) => Math.max(max, coverageOf(city.id) ?? 0), 0)
    : null

  const base: CityMetrics[] = input.cities.map((city) => {
    const cur = currentAgg.get(city.id) ?? EMPTY_AGGREGATE
    const prev = previousAgg.get(city.id) ?? EMPTY_AGGREGATE
    const revenue = round2(cur.revenue)
    const previousRevenue = round2(prev.revenue)
    return {
      cityId: city.id,
      name: city.name,
      isActive: city.is_active !== false,
      orders: cur.orders,
      totalOrders: cur.totalOrders,
      cancelled: cur.cancelled,
      previousOrders: prev.orders,
      revenue,
      previousRevenue,
      aov: cur.paidOrders > 0 ? round2(cur.revenue / cur.paidOrders) : 0,
      cancellationRate: cur.totalOrders > 0 ? round1((cur.cancelled / cur.totalOrders) * 100) : 0,
      whatsappShare: cur.orders > 0 ? round1((cur.whatsappOrders / cur.orders) * 100) : 0,
      whatsappOrders: cur.whatsappOrders,
      ordersDeltaPct: deltaPct(cur.orders, prev.orders),
      revenueDeltaPct: deltaPct(revenue, previousRevenue),
      catalogCoverage: coverageOf(city.id),
    }
  })

  const best = {
    revenue: base.reduce((max, c) => Math.max(max, c.revenue), 0),
    orders: base.reduce((max, c) => Math.max(max, c.orders), 0),
  }
  const median = medianAov(base.map((c) => c.aov))
  const context: TipContext = { medianAov: median, maxCatalogCoverage }

  const rows: CityPerformanceRow[] = base.map((metrics) => {
    const score = scoreCity(metrics, best)
    const partial = { ...metrics, score, tier: tierOf(metrics.orders, score) }
    return { ...partial, tips: buildCityTips(partial, context) }
  })

  const cities = rankCities(rows.filter((row) => row.orders > 0))
  const withoutOrders = rows
    .filter((row) => row.orders === 0)
    .sort((a, b) => {
      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1
      return a.name.localeCompare(b.name, "es-MX")
    })

  // Peor primero: es la lista de trabajo, no un ranking.
  const needsAttention = cities
    .filter((row) => row.tier === "atencion" || row.tips.some((tip) => tip.severity === "critical"))
    .sort(
      (a, b) => a.score - b.score || b.revenue - a.revenue || a.name.localeCompare(b.name, "es-MX")
    )

  return {
    cities,
    withoutOrders,
    needsAttention,
    medianAov: median,
    maxCatalogCoverage,
    totals: {
      withOrders: cities.length,
      withoutOrders: withoutOrders.length,
      revenue: round2(cities.reduce((sum, row) => sum + row.revenue, 0)),
    },
  }
}
