import { getNextDays, type DeliveryDay } from "@/lib/delivery-days"
import { DEFAULT_TIMEZONE, dayKeyOf, minutesOfDay, parseHhMm } from "@/lib/local-date"

// ============================================================
// Franjas horarias de entrega con hora de corte (Ola 7)
// ============================================================
// Fuente ÚNICA de las franjas de entrega de la tienda. Antes la
// lista vivía dos veces: `DELIVERY_TIMES` en el checkout web
// (checkout-shared.tsx) y su espejo `DELIVERY_WINDOWS` en el
// flujo de WhatsApp (whatsapp-order-flow.ts), con un comentario
// pidiendo sincronizarlas a mano. Ahora ambas superficies —y el
// panel, y la validación del servidor— leen de aquí.
//
// Sobre esa lista se monta la configuración del panel
// (/admin/entregas, migración 00236): qué franjas se ofrecen cada
// día de la semana, una hora de corte opcional y una capacidad
// opcional por franja.
//
// LA REGLA QUE NO SE ROMPE: la configuración por defecto es
// exactamente el comportamiento histórico —las 6 franjas todos
// los días, sin corte y sin capacidad— y las reglas de corte
// SOLO actúan cuando el panel configura una hora de corte. Sin
// tocar la configuración, la web ofrece los mismos 7 días × 6
// franjas de siempre y WhatsApp arma las mismas opciones de
// siempre (su regla propia de «primera franja que aún no empieza
// hoy» no depende del corte: vive en el constructor de opciones
// de whatsapp-order-flow.ts).
// ============================================================

export interface DeliverySlot {
  /** Id estable de la franja; es lo que guarda la configuración. */
  id: string
  /** Hora local de inicio, `HH:MM`. Es la que arma `scheduled_for`. */
  start: string
  /** Hora local de fin, `HH:MM`. */
  end: string
  /** Minutos del día del inicio (0–1439). */
  startMinutes: number
  /** Hora de inicio en 0–23 (la usa la regla histórica de WhatsApp). */
  startHour: number
  /** Etiqueta visible, con el formato histórico de la web. */
  label: string
}

const slot = (id: string, start: string, end: string, label: string): DeliverySlot => ({
  id,
  start,
  end,
  startMinutes: parseHhMm(start) ?? 0,
  startHour: Number(start.slice(0, 2)),
  label,
})

/** Las 6 franjas de siempre: bloques de 2 horas, 8:00–20:00. */
export const DELIVERY_SLOTS: readonly DeliverySlot[] = [
  slot("08-10", "08:00", "10:00", "8:00 AM — 10:00 AM"),
  slot("10-12", "10:00", "12:00", "10:00 AM — 12:00 PM"),
  slot("12-14", "12:00", "14:00", "12:00 PM — 2:00 PM"),
  slot("14-16", "14:00", "16:00", "2:00 PM — 4:00 PM"),
  slot("16-18", "16:00", "18:00", "4:00 PM — 6:00 PM"),
  slot("18-20", "18:00", "20:00", "6:00 PM — 8:00 PM"),
]

export const ALL_DELIVERY_SLOT_IDS: readonly string[] = DELIVERY_SLOTS.map((s) => s.id)

const SLOT_BY_ID = new Map(DELIVERY_SLOTS.map((s) => [s.id, s]))
const SLOT_BY_START = new Map(DELIVERY_SLOTS.map((s) => [s.start, s]))

/** La franja cuyo inicio es `HH:MM` (lo que `extractTime` saca de la etiqueta). */
export function findDeliverySlotByStart(start: string): DeliverySlot | undefined {
  return SLOT_BY_START.get(start)
}

// ============================================================
// Configuración (la que edita el panel)
// ============================================================

export interface DeliverySlotsConfig {
  /**
   * Hora de corte local `HH:MM`, o `null` = sin corte (el
   * comportamiento histórico). Con corte configurado:
   * - un pedido que llega a la hora de corte o después ya no
   *   alcanza ninguna franja de HOY: se ofrece desde el siguiente
   *   día con entregas;
   * - una franja de hoy que ya empezó está cortada, aunque el
   *   pedido llegue antes de la hora de corte general.
   */
  cutoffTime: string | null
  /** Pedidos máximos por franja y día; `null` = sin límite. */
  capacityPerSlot: number | null
  /**
   * Franjas ofrecidas por día de la semana: índice 0 = domingo …
   * 6 = sábado (el `getUTCDay()` del día). Lista vacía = ese día
   * no hay entregas.
   */
  week: string[][]
}

/** La configuración histórica: todo ofrecido, sin corte ni capacidad. */
export const DEFAULT_DELIVERY_SLOTS_CONFIG: DeliverySlotsConfig = {
  cutoffTime: null,
  capacityPerSlot: null,
  week: Array.from({ length: 7 }, () => [...ALL_DELIVERY_SLOT_IDS]),
}

const HH_MM_RE = /^([01]\d|2[0-3]):[0-5]\d$/

/**
 * Normaliza lo que venga de la base o del panel a una config
 * válida. Tolerante a propósito (patrón del repo): un valor que
 * no se sabe leer degrada a su default en vez de romper el
 * checkout — ids de franja desconocidos se descartan, un día
 * ausente se lee como «todas las franjas» SOLO en la forma
 * corta (array de menos de 7 se completa con el default de ese
 * día), la capacidad se acota a 1–200 y la hora de corte exige
 * formato `HH:MM`.
 */
export function normalizeDeliverySlotsConfig(raw: unknown): DeliverySlotsConfig {
  if (!raw || typeof raw !== "object") return structuredClone(DEFAULT_DELIVERY_SLOTS_CONFIG)
  const obj = raw as Record<string, unknown>

  const cutoffTime =
    typeof obj.cutoffTime === "string" && HH_MM_RE.test(obj.cutoffTime) ? obj.cutoffTime : null

  const capacityRaw = obj.capacityPerSlot
  const capacityPerSlot =
    typeof capacityRaw === "number" && Number.isFinite(capacityRaw)
      ? Math.min(200, Math.max(1, Math.floor(capacityRaw)))
      : null

  const weekRaw = Array.isArray(obj.week) ? obj.week : []
  const week: string[][] = Array.from({ length: 7 }, (_, day) => {
    const entry = weekRaw[day]
    if (!Array.isArray(entry)) return [...ALL_DELIVERY_SLOT_IDS]
    const seen = new Set<string>()
    const ids: string[] = []
    for (const value of entry) {
      if (typeof value === "string" && SLOT_BY_ID.has(value) && !seen.has(value)) {
        seen.add(value)
        ids.push(value)
      }
    }
    // El orden visible es el de DELIVERY_SLOTS, no el del JSON.
    return ALL_DELIVERY_SLOT_IDS.filter((id) => seen.has(id))
  })

  return { cutoffTime, capacityPerSlot, week }
}

/** ¿La config es la histórica? Con ella el servidor ni valida: cero cambio. */
export function isDefaultDeliverySlotsConfig(config: DeliverySlotsConfig): boolean {
  if (config.cutoffTime !== null || config.capacityPerSlot !== null) return false
  return config.week.every(
    (ids) => ids.length === ALL_DELIVERY_SLOT_IDS.length && ids.every((id, i) => id === ALL_DELIVERY_SLOT_IDS[i])
  )
}

// ============================================================
// Reglas de disponibilidad (puras)
// ============================================================

/** Día de la semana (0 = domingo) de un `YYYY-MM-DD`, sin zona: aritmética UTC. */
export function weekdayOfDayKey(dayKey: string): number {
  const [y, m, d] = dayKey.split("-").map(Number)
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1)).getUTCDay()
}

/** Las franjas configuradas para un día concreto (sin mirar la hora). */
export function slotsForDayKey(config: DeliverySlotsConfig, dayKey: string): DeliverySlot[] {
  const ids = config.week[weekdayOfDayKey(dayKey)] ?? []
  return ids
    .map((id) => SLOT_BY_ID.get(id))
    .filter((s): s is DeliverySlot => s !== undefined)
}

/** Llave de conteo de ocupación: un día y una franja. */
export function slotTakenKey(dayKey: string, slotId: string): string {
  return `${dayKey}|${slotId}`
}

/** Ocupación por (día, franja); la llena el servidor solo si hay capacidad. */
export type SlotTakenCounts = ReadonlyMap<string, number>

export type SlotUnavailableReason =
  /** La franja no se ofrece ese día (día cerrado o franja apagada). */
  | "not_offered"
  /** Hoy ya pasó la hora de corte: hoy ya no se entrega. */
  | "cutoff_day"
  /** La franja de hoy ya empezó (solo con corte configurado). */
  | "slot_started"
  /** La franja ya llenó su capacidad de ese día. */
  | "slot_full"

/**
 * Por qué una franja concreta de un día concreto no se puede
 * tomar, o `null` si se puede. Es LA regla: la usan la
 * disponibilidad pública, la validación de POST /api/orders y
 * los pedidos recurrentes, cada una con sus interruptores:
 *
 * - `applyStartedRule`: la franja de hoy que ya empezó cuenta
 *   como cortada. La disponibilidad web y la validación la
 *   activan; los recurrentes no (su pedido lo genera el sistema
 *   por la mañana y su franja es «la primera válida del día»).
 * - Las reglas de corte SOLO actúan con `cutoffTime`
 *   configurado; sin corte, un día se ofrece entero como
 *   siempre (la `not_offered` y la capacidad no dependen del
 *   corte: son la configuración misma).
 */
export function slotUnavailableReason(
  config: DeliverySlotsConfig,
  params: {
    dayKey: string
    slot: DeliverySlot
    now?: Date
    timezone?: string | null
    taken?: SlotTakenCounts
    applyStartedRule?: boolean
  }
): SlotUnavailableReason | null {
  const { dayKey, slot } = params
  if (!slotsForDayKey(config, dayKey).some((s) => s.id === slot.id)) return "not_offered"

  const now = params.now ?? new Date()
  const timezone = params.timezone ?? DEFAULT_TIMEZONE
  const isToday = dayKey === dayKeyOf(timezone, now)

  if (isToday && config.cutoffTime !== null) {
    const cutoffMinutes = parseHhMm(config.cutoffTime)
    const nowMinutes = minutesOfDay(timezone, now)
    if (cutoffMinutes !== null && nowMinutes >= cutoffMinutes) return "cutoff_day"
    if (params.applyStartedRule && slot.startMinutes <= nowMinutes) return "slot_started"
  }

  if (config.capacityPerSlot !== null && params.taken) {
    const takenCount = params.taken.get(slotTakenKey(dayKey, slot.id)) ?? 0
    if (takenCount >= config.capacityPerSlot) return "slot_full"
  }

  return null
}

/** Las franjas tomables de un día, en orden. */
export function availableSlotsForDay(
  config: DeliverySlotsConfig,
  params: {
    dayKey: string
    now?: Date
    timezone?: string | null
    taken?: SlotTakenCounts
    applyStartedRule?: boolean
  }
): DeliverySlot[] {
  return slotsForDayKey(config, params.dayKey).filter(
    (slot) => slotUnavailableReason(config, { ...params, slot }) === null
  )
}

export interface DeliveryAvailabilityDay extends DeliveryDay {
  slots: DeliverySlot[]
}

/**
 * La disponibilidad que pinta el checkout: los próximos 7 días
 * (la misma ventana de `getNextDays`) con las franjas tomables
 * de cada uno. Un día sin franjas tomables (cerrado, cortado o
 * lleno) NO se ofrece: ofrecerlo sería prometer una entrega que
 * el servidor va a rechazar. Con la config por defecto el
 * resultado es idéntico al histórico: 7 días × 6 franjas.
 */
export function buildDeliveryAvailability(
  config: DeliverySlotsConfig,
  params: { now?: Date; timezone?: string | null; taken?: SlotTakenCounts } = {}
): DeliveryAvailabilityDay[] {
  const now = params.now ?? new Date()
  const timezone = params.timezone ?? DEFAULT_TIMEZONE
  return getNextDays(timezone, now)
    .map((day) => ({
      ...day,
      slots: availableSlotsForDay(config, {
        dayKey: day.value,
        now,
        timezone,
        taken: params.taken,
        applyStartedRule: true,
      }),
    }))
    .filter((day) => day.slots.length > 0)
}

/**
 * La primera franja válida de un día para un pedido que genera
 * el sistema (recurrentes): configurada para ese día, sin llenar
 * su capacidad y —con corte configurado— generada antes de la
 * hora de corte si el día es hoy. `null` si no hay ninguna: el
 * llamador lo trata como un ciclo no generado, no lo mueve a
 * otro día en silencio.
 */
export function firstSlotForSystemOrder(
  config: DeliverySlotsConfig,
  params: { dayKey: string; now?: Date; timezone?: string | null; taken?: SlotTakenCounts }
): DeliverySlot | null {
  const slots = availableSlotsForDay(config, { ...params, applyStartedRule: false })
  return slots[0] ?? null
}

/** El `scheduled_for` de una franja: día local + hora de inicio, como la web. */
export function slotScheduledFor(dayKey: string, slot: DeliverySlot): string {
  return new Date(`${dayKey}T${slot.start}:00-06:00`).toISOString()
}
