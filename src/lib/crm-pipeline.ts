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
 *
 * Ronda 7: lo que comparten el panel de vendedores y el de admin (vocabulario de
 * estado, contrato de fila, mapeo, columnas, alcance, búsqueda y filtros) se
 * movió a `crm-core.ts`, que es la única autoridad. Aquí solo queda la capa de
 * **tablero** del admin (columnas, urgencia, embudo) y la **bandeja de leads**
 * web.
 *
 * Ronda 5: los reexports de compatibilidad de esa migración ya no los importaba
 * nadie —los consumidores migraron a `crm-core.ts`— así que se retiraron. Si
 * necesitas vocabulario de estado, contrato de fila, alcance o búsqueda,
 * impórtalo de `crm-core.ts`; no lo reexportes desde aquí.
 */

import { isFollowUpDue, normalizeForSearch, phoneKey } from "./crm-core"
import type { CrmProspectRow, CrmStatus } from "./crm-core"

export {
  CRM_STATUSES,
  CRM_STATUS_LABEL,
  isCrmStatus,
  isFollowUpDue,
  normalizeForSearch,
  digitsOf,
  phoneKey,
  matchesSearch,
  matchesProspectFilters,
  filterProspects,
} from "./crm-core"

export type { CrmStatus, ProspectFilters } from "./crm-core"

/** Columnas visibles del tablero (inactivo/perdido se agrupan en "Cerrados"). */
export const CRM_BOARD_COLUMNS: { key: string; label: string; statuses: CrmStatus[] }[] = [
  { key: "nuevo", label: "Nuevos", statuses: ["nuevo"] },
  { key: "contactado", label: "Contactados", statuses: ["contactado"] },
  { key: "en_seguimiento", label: "En seguimiento", statuses: ["en_seguimiento"] },
  { key: "cliente_activo", label: "Clientes activos", statuses: ["cliente_activo"] },
  { key: "cerrados", label: "Cerrados", statuses: ["inactivo", "perdido"] },
]

/** Siguiente paso "feliz" del embudo; null si ya es cliente o está cerrado. */
export function nextCrmStatus(status: CrmStatus): CrmStatus | null {
  const flow: CrmStatus[] = ["nuevo", "contactado", "en_seguimiento", "cliente_activo"]
  const idx = flow.indexOf(status)
  const next = idx >= 0 && idx < flow.length - 1 ? flow[idx + 1] : undefined
  return next ?? null
}

/**
 * Fila de `crm_prospects` del tablero admin.
 *
 * Ronda 7: es un alias del contrato compartido `CrmProspectRow`. El tipo pasó de
 * `status: string` a `CrmStatus` y de `tags?: string[]` a `tags: string[]`
 * obligatorio (el mapeador siempre produce arreglo), lo que elimina los casts en
 * `groupIntoBoard` y los `tags?.` defensivos.
 */
export type CrmProspect = CrmProspectRow

export interface CrmBoard {
  [columnKey: string]: CrmProspect[]
}

/** Agrupa prospectos en las columnas del tablero, ordenados por urgencia. */
export function groupIntoBoard(prospects: CrmProspect[]): CrmBoard {
  const board: CrmBoard = Object.fromEntries(CRM_BOARD_COLUMNS.map((c) => [c.key, []]))
  for (const p of prospects) {
    const col = CRM_BOARD_COLUMNS.find((c) => c.statuses.includes(p.status))
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
// `isFollowUpDue` se reexporta desde `./crm-core` (arriba).

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
// Duplicados
// ─────────────────────────────────────────────────────────────

// `normalizeForSearch`, `digitsOf`, `phoneKey`, `ProspectFilters`, `matchesSearch`,
// `matchesProspectFilters` y `filterProspects` viven en `./crm-core` y se
// reexportan arriba (Ronda 7). `phoneKey` y `normalizeForSearch` se usan aquí.

/**
 * Busca un prospecto existente que corresponda al lead, para no duplicar la
 * ficha cuando el vendedor ya lo había capturado a mano.
 *
 * Orden de confianza: primero el vínculo explícito por `lead_id`, luego el
 * teléfono (normalizado a dígitos) y al final el correo. El teléfono va antes
 * que el correo porque dos personas comparten correo de restaurante con más
 * frecuencia de lo que comparten celular.
 */
/**
 * Mínimo que `findMatchingProspect` necesita para decidir si ya existe la ficha.
 *
 * Es un `Pick` y no `CrmProspect` completo a propósito: la conversión de un lead
 * solo selecciona estas columnas (y `name`, para el aviso de duplicado), así que
 * exigir el contrato entero obligaría a rellenar campos que nadie va a leer.
 */
export type ProspectMatchCandidate = Pick<
  CrmProspect,
  "id" | "name" | "lead_id" | "phone" | "whatsapp" | "email"
>

/**
 * Busca un prospecto que ya represente al mismo negocio, en este orden:
 * `lead_id` → teléfono (contra `phone` y `whatsapp`) → correo.
 */
export function findMatchingProspect(
  draft: ProspectDraft,
  existing: readonly ProspectMatchCandidate[],
): ProspectMatchCandidate | null {
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
