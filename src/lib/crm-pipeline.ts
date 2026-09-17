/**
 * Fase 13 — lógica pura del pipeline CRM admin (crm_prospects).
 *
 * Dos ejes de estado conviven aquí y NO deben confundirse:
 *
 * - `crm_prospects.status` — el embudo comercial (nuevo → … → cliente_activo).
 * - `leads.status`         — la bandeja de entrada web (nuevo/convertido/descartado),
 *                            independiente del embudo: un lead convertido ya vive
 *                            como prospecto y su avance se sigue en el tablero.
 *
 * Módulo puro: sin Supabase, sin React. Lo consumen las server actions del panel
 * y los componentes cliente, así que cualquier cambio aquí se prueba en
 * `crm-pipeline.test.ts`.
 */

export const CRM_STATUSES = [
  "nuevo",
  "contactado",
  "en_seguimiento",
  "cliente_activo",
  "inactivo",
  "perdido",
] as const

export type CrmStatus = (typeof CRM_STATUSES)[number]

export const CRM_STATUS_LABEL: Record<CrmStatus, string> = {
  nuevo: "Nuevo",
  contactado: "Contactado",
  en_seguimiento: "En seguimiento",
  cliente_activo: "Cliente activo",
  inactivo: "Inactivo",
  perdido: "Perdido",
}

/** Columnas visibles del tablero (inactivo/perdido se agrupan en "Cerrados"). */
export const CRM_BOARD_COLUMNS: { key: string; label: string; statuses: CrmStatus[] }[] = [
  { key: "nuevo", label: "Nuevos", statuses: ["nuevo"] },
  { key: "contactado", label: "Contactados", statuses: ["contactado"] },
  { key: "en_seguimiento", label: "En seguimiento", statuses: ["en_seguimiento"] },
  { key: "cliente_activo", label: "Clientes activos", statuses: ["cliente_activo"] },
  { key: "cerrados", label: "Cerrados", statuses: ["inactivo", "perdido"] },
]

export function isCrmStatus(value: string): value is CrmStatus {
  return (CRM_STATUSES as readonly string[]).includes(value)
}

/** Siguiente paso "feliz" del embudo; null si ya es cliente o está cerrado. */
export function nextCrmStatus(status: CrmStatus): CrmStatus | null {
  const flow: CrmStatus[] = ["nuevo", "contactado", "en_seguimiento", "cliente_activo"]
  const idx = flow.indexOf(status)
  const next = idx >= 0 && idx < flow.length - 1 ? flow[idx + 1] : undefined
  return next ?? null
}

export interface CrmProspect {
  id: number
  /** `null` = sin asignar (p.ej. un lead web convertido que nadie repartió). */
  seller_id: string | null
  /** Lead web de origen; `null` si el prospecto se capturó a mano. */
  lead_id: number | null
  name: string
  restaurant_name: string | null
  phone: string | null
  whatsapp: string | null
  email: string | null
  status: string
  notes: string | null
  next_follow_up_at: string | null
  last_contact_at: string | null
  created_at: string
  /**
   * Etiquetas del prospecto (00140). Opcional porque las filas cargadas sin la
   * migración aplicada no traen la columna y el pipeline debe seguir pintando.
   */
  tags?: string[]
}

export interface CrmBoard {
  [columnKey: string]: CrmProspect[]
}

/** Agrupa prospectos en las columnas del tablero, ordenados por urgencia. */
export function groupIntoBoard(prospects: CrmProspect[]): CrmBoard {
  const board: CrmBoard = Object.fromEntries(CRM_BOARD_COLUMNS.map((c) => [c.key, []]))
  for (const p of prospects) {
    const col = CRM_BOARD_COLUMNS.find((c) => c.statuses.includes(p.status as CrmStatus))
    const column = col ? board[col.key] : undefined
    if (column) column.push(p)
  }
  for (const key of Object.keys(board)) {
    const column = board[key]
    if (column) column.sort(compareByUrgency)
  }
  return board
}

/**
 * Prioridad de atención de un prospecto. Menor = más urgente:
 *
 * - `0` seguimiento vencido (ya pasó la fecha prometida)
 * - `1` sin seguimiento agendado (nadie lo tiene en el radar)
 * - `2` seguimiento futuro (está agendado, no corre prisa)
 *
 * Un prospecto sin asignar nunca baja de `1`: aunque no tenga fecha, alguien
 * tiene que tomarlo, así que se ordena junto a los que ya están esperando.
 */
export function prospectUrgency(p: CrmProspect, now: Date = new Date()): 0 | 1 | 2 {
  if (p.next_follow_up_at) return isFollowUpDue(p.next_follow_up_at, now) ? 0 : 2
  return 1
}

/** Ordena por urgencia; a igual urgencia, el más reciente primero. */
export function compareByUrgency(a: CrmProspect, b: CrmProspect, now: Date = new Date()): number {
  const ua = prospectUrgency(a, now)
  const ub = prospectUrgency(b, now)
  if (ua !== ub) return ua - ub
  // Dentro del mismo tramo: lo vencido más antiguo primero (lleva más esperando),
  // lo agendado más próximo primero, y los sin fecha por alta más reciente.
  if (ua !== 1) return (a.next_follow_up_at ?? "").localeCompare(b.next_follow_up_at ?? "")
  return b.created_at.localeCompare(a.created_at)
}

/** Un seguimiento está vencido si tiene fecha y ya pasó. */
export function isFollowUpDue(nextFollowUpAt: string | null, now: Date = new Date()): boolean {
  if (!nextFollowUpAt) return false
  return new Date(nextFollowUpAt) <= now
}

// ─────────────────────────────────────────────────────────────
// Bandeja de leads web (leads.status)
// ─────────────────────────────────────────────────────────────

export const LEAD_STATUSES = ["nuevo", "convertido", "descartado"] as const

export type LeadStatus = (typeof LEAD_STATUSES)[number]

export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  nuevo: "Sin atender",
  convertido: "Convertido",
  descartado: "Descartado",
}

export function isLeadStatus(value: string): value is LeadStatus {
  return (LEAD_STATUSES as readonly string[]).includes(value)
}

export interface LeadStatusFields {
  status: string
  converted_prospect_id: number | null
}

/**
 * Un lead está cerrado si ya se convirtió o se descartó. Fuente única de la
 * bandeja: la tabla de leads sólo muestra los `nuevo`, así que cualquier
 * pantalla que quiera listar "pendientes" debe preguntar aquí.
 */
export function isLeadPending(lead: LeadStatusFields): boolean {
  return lead.status === "nuevo" && lead.converted_prospect_id === null
}

/** Un lead convertido apunta siempre a su prospecto; si no, el estado miente. */
export function isLeadConverted(lead: LeadStatusFields): boolean {
  return lead.status === "convertido" && lead.converted_prospect_id !== null
}

// ─────────────────────────────────────────────────────────────
// Conversión lead → prospecto
// ─────────────────────────────────────────────────────────────

/** Diagnóstico del calificador tal como lo guardó el servidor (migración 00131). */
export interface LeadQualificationSnapshot {
  score: number
  segment: string
  recommended_tier: string
  recommended_features: string[]
  reasons: string[]
}

/** Lo mínimo que necesita el alta de un prospecto a partir de un lead. */
export interface ConvertibleLead {
  id: number
  email: string
  phone: string | null
  restaurant_name: string | null
  source: string
  qualification: LeadQualificationSnapshot | null
}

/** Alta de prospecto derivada de un lead; `seller_id` siempre `null` (sin asignar). */
export interface ProspectDraft {
  lead_id: number
  seller_id: null
  name: string
  restaurant_name: string | null
  phone: string | null
  whatsapp: string | null
  email: string
  status: "nuevo"
  source: "lead_web"
  notes: string
}

/**
 * `crm_prospects.tier` es SMALLINT 1..3 (Plan Chihuahua: Early Adopter / Growth /
 * Long Tail) y `qualification.recommended_tier` es un nivel de cashback
 * ("Verde" | "Plata" | "Oro" | "Diamante"). Son ejes distintos: convertir uno en
 * otro inventaría una clasificación. Por eso el nivel recomendado viaja en las
 * notas (texto para el humano) y `tier` queda sin tocar.
 */

/** Nombre de contacto del prospecto: el lead sólo trae correo y restaurante. */
export function prospectNameFromLead(lead: ConvertibleLead): string {
  const restaurant = lead.restaurant_name?.trim()
  if (restaurant) return restaurant
  const local = lead.email.split("@")[0]?.trim()
  return local || lead.email
}

/**
 * Notas iniciales del prospecto: quién es, de dónde llegó y qué concluyó el
 * calificador. Es texto plano porque es lo que lee el vendedor al abrir la ficha.
 */
export function leadDiagnosisNotes(lead: ConvertibleLead): string {
  const lines = [`Lead web (${lead.source})`]
  const q = lead.qualification
  if (q) {
    lines.push(`Segmento ${q.segment} · ${q.score}/100 · nivel recomendado ${q.recommended_tier}`)
    if (q.recommended_features.length > 0) {
      lines.push(`Funciones sugeridas: ${q.recommended_features.join(", ")}`)
    }
    if (q.reasons.length > 0) {
      lines.push(`Motivos: ${q.reasons.join(" · ")}`)
    }
  } else {
    lines.push("Sin diagnóstico del calificador.")
  }
  return lines.join("\n")
}

export function leadToProspectDraft(lead: ConvertibleLead): ProspectDraft {
  return {
    lead_id: lead.id,
    seller_id: null,
    name: prospectNameFromLead(lead),
    restaurant_name: lead.restaurant_name,
    phone: lead.phone,
    whatsapp: lead.phone,
    email: lead.email,
    status: "nuevo",
    source: "lead_web",
    notes: leadDiagnosisNotes(lead),
  }
}

// ─────────────────────────────────────────────────────────────
// Búsqueda, duplicados y filtros
// ─────────────────────────────────────────────────────────────

/** Normaliza para comparar: minúsculas y sin acentos. */
export function normalizeForSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
}

/** Sólo dígitos; `null` si no queda ninguno. Sirve para comparar teléfonos. */
export function digitsOf(value: string | null | undefined): string | null {
  if (!value) return null
  const digits = value.replace(/\D/g, "")
  return digits.length > 0 ? digits : null
}

/**
 * Clave de comparación de teléfonos. En México el número nacional son 10 dígitos
 * (LADA + número), y el mismo celular aparece como `+52 614…`, `52 1 614…` o
 * `614…` según quién lo capturó. Comparar los últimos 10 dígitos evita duplicar
 * la ficha por la pura lada del país. Números más cortos se comparan completos.
 */
export function phoneKey(value: string | null | undefined): string | null {
  const digits = digitsOf(value)
  if (!digits) return null
  return digits.length > 10 ? digits.slice(-10) : digits
}

export interface ProspectFilters {
  /** Texto libre sobre nombre, restaurante, correo y teléfono. */
  q?: string
  status?: CrmStatus | "todos"
  /** Sólo los que tienen seguimiento vencido. */
  due?: boolean
  /** Sólo los que no tienen vendedor asignado. */
  unassigned?: boolean
}

/**
 * ¿Alguno de los campos coincide con la búsqueda?
 *
 * Además del texto normalizado, se comparan los dígitos: quien busca un teléfono
 * suele pegarlo tal cual lo tiene en el celular (`+52 614 123 4567`) o pegado
 * sin espacios, y `normalizeForSearch` no borra signos, así que sin esta segunda
 * pasada la búsqueda por teléfono fallaría según cómo se escribió.
 */
export function matchesSearch(
  q: string,
  fields: Array<string | null | undefined>,
  digitsFields: Array<string | null | undefined> = [],
): boolean {
  const needle = normalizeForSearch(q)
  if (!needle) return true
  const haystack = normalizeForSearch(fields.filter(Boolean).join(" "))
  if (haystack.includes(needle)) return true

  const needleDigits = digitsOf(q)
  if (!needleDigits) return false
  return digitsFields.some((value) => digitsOf(value)?.includes(needleDigits) ?? false)
}

export function matchesProspectFilters(
  p: CrmProspect,
  filters: ProspectFilters,
  now: Date = new Date(),
): boolean {
  if (filters.status && filters.status !== "todos" && p.status !== filters.status) return false
  if (filters.due && !isFollowUpDue(p.next_follow_up_at, now)) return false
  if (filters.unassigned && p.seller_id !== null) return false

  if (filters.q) {
    return matchesSearch(
      filters.q,
      [p.name, p.restaurant_name, p.email, p.phone, p.whatsapp],
      [p.phone, p.whatsapp],
    )
  }
  return true
}

export function filterProspects(
  prospects: CrmProspect[],
  filters: ProspectFilters,
  now: Date = new Date(),
): CrmProspect[] {
  return prospects.filter((p) => matchesProspectFilters(p, filters, now))
}

/**
 * Busca un prospecto existente que corresponda al lead, para no duplicar la
 * ficha cuando el vendedor ya lo había capturado a mano.
 *
 * Orden de confianza: primero el vínculo explícito por `lead_id`, luego el
 * teléfono (normalizado a dígitos) y al final el correo. El teléfono va antes
 * que el correo porque dos personas comparten correo de restaurante con más
 * frecuencia de lo que comparten celular.
 */
export function findMatchingProspect(
  draft: ProspectDraft,
  existing: CrmProspect[],
): CrmProspect | null {
  const byLead = existing.find((p) => p.lead_id === draft.lead_id)
  if (byLead) return byLead

  const phone = phoneKey(draft.phone)
  if (phone) {
    const byPhone = existing.find(
      (p) => phoneKey(p.phone) === phone || phoneKey(p.whatsapp) === phone,
    )
    if (byPhone) return byPhone
  }

  const email = draft.email ? normalizeForSearch(draft.email) : ""
  if (email) {
    const byEmail = existing.find((p) => p.email && normalizeForSearch(p.email) === email)
    if (byEmail) return byEmail
  }

  return null
}
