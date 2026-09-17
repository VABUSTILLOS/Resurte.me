/**
 * Catering por volumen (Fase 7, nivel Diamante).
 *
 * Núcleo **puro**: valida una solicitud, cotiza y gobierna las transiciones de
 * estado. No toca Supabase ni red.
 *
 * La regla que sostiene este módulo: **el total lo calcula el servidor**. El
 * navegador manda cuántas personas y qué paquete; el precio por persona y el
 * total salen de aquí. Es la misma disciplina que la tarifa de entrega de la
 * Flotilla — si el navegador pudiera proponer un total, cualquiera podría
 * cotizar un evento de 200 personas a $1.
 */

import { formatMoney } from "@/lib/money"

export type CateringStatus =
  | "requested"
  | "quoted"
  | "confirmed"
  | "declined"
  | "completed"
  | "cancelled"

export const CATERING_STATUSES: CateringStatus[] = [
  "requested",
  "quoted",
  "confirmed",
  "declined",
  "completed",
  "cancelled",
]

/** Avance normal del embudo. Los estados terminales quedan fuera. */
export const CATERING_STATUS_FLOW: CateringStatus[] = [
  "requested",
  "quoted",
  "confirmed",
  "completed",
]

export const CATERING_STATUS_RANK: Record<CateringStatus, number> = {
  requested: 0,
  quoted: 1,
  confirmed: 2,
  completed: 3,
  // Terminales: no participan del avance, pero tienen rango para poder
  // compararlos sin ramas especiales.
  declined: -1,
  cancelled: -1,
}

export function isCateringStatus(value: unknown): value is CateringStatus {
  return typeof value === "string" && (CATERING_STATUSES as string[]).includes(value)
}

export const CATERING_TERMINAL: CateringStatus[] = ["declined", "cancelled"]

export function isCateringTerminal(status: CateringStatus): boolean {
  return CATERING_TERMINAL.includes(status)
}

// ------------------------------------------------------------
// Paquetes
// ------------------------------------------------------------

export interface CateringPackage {
  id: string
  name: string
  description: string | null
  pricePerPerson: number
  minPeople: number
  /** `null` = sin tope. */
  maxPeople: number | null
  leadTimeHours: number
  includes: string[]
  isActive: boolean
  sortOrder: number
}

export const MAX_PACKAGE_NAME = 120
export const MAX_PACKAGE_DESCRIPTION = 1000
export const MAX_INCLUDES = 20
export const MAX_INCLUDE_LENGTH = 120
export const MAX_HEADCOUNT = 5000
export const MAX_NOTES = 1000
export const DEFAULT_MIN_PEOPLE = 10
export const DEFAULT_LEAD_TIME_HOURS = 48

export interface CateringPackageInput {
  name: string
  description?: string | null
  pricePerPerson?: number | null
  minPeople?: number | null
  maxPeople?: number | null
  leadTimeHours?: number | null
  includes?: unknown
  isActive?: boolean
  sortOrder?: number | null
}

export type CateringPackageResult =
  | { ok: true; value: Omit<CateringPackage, "id" | "sortOrder"> & { sortOrder: number } }
  | { ok: false; error: string }

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function intOrNull(value: unknown): number | null {
  const num = numeric(value)
  if (num === null) return null
  return Math.trunc(num)
}

/**
 * Coerción numérica que distingue "no viene" de "vale cero".
 *
 * `Number("")` es `0`, así que un campo ausente se colaba como cero: la
 * anticipación por omisión quedaba en 0 horas en vez de las 48 declaradas. Aquí
 * una cadena vacía o ausente es `null`, nunca cero.
 */
function numeric(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null
  if (typeof value === "string") {
    const trimmed = value.trim()
    if (!trimmed) return null
    const parsed = Number(trimmed)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function moneyOrNull(value: unknown): number | null {
  const num = numeric(value)
  if (num === null || num < 0) return null
  return Math.round(num * 100) / 100
}

/** Normaliza la lista de lo que incluye el paquete. */
export function normalizeIncludes(value: unknown): string[] {
  const raw = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split("\n")
      : []
  const out: string[] = []
  const seen = new Set<string>()
  for (const entry of raw) {
    const item = clean(entry).slice(0, MAX_INCLUDE_LENGTH)
    if (!item) continue
    const key = item.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(item)
    if (out.length >= MAX_INCLUDES) break
  }
  return out
}

/**
 * Valida y normaliza un paquete.
 *
 * El tope de comensales es opcional; el mínimo no. Un paquete sin mínimo
 * aceptaría una cotización de una persona, que es justo lo que el catering por
 * volumen no vende.
 */
export function validateCateringPackage(input: CateringPackageInput): CateringPackageResult {
  const name = clean(input.name).slice(0, MAX_PACKAGE_NAME)
  if (!name) return { ok: false, error: "El paquete necesita un nombre" }

  const pricePerPerson = moneyOrNull(input.pricePerPerson)
  if (pricePerPerson === null) {
    return { ok: false, error: "El precio por persona debe ser un número mayor o igual a cero" }
  }

  const minPeople = intOrNull(input.minPeople)
  if (minPeople === null || minPeople <= 0) {
    return { ok: false, error: "El mínimo de comensales debe ser mayor que cero" }
  }
  if (minPeople > MAX_HEADCOUNT) {
    return { ok: false, error: `El mínimo no puede pasar de ${MAX_HEADCOUNT} personas` }
  }

  const rawMax = input.maxPeople === null || input.maxPeople === undefined ? null : intOrNull(input.maxPeople)
  if (input.maxPeople !== null && input.maxPeople !== undefined && rawMax === null) {
    return { ok: false, error: "El máximo de comensales debe ser un número" }
  }
  if (rawMax !== null && rawMax < minPeople) {
    return { ok: false, error: "El máximo no puede ser menor que el mínimo" }
  }
  if (rawMax !== null && rawMax > MAX_HEADCOUNT) {
    return { ok: false, error: `El máximo no puede pasar de ${MAX_HEADCOUNT} personas` }
  }

  const leadTimeHours = intOrNull(input.leadTimeHours)
  const lead = leadTimeHours === null ? DEFAULT_LEAD_TIME_HOURS : leadTimeHours
  if (lead < 0) {
    return { ok: false, error: "La anticipación no puede ser negativa" }
  }

  const sortOrder = intOrNull(input.sortOrder) ?? 0

  return {
    ok: true,
    value: {
      name,
      description: clean(input.description).slice(0, MAX_PACKAGE_DESCRIPTION) || null,
      pricePerPerson,
      minPeople,
      maxPeople: rawMax,
      leadTimeHours: lead,
      includes: normalizeIncludes(input.includes),
      isActive: input.isActive !== false,
      sortOrder,
    },
  }
}

// ------------------------------------------------------------
// Cotización
// ------------------------------------------------------------

export interface CateringQuoteInput {
  package: Pick<CateringPackage, "name" | "pricePerPerson" | "minPeople" | "maxPeople">
  headcount: number
  /** Ajuste por persona que el dueño decide (descuento por volumen). */
  discountPerPerson?: number | null
}

export interface CateringQuote {
  packageName: string
  headcount: number
  /** Precio por persona ya con el ajuste aplicado. */
  pricePerPerson: number
  subtotal: number
  total: number
  /** Aviso cuando se cobró el mínimo en vez de las personas pedidas. */
  chargedMinimum: boolean
  warnings: string[]
  /** Total ya formateado, para no repetir el formateo en cada superficie. */
  totalLabel: string
}

export type CateringQuoteResult =
  | { ok: true; quote: CateringQuote }
  | { ok: false; error: string }

/**
 * Cotiza un evento.
 *
 * **El total es del servidor.** Si el cliente pide menos personas que el
 * mínimo, se cobra el mínimo y se avisa: es lo que el restaurante ya decidió al
 * fijar el paquete, y hacerlo explícito evita la discusión en la mesa.
 */
export function quoteCatering(input: CateringQuoteInput): CateringQuoteResult {
  const headcount = intOrNull(input.headcount)
  if (headcount === null || headcount <= 0) {
    return { ok: false, error: "Indica cuántas personas asistirán" }
  }
  if (headcount > MAX_HEADCOUNT) {
    return { ok: false, error: `Para más de ${MAX_HEADCOUNT} personas, contáctanos directamente` }
  }

  const base = moneyOrNull(input.package.pricePerPerson)
  if (base === null) {
    return { ok: false, error: "El paquete no tiene un precio válido" }
  }

  const warnings: string[] = []
  const chargedMinimum = headcount < input.package.minPeople
  if (chargedMinimum) {
    warnings.push(
      `El paquete se cotiza a partir de ${input.package.minPeople} personas; se cobra el mínimo.`
    )
  }
  if (input.package.maxPeople !== null && headcount > input.package.maxPeople) {
    warnings.push(
      `El paquete llega hasta ${input.package.maxPeople} personas. Te contactamos para ajustarlo.`
    )
  }

  const discount = moneyOrNull(input.discountPerPerson) ?? 0
  const perPerson = Math.max(0, Math.round((base - discount) * 100) / 100)
  if (discount > base) {
    warnings.push("El ajuste por persona es mayor que el precio: se cotiza en cero.")
  }

  const billed = Math.max(headcount, input.package.minPeople)
  const total = Math.round(perPerson * billed * 100) / 100

  return {
    ok: true,
    quote: {
      packageName: input.package.name,
      headcount,
      pricePerPerson: perPerson,
      subtotal: total,
      total,
      chargedMinimum,
      warnings,
      totalLabel: formatMoney(total),
    },
  }
}

// ------------------------------------------------------------
// Solicitudes
// ------------------------------------------------------------

export interface CateringRequestInput {
  customerName: string
  customerPhone: string
  customerEmail?: string | null
  eventDate: string
  headcount: number
  notes?: string | null
}

export interface CateringRequestValidation {
  ok: boolean
  /** Motivos legibles, en el orden en que conviene mostrarlos. */
  errors: string[]
  value: {
    customerName: string
    customerPhone: string
    customerEmail: string | null
    eventDate: string
    headcount: number
    notes: string | null
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

/**
 * Valida una solicitud contra el paquete y el reloj.
 *
 * La anticipación se comprueba aquí y no en la base porque depende del paquete
 * elegido, y porque el mensaje que ve el cliente tiene que decir cuántas horas
 * faltan, no solo "inválido".
 */
export function validateCateringRequest(
  input: CateringRequestInput,
  packageFacts: Pick<CateringPackage, "minPeople" | "maxPeople" | "leadTimeHours">,
  now: Date = new Date()
): CateringRequestValidation {
  const errors: string[] = []

  const customerName = clean(input.customerName).slice(0, 120)
  if (!customerName) errors.push("Necesitamos tu nombre")

  const customerPhone = clean(input.customerPhone).replace(/\s+/g, "")
  if (customerPhone.length < 10) errors.push("Necesitamos un teléfono de 10 dígitos")

  const rawEmail = clean(input.customerEmail)
  let customerEmail: string | null = rawEmail || null
  if (customerEmail && !EMAIL_RE.test(customerEmail)) {
    errors.push("El correo no parece válido")
    customerEmail = null
  }

  const headcount = intOrNull(input.headcount)
  if (headcount === null || headcount <= 0) {
    errors.push("Indica cuántas personas asistirán")
  } else if (headcount < packageFacts.minPeople) {
    errors.push(`El paquete es a partir de ${packageFacts.minPeople} personas`)
  } else if (packageFacts.maxPeople !== null && headcount > packageFacts.maxPeople) {
    errors.push(`El paquete llega hasta ${packageFacts.maxPeople} personas`)
  }

  const eventMs = Date.parse(clean(input.eventDate))
  const eventDate = Number.isFinite(eventMs) ? new Date(eventMs).toISOString() : ""
  if (!eventDate) {
    errors.push("Indica la fecha del evento")
  } else {
    const hoursAway = (eventMs - now.getTime()) / (60 * 60 * 1000)
    if (hoursAway < 0) {
      errors.push("La fecha del evento ya pasó")
    } else if (hoursAway < packageFacts.leadTimeHours) {
      errors.push(
        `Este paquete necesita ${packageFacts.leadTimeHours} horas de anticipación`
      )
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    value: {
      customerName,
      customerPhone,
      customerEmail,
      eventDate,
      headcount: headcount && headcount > 0 ? headcount : 0,
      notes: clean(input.notes).slice(0, MAX_NOTES) || null,
    },
  }
}

// ------------------------------------------------------------
// Transiciones
// ------------------------------------------------------------

export type CateringTransition = "advance" | "decline" | "cancel" | "reopen" | "ignore"

export interface CateringTransitionPlan {
  action: CateringTransition
  next?: CateringStatus
  reason: string
}

/**
 * Decide si una transición es válida.
 *
 * Un evento confirmado no se puede declinar: para eso está cancelar, que deja
 * claro que hubo un acuerdo y se rompió. Y un evento terminado no se reabre:
 * el pedido ya se cocinó y se cobró.
 */
export function planCateringTransition(
  current: CateringStatus,
  next: CateringStatus
): CateringTransitionPlan {
  if (current === next) {
    return { action: "ignore", reason: "Ya estaba en ese estado" }
  }
  if (current === "completed") {
    return { action: "ignore", reason: "Un evento terminado no se reabre" }
  }
  if (current === "cancelled") {
    return { action: "ignore", reason: "Una solicitud cancelada no se reabre" }
  }

  if (next === "declined") {
    if (current !== "requested" && current !== "quoted") {
      return {
        action: "ignore",
        reason: "Solo se puede declinar una solicitud sin confirmar; para lo demás usa cancelar",
      }
    }
    return { action: "decline", next, reason: "Se declinó la solicitud" }
  }

  if (next === "cancelled") {
    if (current !== "confirmed") {
      return { action: "ignore", reason: "Solo se cancela un evento ya confirmado" }
    }
    return { action: "cancel", next, reason: "Se canceló el evento confirmado" }
  }

  if (current === "declined") {
    if (next !== "requested") {
      return { action: "ignore", reason: "Una solicitud declinada solo se puede reactivar" }
    }
    return { action: "reopen", next, reason: "Se reactivó la solicitud" }
  }

  if (CATERING_STATUS_RANK[next] <= CATERING_STATUS_RANK[current]) {
    return { action: "ignore", reason: "La solicitud no retrocede de estado" }
  }
  return { action: "advance", next, reason: `Pasó a ${next}` }
}

// ------------------------------------------------------------
// KPIs
// ------------------------------------------------------------

export interface CateringRequestFacts {
  status: CateringStatus
  headcount: number
  total: number | null
  eventDate: string
}

export interface CateringKpis {
  total: number
  requested: number
  quoted: number
  confirmed: number
  /** Personas comprometidas en eventos confirmados (aún no terminados). */
  confirmedHeadcount: number
  /** Ingreso comprometido en eventos confirmados. */
  confirmedRevenue: number
  nextEventDate: string | null
  /** Eventos confirmados de los próximos 7 días: la carga de la semana. */
  upcoming7d: number
}

export const EMPTY_CATERING_KPIS: CateringKpis = {
  total: 0,
  requested: 0,
  quoted: 0,
  confirmed: 0,
  confirmedHeadcount: 0,
  confirmedRevenue: 0,
  nextEventDate: null,
  upcoming7d: 0,
}

const DAY_MS = 24 * 60 * 60 * 1000

export function summarizeCatering(
  requests: CateringRequestFacts[],
  now: Date = new Date()
): CateringKpis {
  const nowMs = now.getTime()
  const horizon = nowMs + 7 * DAY_MS

  let confirmedHeadcount = 0
  let confirmedRevenue = 0
  let nextEventDate: string | null = null
  let nextEventMs = Number.POSITIVE_INFINITY
  let upcoming7d = 0

  for (const request of requests) {
    const ms = Date.parse(request.eventDate)
    const inFuture = Number.isFinite(ms) && ms >= nowMs

    if (request.status === "confirmed") {
      confirmedHeadcount += Math.max(0, Math.trunc(request.headcount))
      confirmedRevenue += Math.max(0, request.total ?? 0)
      if (inFuture && ms <= horizon) upcoming7d++
      if (inFuture && ms < nextEventMs) {
        nextEventMs = ms
        nextEventDate = request.eventDate
      }
    }
  }

  return {
    total: requests.length,
    requested: requests.filter((r) => r.status === "requested").length,
    quoted: requests.filter((r) => r.status === "quoted").length,
    confirmed: requests.filter((r) => r.status === "confirmed").length,
    confirmedHeadcount,
    confirmedRevenue: Math.round(confirmedRevenue * 100) / 100,
    nextEventDate,
    upcoming7d,
  }
}
