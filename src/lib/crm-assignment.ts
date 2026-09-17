/**
 * Reparto de prospectos entre vendedores y métricas de servicio (SLA) de la
 * bandeja de WhatsApp.
 *
 * Reglas duras:
 *
 * 1. REPARTO DETERMINISTA. Dos ejecuciones con las mismas entradas producen el
 *    mismo resultado. Todo empate se rompe por `sellerId` ascendente, nunca por
 *    el orden en que Postgres devolvió las filas: un reparto que cambia solo es
 *    imposible de auditar y de explicar al vendedor que recibió el prospecto.
 *
 * 2. `null` ≠ 0. Una mediana sin datos es `null` ("no medido"), no 0 minutos.
 *    Por eso NO se reutiliza `medianAov()` de `admin-city-performance.ts`: esa
 *    descarta los ceros (`v > 0`), y aquí 0 minutos es una respuesta instantánea
 *    legítima, el mejor caso posible.
 *
 * Módulo puro: sin Supabase y sin React.
 */

import { isFollowUpDue, type CrmProspect } from "@/lib/crm-pipeline"
import {
  INBOX_BUCKETS,
  INBOX_BUCKET_LABEL,
  firstResponseMinutes,
  type ConversationThread,
  type InboxBucket,
} from "@/lib/crm-inbox"

// ============================================================
// Estrategias de reparto
// ============================================================

export const ASSIGNMENT_STRATEGIES = ["round_robin", "least_loaded", "by_city"] as const
export type AssignmentStrategy = (typeof ASSIGNMENT_STRATEGIES)[number]

export const ASSIGNMENT_STRATEGY_LABEL: Record<AssignmentStrategy, string> = {
  round_robin: "Reparto circular",
  least_loaded: "Menos cargado",
  by_city: "Por ciudad",
}

export function isAssignmentStrategy(value: string): value is AssignmentStrategy {
  return (ASSIGNMENT_STRATEGIES as readonly string[]).includes(value)
}

/** Vendedor candidato a recibir prospectos. */
export interface SellerRef {
  id: string
  name: string
  city_id: number | null
}

/**
 * Prospecto a repartir. `city_id` es opcional porque la columna existe en la
 * tabla pero no todo consumidor la selecciona (el tablero no la necesita).
 */
export interface AssignableProspect extends CrmProspect {
  city_id?: number | null
}

/** Estados que ya no se reparten: cerrar un prospecto no genera trabajo nuevo. */
const CLOSED_STATUSES: readonly string[] = ["inactivo", "perdido"]

/**
 * ¿El prospecto sigue siendo trabajo pendiente?
 *
 * Un estado desconocido se trata como abierto: es preferible repartirlo de más a
 * dejar una ficha huérfana por un valor que no está en el CHECK.
 */
export function isOpenProspect(prospect: Pick<CrmProspect, "status">): boolean {
  return !CLOSED_STATUSES.includes(prospect.status)
}

// ============================================================
// Carga por vendedor
// ============================================================

export interface SellerLoad {
  sellerId: string
  name: string
  cityId: number | null
  /** Prospectos abiertos: es lo que mide "qué tan cargado está". */
  open: number
  /** Prospectos asignados en total, incluidos los cerrados. */
  total: number
  /** De los abiertos, los que tienen seguimiento vencido. */
  overdue: number
}

/**
 * Carga real de cada vendedor.
 *
 * El reparto por "menos cargado" se apoya en `open` y no en `total`: contar
 * clientes activos y perdidos castigaría al vendedor que más ha cerrado.
 */
export function buildSellerLoad(
  sellers: readonly SellerRef[],
  prospects: readonly AssignableProspect[],
  now: Date = new Date(),
): SellerLoad[] {
  const load = new Map<string, SellerLoad>()
  for (const seller of sellers) {
    load.set(seller.id, {
      sellerId: seller.id,
      name: seller.name,
      cityId: seller.city_id,
      open: 0,
      total: 0,
      overdue: 0,
    })
  }

  for (const prospect of prospects) {
    if (!prospect.seller_id) continue
    const entry = load.get(prospect.seller_id)
    if (!entry) continue
    entry.total += 1
    if (!isOpenProspect(prospect)) continue
    entry.open += 1
    if (isFollowUpDue(prospect.next_follow_up_at, now)) entry.overdue += 1
  }

  return [...load.values()]
}

/** Orden estable: menos abiertos primero, empates por id ascendente. */
function byOpenThenId(a: SellerLoad, b: SellerLoad): number {
  if (a.open !== b.open) return a.open - b.open
  return a.sellerId < b.sellerId ? -1 : a.sellerId > b.sellerId ? 1 : 0
}

function byId(a: SellerRef, b: SellerRef): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

// ============================================================
// Reparto
// ============================================================

export interface Assignment {
  prospectId: number
  sellerId: string
  sellerName: string
  strategy: AssignmentStrategy
  /** Por qué le tocó a ese vendedor. Se muestra en la interfaz. */
  reason: string
}

export interface DistributeOptions {
  strategy?: AssignmentStrategy
  now?: Date
}

/**
 * Reparte prospectos SIN ASIGNAR entre los vendedores.
 *
 * Solo entran los que tienen `seller_id === null` y siguen abiertos: reasignar a
 * mano es otra acción (y otra decisión), no un reparto automático.
 *
 * Sin vendedores candidatos devuelve `[]`: es mejor no asignar que inventar.
 */
export function distributeProspects(
  prospects: readonly AssignableProspect[],
  sellers: readonly SellerRef[],
  options: DistributeOptions = {},
): Assignment[] {
  const strategy = options.strategy ?? "round_robin"
  const now = options.now ?? new Date()
  if (sellers.length === 0) return []

  const pending = prospects.filter((p) => p.seller_id === null && isOpenProspect(p))
  if (pending.length === 0) return []

  const load = buildSellerLoad(sellers, prospects, now)
  const loadById = new Map(load.map((l) => [l.sellerId, l]))
  const ordered = [...sellers].sort(byId)

  const assignments: Assignment[] = []

  pending.forEach((prospect, index) => {
    const picked = pickSeller(prospect, strategy, ordered, loadById, index)
    if (!picked) return
    const { seller, reason } = picked

    assignments.push({
      prospectId: prospect.id,
      sellerId: seller.id,
      sellerName: seller.name,
      strategy,
      reason,
    })

    // La carga se actualiza en el momento: dos prospectos seguidos no caen en el
    // mismo vendedor "menos cargado" por leer una foto vieja.
    const entry = loadById.get(seller.id)
    if (entry) entry.open += 1
  })

  return assignments
}

function pickSeller(
  prospect: AssignableProspect,
  strategy: AssignmentStrategy,
  ordered: readonly SellerRef[],
  loadById: ReadonlyMap<string, SellerLoad>,
  index: number,
): { seller: SellerRef; reason: string } | null {
  if (strategy === "round_robin") {
    // Circular por orden de id: el reparto depende solo del índice, no del azar.
    const seller = ordered[index % ordered.length]
    if (!seller) return null
    return {
      seller,
      reason: `${ASSIGNMENT_STRATEGY_LABEL.round_robin}: turno ${(index % ordered.length) + 1} de ${ordered.length}`,
    }
  }

  if (strategy === "by_city") {
    const cityId = prospect.city_id ?? null
    if (cityId !== null) {
      const sameCity = ordered.filter((s) => s.city_id === cityId)
      const best = leastLoaded(sameCity, loadById)
      if (best) {
        return {
          seller: best,
          reason: `${ASSIGNMENT_STRATEGY_LABEL.by_city}: ${loadById.get(best.id)?.open ?? 0} abiertos en la misma ciudad`,
        }
      }
    }
    // Sin vendedor en esa ciudad se cae a "menos cargado": dejar el prospecto
    // sin repartir por una ciudad mal capturada sería peor.
    const fallback = leastLoaded(ordered, loadById)
    if (!fallback) return null
    return {
      seller: fallback,
      reason:
        cityId === null
          ? "Sin ciudad en el prospecto: se usó el menos cargado"
          : "Sin vendedor en esa ciudad: se usó el menos cargado",
    }
  }

  const best = leastLoaded(ordered, loadById)
  if (!best) return null
  return {
    seller: best,
    reason: `${ASSIGNMENT_STRATEGY_LABEL.least_loaded}: ${loadById.get(best.id)?.open ?? 0} abiertos`,
  }
}

function leastLoaded(
  candidates: readonly SellerRef[],
  loadById: ReadonlyMap<string, SellerLoad>,
): SellerRef | null {
  const known = candidates.filter((s) => loadById.has(s.id))
  const sorted = [...known].sort((a, b) => {
    const la = loadById.get(a.id)
    const lb = loadById.get(b.id)
    if (!la || !lb) return byId(a, b)
    return byOpenThenId(la, lb)
  })
  return sorted[0] ?? null
}

/**
 * Explicación en español de por qué un prospecto ya asignado le tocó a quien le
 * tocó. Es el texto que se muestra al pasar el cursor por la etiqueta del
 * vendedor; sin esto, el reparto automático parece arbitrario.
 */
export function assignmentReason(strategy: AssignmentStrategy, load: SellerLoad | null): string {
  const label = ASSIGNMENT_STRATEGY_LABEL[strategy]
  if (!load) return label
  return `${label}: ${load.open} abiertos, ${load.overdue} con seguimiento vencido`
}

// ============================================================
// SLA de la bandeja
// ============================================================

export interface SlaBucket {
  key: InboxBucket
  label: string
  count: number
}

export interface SlaBoard {
  buckets: SlaBucket[]
  /** Prospectos sin ningún mensaje: no están en la bandeja, se cuentan aparte. */
  sinConversacion: number
  /** Conversaciones que esperan respuesta nuestra ahora mismo. */
  pendientes: number
}

/**
 * Tablero de SLA de la bandeja: cuántas conversaciones hay en cada estado.
 *
 * Los prospectos sin conversación NO se meten en "ventana cerrada": no es que la
 * ventana se haya vencido, es que nunca hubo mensaje. Mezclarlos inflaría el
 * indicador de conversaciones abandonadas con fichas que nadie ha contactado.
 */
export function buildSlaBoard(threads: readonly ConversationThread[]): SlaBoard {
  const counts = new Map<InboxBucket, number>(INBOX_BUCKETS.map((b) => [b, 0]))
  let sinConversacion = 0

  for (const thread of threads) {
    if (thread.bucket === null) {
      sinConversacion += 1
      continue
    }
    counts.set(thread.bucket, (counts.get(thread.bucket) ?? 0) + 1)
  }

  return {
    buckets: INBOX_BUCKETS.map((key) => ({
      key,
      label: INBOX_BUCKET_LABEL[key],
      count: counts.get(key) ?? 0,
    })),
    sinConversacion,
    pendientes: counts.get("sin_responder") ?? 0,
  }
}

export interface FirstResponseStats {
  /** Conversaciones con primera respuesta medible. Es el denominador. */
  measured: number
  /** Conversaciones con cliente que escribió y todavía sin respuesta. */
  pending: number
  /** Conversaciones sin ningún mensaje del cliente: no hay nada que medir. */
  unmeasured: number
  medianMinutes: number | null
  p90Minutes: number | null
  /** La más rápida y la más lenta, para explicar el rango sin abrir el detalle. */
  bestMinutes: number | null
  worstMinutes: number | null
}

/**
 * Estadísticas del tiempo de primera respuesta.
 *
 * El denominador son solo las conversaciones donde el cliente escribió. Un
 * prospecto que nunca escribió no aporta un "0 minutos": aporta nada, y contarlo
 * como 0 haría que el panel presumiera de un SLA que no existe.
 */
export function firstResponseStats(
  threads: readonly ConversationThread[],
): FirstResponseStats {
  const values: number[] = []
  let pending = 0
  let unmeasured = 0

  for (const thread of threads) {
    const minutes = firstResponseMinutes(thread.messages)
    if (minutes !== null) {
      values.push(minutes)
      continue
    }
    // Sin entrantes no hay nada que medir; con entrantes y sin respuesta, sí hay
    // una promesa incumplida y se cuenta como pendiente.
    if (thread.messages.some((m) => m.direction === "inbound")) pending += 1
    else unmeasured += 1
  }

  if (values.length === 0) {
    return {
      measured: 0,
      pending,
      unmeasured,
      medianMinutes: null,
      p90Minutes: null,
      bestMinutes: null,
      worstMinutes: null,
    }
  }

  const sorted = [...values].sort((a, b) => a - b)
  return {
    measured: sorted.length,
    pending,
    unmeasured,
    medianMinutes: percentile(sorted, 50),
    p90Minutes: percentile(sorted, 90),
    bestMinutes: sorted[0] ?? null,
    worstMinutes: sorted[sorted.length - 1] ?? null,
  }
}

/**
 * Percentil por interpolación lineal (método de Excel `PERCENTILE.INC`).
 *
 * `values` debe venir ordenado. Devuelve `null` con la lista vacía: sin datos no
 * hay percentil, y devolver 0 sería afirmar que respondimos al instante.
 */
export function percentile(sorted: readonly number[], p: number): number | null {
  const count = sorted.length
  if (count === 0) return null
  if (count === 1) return sorted[0] ?? null

  const clamped = Math.min(100, Math.max(0, p))
  const rank = (clamped / 100) * (count - 1)
  const lower = Math.floor(rank)
  const upper = Math.ceil(rank)
  const low = sorted[lower]
  const high = sorted[upper]
  if (low === undefined || high === undefined) return null
  if (lower === upper) return low
  return low + (high - low) * (rank - lower)
}

/**
 * Minutos en texto compacto: `45 min`, `3 h 20 min`, `2 d 4 h`.
 *
 * `null` se pinta como "—" en la interfaz, nunca como "0 min".
 */
export function formatMinutes(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined || !Number.isFinite(minutes)) return "—"
  const total = Math.max(0, Math.round(minutes))
  if (total < 60) return `${total} min`

  const hours = Math.floor(total / 60)
  const rest = total % 60
  if (hours < 24) return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`

  const days = Math.floor(hours / 24)
  const restHours = hours % 24
  return restHours === 0 ? `${days} d` : `${days} d ${restHours} h`
}
