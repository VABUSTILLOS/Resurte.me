/**
 * Fase 13 — lógica pura del pipeline CRM admin (crm_prospects).
 */

const CRM_STATUSES = [
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
}

export interface CrmBoard {
  [columnKey: string]: CrmProspect[]
}

/** Agrupa prospectos en las columnas del tablero, más recientes primero. */
export function groupIntoBoard(prospects: CrmProspect[]): CrmBoard {
  const board: CrmBoard = Object.fromEntries(CRM_BOARD_COLUMNS.map((c) => [c.key, []]))
  for (const p of prospects) {
    const col = CRM_BOARD_COLUMNS.find((c) => c.statuses.includes(p.status as CrmStatus))
    const column = col ? board[col.key] : undefined
    if (column) column.push(p)
  }
  for (const key of Object.keys(board)) {
    board[key]?.sort((a, b) => b.created_at.localeCompare(a.created_at))
  }
  return board
}

/** Un seguimiento está vencido si tiene fecha y ya pasó. */
export function isFollowUpDue(nextFollowUpAt: string | null, now: Date = new Date()): boolean {
  if (!nextFollowUpAt) return false
  return new Date(nextFollowUpAt) <= now
}
