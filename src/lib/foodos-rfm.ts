// ============================================================
// Audiencias RFM de FoodOS (núcleo puro).
//
// Módulo SIN dependencias de servidor ni de React: recibe clientes y
// devuelve puntajes y audiencias. Es la única fuente de verdad de la
// segmentación fina; el `segment` de la tabla (nuevo | recurrente | vip |
// inactivo) sigue existiendo porque lo mantiene un trigger de la BD y lo
// usan consultas SQL, pero la audiencia RFM se calcula en vivo aquí.
//
// Por qué importa: "inactivo" no distingue a un cliente que gastaba mucho
// y se fue de uno que probó una vez y nunca volvió. Para decidir a quién
// mandarle un cupón, la diferencia es todo el negocio.
// ============================================================

import type {
  FoodosCustomer,
  FoodosCustomerSegment,
  FoodosMarketingChannel,
} from "@/types/foodos"
import type { LocalDateParts } from "@/lib/local-date"

/** Puntaje RFM de 1 (peor) a 5 (mejor). */
export type RfmScoreValue = 1 | 2 | 3 | 4 | 5

export type FoodosAudienceKey =
  | "champions"
  | "cant_lose"
  | "at_risk"
  | "loyal"
  | "potential_loyalist"
  | "new"
  | "needs_attention"
  | "about_to_sleep"
  | "hibernating"
  | "lost"

/**
 * Orden canónico de las audiencias. Debe coincidir con el CHECK
 * `foodos_automations_audience_check` de la migración 00123
 * (hay un test que lo verifica).
 */
export const FOODOS_AUDIENCE_KEYS: readonly FoodosAudienceKey[] = [
  "champions",
  "cant_lose",
  "at_risk",
  "loyal",
  "potential_loyalist",
  "new",
  "needs_attention",
  "about_to_sleep",
  "hibernating",
  "lost",
] as const

export function isAudienceKey(value: unknown): value is FoodosAudienceKey {
  return (
    typeof value === "string" &&
    (FOODOS_AUDIENCE_KEYS as readonly string[]).includes(value)
  )
}

export interface RfmScore {
  /** Recencia (1 = hace mucho que no compra, 5 = acaba de comprar). */
  r: RfmScoreValue
  /** Frecuencia (1 = pocas compras, 5 = muchas). */
  f: RfmScoreValue
  /** Monetario (1 = gasta poco, 5 = gasta mucho). */
  m: RfmScoreValue
  /** Suma de los tres, 3..15. Sirve para ordenar el CRM. */
  total: number
  /** Días desde la última compra. `null` si nunca compró. */
  daysSinceLastOrder: number | null
  audience: FoodosAudienceKey
}

// ------------------------------------------------------------
// Puntajes
// ------------------------------------------------------------

/**
 * Puntaje por percentil sobre una cohorte ordenada de menor a mayor.
 *
 * Se usa el rango relativo (`rank / (n - 1)`) en vez de cortes fijos:
 * un restaurante con 12 clientes y otro con 3,000 obtienen quintiles
 * útiles sin configurar umbrales por restaurante.
 */
function percentileScore(sortedAsc: readonly number[], value: number): RfmScoreValue {
  const n = sortedAsc.length
  if (n <= 1) return 3
  let rank = 0
  for (const v of sortedAsc) {
    if (v < value) rank++
  }
  const pct = rank / (n - 1)
  if (pct >= 0.8) return 5
  if (pct >= 0.6) return 4
  if (pct >= 0.4) return 3
  if (pct >= 0.2) return 2
  return 1
}

function daysBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / 86_400_000
}

/**
 * Traduce (r, f, m) a una audiencia. Precedencia de primera coincidencia:
 * el orden importa porque las definiciones clásicas de RFM se solapan
 * (un cliente "en riesgo" también cumple "leal" por gasto histórico).
 */
export function audienceForScore(
  r: RfmScoreValue,
  f: RfmScoreValue,
  m: RfmScoreValue
): FoodosAudienceKey {
  if (r >= 4 && f >= 4 && m >= 4) return "champions"
  if (r <= 2 && f >= 4 && m >= 4) return "cant_lose"
  if (r <= 2 && f >= 3 && m >= 3) return "at_risk"
  if (r >= 3 && f >= 3) return "loyal"
  if (r >= 4 && f >= 2) return "potential_loyalist"
  if (r >= 4) return "new"
  if (r === 3) return "needs_attention"
  if (r === 2) return "about_to_sleep"
  if (f >= 2) return "hibernating"
  return "lost"
}

/** Clientes con los que se puede puntuar (mínimo: haber comprado). */
type Scoreable = Pick<
  FoodosCustomer,
  "id" | "total_orders" | "total_spend" | "last_order_at"
>

/**
 * Puntúa a toda la cohorte. Los clientes sin ninguna compra no tienen
 * historial del que sacar percentiles: su recencia se fija en 1 (la peor),
 * así que caen en las audiencias de recuperación en vez de en `new`.
 */
export function scoreCustomers(
  customers: readonly Scoreable[],
  now: Date = new Date()
): Map<string, RfmScore> {
  const recency: number[] = []
  const frequency: number[] = []
  const monetary: number[] = []

  const daysById = new Map<string, number | null>()
  for (const c of customers) {
    const days = c.last_order_at
      ? daysBetween(new Date(c.last_order_at), now)
      : null
    daysById.set(c.id, days)
    if (days !== null) recency.push(days)
    frequency.push(c.total_orders)
    monetary.push(Number(c.total_spend))
  }

  recency.sort((a, b) => a - b)
  frequency.sort((a, b) => a - b)
  monetary.sort((a, b) => a - b)

  const out = new Map<string, RfmScore>()
  for (const c of customers) {
    const days = daysById.get(c.id) ?? null
    // Menos días es mejor: se invierte el percentil para que 5 = más reciente.
    const r: RfmScoreValue = days === null ? 1 : ((6 - percentileScore(recency, days)) as RfmScoreValue)
    const f = percentileScore(frequency, c.total_orders)
    const m = percentileScore(monetary, Number(c.total_spend))
    out.set(c.id, {
      r,
      f,
      m,
      total: r + f + m,
      daysSinceLastOrder: days,
      audience: audienceForScore(r, f, m),
    })
  }
  return out
}

// ------------------------------------------------------------
// Audiencias
// ------------------------------------------------------------

export interface AudiencePlaybook {
  /** Canal que mejor rinde para esta audiencia. */
  channel: FoodosMarketingChannel
  /** Descuento sugerido al crear la automatización. */
  offerPct: number
  /** Urgencia de la acción, para ordenar la lista en el panel. */
  priority: 1 | 2 | 3
  /** Clave i18n del nombre visible. */
  labelKey: string
  /** Clave i18n de la acción recomendada. */
  actionKey: string
}

export const AUDIENCE_PLAYBOOK: Record<FoodosAudienceKey, AudiencePlaybook> = {
  champions: {
    channel: "whatsapp",
    offerPct: 0,
    priority: 3,
    labelKey: "foodos.marketing.audienceChampions",
    actionKey: "foodos.marketing.actionChampions",
  },
  cant_lose: {
    channel: "whatsapp",
    offerPct: 20,
    priority: 1,
    labelKey: "foodos.marketing.audienceCantLose",
    actionKey: "foodos.marketing.actionCantLose",
  },
  at_risk: {
    channel: "whatsapp",
    offerPct: 15,
    priority: 1,
    labelKey: "foodos.marketing.audienceAtRisk",
    actionKey: "foodos.marketing.actionAtRisk",
  },
  loyal: {
    channel: "whatsapp",
    offerPct: 10,
    priority: 3,
    labelKey: "foodos.marketing.audienceLoyal",
    actionKey: "foodos.marketing.actionLoyal",
  },
  potential_loyalist: {
    channel: "whatsapp",
    offerPct: 10,
    priority: 2,
    labelKey: "foodos.marketing.audiencePotential",
    actionKey: "foodos.marketing.actionPotential",
  },
  new: {
    channel: "whatsapp",
    offerPct: 10,
    priority: 2,
    labelKey: "foodos.marketing.audienceNew",
    actionKey: "foodos.marketing.actionNew",
  },
  needs_attention: {
    channel: "whatsapp",
    offerPct: 10,
    priority: 2,
    labelKey: "foodos.marketing.audienceNeedsAttention",
    actionKey: "foodos.marketing.actionNeedsAttention",
  },
  about_to_sleep: {
    channel: "whatsapp",
    offerPct: 15,
    priority: 2,
    labelKey: "foodos.marketing.audienceAboutToSleep",
    actionKey: "foodos.marketing.actionAboutToSleep",
  },
  hibernating: {
    channel: "both",
    offerPct: 20,
    priority: 2,
    labelKey: "foodos.marketing.audienceHibernating",
    actionKey: "foodos.marketing.actionHibernating",
  },
  lost: {
    channel: "both",
    offerPct: 25,
    priority: 3,
    labelKey: "foodos.marketing.audienceLost",
    actionKey: "foodos.marketing.actionLost",
  },
}

export interface AudienceSummary {
  key: FoodosAudienceKey
  playbook: AudiencePlaybook
  count: number
  /** Gasto histórico acumulado del grupo. */
  revenue: number
  /** Ticket promedio histórico del grupo. */
  avgSpend: number
  /** ¿Cuántos de este grupo tienen teléfono usable? */
  reachable: number
}

function hasUsablePhone(phone: string | null | undefined): boolean {
  return (phone ?? "").replace(/\D/g, "").length >= 10
}

/**
 * Resumen por audiencia, ordenado por prioridad y luego por tamaño.
 * Solo devuelve audiencias con al menos un miembro.
 */
export function buildAudiences(
  customers: readonly FoodosCustomer[],
  now: Date = new Date()
): AudienceSummary[] {
  const scores = scoreCustomers(customers, now)
  const buckets = new Map<FoodosAudienceKey, FoodosCustomer[]>()

  for (const c of customers) {
    const key = scores.get(c.id)?.audience ?? "new"
    const bucket = buckets.get(key)
    if (bucket) bucket.push(c)
    else buckets.set(key, [c])
  }

  const out: AudienceSummary[] = []
  for (const key of FOODOS_AUDIENCE_KEYS) {
    const members = buckets.get(key)
    if (!members || members.length === 0) continue
    const revenue = members.reduce((s, c) => s + Number(c.total_spend), 0)
    const orders = members.reduce((s, c) => s + c.total_orders, 0)
    out.push({
      key,
      playbook: AUDIENCE_PLAYBOOK[key],
      count: members.length,
      revenue,
      avgSpend: orders > 0 ? revenue / orders : 0,
      reachable: members.filter((c) => hasUsablePhone(c.phone)).length,
    })
  }

  return out.sort(
    (a, b) => a.playbook.priority - b.playbook.priority || b.count - a.count
  )
}

/** Miembros de una audiencia concreta (para apuntar una campaña). */
export function audienceMembers(
  customers: readonly FoodosCustomer[],
  audience: FoodosAudienceKey,
  now: Date = new Date()
): FoodosCustomer[] {
  const scores = scoreCustomers(customers, now)
  return customers.filter((c) => (scores.get(c.id)?.audience ?? "new") === audience)
}

/**
 * Traduce el `segment` simple (el que mantiene el trigger) a la audiencia
 * RFM más parecida. Es el puente para no romper automatizaciones creadas
 * antes de esta fase, que solo traen `trigger_config.target_segment`.
 */
export const SEGMENT_TO_AUDIENCE: Record<FoodosCustomerSegment, FoodosAudienceKey> = {
  nuevo: "new",
  recurrente: "loyal",
  vip: "champions",
  inactivo: "at_risk",
}

// ------------------------------------------------------------
// Fechas locales del restaurante
// ------------------------------------------------------------
// Viven en `src/lib/local-date.ts` porque también las usa la Flotilla de
// reparto (turnos de repartidor, KPIs del día). Se re-exportan aquí para no
// romper a quien ya las importaba desde este módulo.

export { localDateParts } from "@/lib/local-date"
export type { LocalDateParts } from "@/lib/local-date"

/** ¿Es hoy el cumpleaños (mes/día) en la fecha local dada? (puro) */
export function isBirthdayToday(
  birthday: string | null | undefined,
  parts: LocalDateParts
): boolean {
  if (!birthday) return false
  const [, month, day] = birthday.split("-").map(Number)
  if (!month || !day) return false
  return month === parts.month && day === parts.day
}

/** Mes de cumpleaños (1..12) o `null` si no hay fecha usable. */
export function birthdayMonth(birthday: string | null | undefined): number | null {
  if (!birthday) return null
  const [, month] = birthday.split("-").map(Number)
  return month && month >= 1 && month <= 12 ? month : null
}

// ------------------------------------------------------------
// Carrito abandonado
// ------------------------------------------------------------

export interface AbandonedOrderCandidate {
  customer_id: string
  created_at: string
  total: number
}

/**
 * Un pedido cuenta como carrito abandonado si sigue sin pagarse después
 * de `hoursAfter` horas y el cliente no ha vuelto a comprar desde entonces.
 *
 * No hace falta instrumentar el carrito del storefront: un pedido creado
 * con `payment_status = 'pending'` ES un checkout iniciado y no terminado.
 */
export function filterAbandonedCarts(
  orders: readonly AbandonedOrderCandidate[],
  customers: readonly Pick<FoodosCustomer, "id" | "last_order_at">[],
  opts: { hoursAfter: number; maxAgeDays?: number; now?: Date }
): AbandonedOrderCandidate[] {
  const now = opts.now ?? new Date()
  const hoursAfter = Number.isFinite(opts.hoursAfter) ? opts.hoursAfter : 2
  const maxAgeDays = opts.maxAgeDays ?? 7
  const lastOrderById = new Map(customers.map((c) => [c.id, c.last_order_at]))

  // El más reciente primero: si hay varios abandonos, se usa el último.
  const sorted = [...orders].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )

  const seen = new Set<string>()
  const out: AbandonedOrderCandidate[] = []
  for (const order of sorted) {
    if (seen.has(order.customer_id)) continue
    const created = new Date(order.created_at).getTime()
    if (Number.isNaN(created)) continue
    const hoursSince = (now.getTime() - created) / 3_600_000
    if (hoursSince < hoursAfter) continue
    if (hoursSince > maxAgeDays * 24) continue
    // Si el cliente compró después de abandonar, ya volvió: no molestar.
    const lastOrder = lastOrderById.get(order.customer_id)
    if (lastOrder && new Date(lastOrder).getTime() > created + 1_000) continue
    seen.add(order.customer_id)
    out.push(order)
  }
  return out
}
