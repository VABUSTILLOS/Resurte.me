/**
 * Reglas puras de las inscripciones en secuencias de goteo.
 *
 * Vive aparte de `crm-sequences-engine.ts` a propósito: el motor decide *cuándo*
 * se envía el siguiente paso, esto decide *qué inscripción existe* y en qué
 * estado. Comparten `nextSequenceRun`, nada más.
 */

/**
 * Espejo en TypeScript del `CHECK` de `crm_sequence_enrollments.status`
 * (`00140_leads_crm_inbox.sql:133`). El contrato lo ata al SQL: si una migración
 * añade un estado, el test lo delata antes de que la UI lo muestre en crudo.
 */
export const ENROLLMENT_STATUSES = ["activa", "pausada", "completada", "cancelada"] as const

export type EnrollmentStatus = (typeof ENROLLMENT_STATUSES)[number]

export const ENROLLMENT_STATUS_LABEL: Record<EnrollmentStatus, string> = {
  activa: "Activa",
  pausada: "Pausada",
  completada: "Completada",
  cancelada: "Cancelada",
}

export function isEnrollmentStatus(value: unknown): value is EnrollmentStatus {
  return typeof value === "string" && (ENROLLMENT_STATUSES as readonly string[]).includes(value)
}

/**
 * Lo que el cron va a procesar. `loadDueEnrollments` filtra exactamente
 * `status = "activa"`, así que cualquier otro estado está fuera del reloj.
 */
export function isEnrollmentOpen(status: string): boolean {
  return status === "activa"
}

/**
 * Todo lo que no está corriendo puede volver a correr.
 *
 * Es la regla que hace reversible el botón de cancelar: `UNIQUE (sequence_id,
 * prospect_id)` impide reinsertar, así que la única salida de una inscripción
 * cancelada es reactivar la fila que ya existe.
 */
export function isReenrollable(status: string): boolean {
  return !isEnrollmentOpen(status)
}

/** Orden de la lista: primero lo que corre, al final lo terminal. */
const STATUS_ORDER: Record<EnrollmentStatus, number> = {
  activa: 0,
  pausada: 1,
  completada: 2,
  cancelada: 3,
}

// ─────────────────────────────────────────────────────────────
// Contrato de fila
// ─────────────────────────────────────────────────────────────

/** Una fila de `crm_sequence_enrollments` tal como la devuelve la lectura. */
export interface EnrollmentRow {
  id: number
  sequence_id: number
  prospect_id: number
  current_step: number
  next_run_at: string | null
  status: string
  created_at: string | null
}

/** El mínimo del prospecto que la lista necesita para ser legible. */
export interface EnrollmentProspect {
  id: number
  name: string
  phone: string | null
  whatsapp: string | null
}

export interface AdminEnrollment {
  id: number
  prospectId: number
  prospectName: string
  /** Teléfono o WhatsApp, el que haya. `null` si no hay ninguno. */
  contact: string | null
  status: EnrollmentStatus
  statusLabel: string
  /** `0` = inscrito sin nada enviado; el siguiente a enviar es `currentStep + 1`. */
  currentStep: number
  totalSteps: number
  nextRunAt: string | null
  createdAt: string | null
}

/** `Prospecto #12` cuando el prospecto ya no está o la lectura no lo trajo. */
function enrollmentFallbackName(prospectId: number): string {
  return `Prospecto #${prospectId}`
}

/**
 * El `CHECK` de 00140 hace que `status` solo pueda valer uno de los cuatro; el
 * respaldo existe para que el tipo sea total, no para inventar datos. Cae en
 * `activa` porque es el estado que la UI puede deshacer con un clic.
 */
export function normalizeEnrollmentStatus(value: unknown): EnrollmentStatus {
  return isEnrollmentStatus(value) ? value : "activa"
}

function asStringOrNull(value: unknown): string | null {
  if (value == null) return null
  const text = String(value).trim()
  return text === "" ? null : text
}

function instant(value: string | null): number {
  if (value === null) return Number.POSITIVE_INFINITY
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : parsed
}

/**
 * Arma la lista que pinta el panel. Resuelve los nombres contra el mapa de
 * prospectos ya leído (no consulta nada) y degrada a `Prospecto #id` cuando el
 * prospecto desapareció: una inscripción huérfana sigue siendo cancelable.
 */
export function buildEnrollmentList(
  rows: readonly EnrollmentRow[],
  prospects: readonly EnrollmentProspect[],
  totalSteps: number,
): AdminEnrollment[] {
  const byId = new Map(prospects.map((prospect) => [prospect.id, prospect]))

  return rows
    .map((row) => {
      const prospect = byId.get(row.prospect_id)
      const status = normalizeEnrollmentStatus(row.status)
      return {
        id: row.id,
        prospectId: row.prospect_id,
        prospectName: prospect?.name?.trim() || enrollmentFallbackName(row.prospect_id),
        contact: asStringOrNull(prospect?.phone) ?? asStringOrNull(prospect?.whatsapp),
        status,
        statusLabel: ENROLLMENT_STATUS_LABEL[status],
        currentStep: Math.max(0, Math.trunc(row.current_step)),
        totalSteps: Math.max(0, Math.trunc(totalSteps)),
        nextRunAt: asStringOrNull(row.next_run_at),
        createdAt: asStringOrNull(row.created_at),
      }
    })
    .sort((a, b) => {
      const byStatus = STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
      if (byStatus !== 0) return byStatus
      const byNextRun = instant(a.nextRunAt) - instant(b.nextRunAt)
      if (byNextRun !== 0) return byNextRun
      return a.prospectName.localeCompare(b.prospectName, "es")
    })
}

export type EnrollmentSummary = Record<EnrollmentStatus, number>

/** Recuento por estado, para la cabecera del desplegable. */
export function enrollmentSummary(list: readonly AdminEnrollment[]): EnrollmentSummary {
  const summary: EnrollmentSummary = { activa: 0, pausada: 0, completada: 0, cancelada: 0 }
  for (const enrollment of list) summary[enrollment.status] += 1
  return summary
}

/** `12 de 30` — o `—` si la secuencia no declara pasos. */
export function enrollmentStepLabel(currentStep: number, totalSteps: number): string {
  if (totalSteps <= 0) return "—"
  return `${Math.min(currentStep, totalSteps)} de ${totalSteps}`
}

// ─────────────────────────────────────────────────────────────
// Plan de inscripción (la mitad que hace reversible el cancelar)
// ─────────────────────────────────────────────────────────────

export interface EnrollmentUpsertPlan {
  /** Prospectos sin fila previa: se insertan. */
  insert: number[]
  /** Prospectos con fila no activa: se reactivan por `UPDATE`, nunca se reinsertan. */
  reactivate: number[]
  /** Prospectos ya corriendo: no se tocan. */
  skip: number[]
}

/**
 * Decide qué hacer con cada prospecto de un lote de inscripción.
 *
 * El `UNIQUE (sequence_id, prospect_id)` de 00140 hace imposible reinsertar una
 * fila existente, así que tratar cualquier fila previa como "ya inscrito" deja
 * las canceladas atrapadas para siempre. Aquí una fila no activa se marca para
 * **reactivar**.
 */
export function planEnrollmentUpsert(
  existing: readonly { prospect_id: number; status: string }[],
  ids: readonly number[],
): EnrollmentUpsertPlan {
  const byId = new Map(existing.map((row) => [row.prospect_id, row.status]))
  const plan: EnrollmentUpsertPlan = { insert: [], reactivate: [], skip: [] }

  for (const id of ids) {
    const status = byId.get(id)
    if (status === undefined) {
      plan.insert.push(id)
    } else if (isEnrollmentOpen(status)) {
      plan.skip.push(id)
    } else {
      plan.reactivate.push(id)
    }
  }

  return plan
}

export interface EnrollmentEnrollResult {
  /** Filas que ahora van a correr: insertadas + reactivadas. */
  enrolled: number
  /** Filas que ya corrían y no se han tocado. */
  skipped: number
  /** Subconjunto de `enrolled` que venía de una fila no activa. */
  reactivated: number
  reason: string | null
}

/**
 * Traduce el plan al resultado que ve el panel. `enrolled` conserva el
 * significado que ya tenía (filas que ahora corren); `reactivated` es aditivo.
 */
export function describeEnrollmentResult(plan: EnrollmentUpsertPlan): EnrollmentEnrollResult {
  const enrolled = plan.insert.length + plan.reactivate.length
  return {
    enrolled,
    skipped: plan.skip.length,
    reactivated: plan.reactivate.length,
    reason: enrolled === 0 ? "Ya estaban inscritos en esta secuencia" : null,
  }
}
