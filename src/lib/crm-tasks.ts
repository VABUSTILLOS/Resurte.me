/**
 * Ronda 16 — tareas del CRM (migración `00185_crm_tasks.sql`).
 *
 * El CRM tenía seguimiento (`crm_prospects.next_follow_up_at`, una fecha suelta)
 * pero no trabajo: "llamar a Juan el jueves" no cabía en una columna de fecha, así
 * que el vendedor lo apuntaba fuera del CRM y el admin no podía repartirlo ni
 * verlo. Una tarea es ese siguiente paso, con dueño, fecha y prioridad.
 *
 * Módulo puro: sin Supabase, sin React, sin `next/*`. Lo consumen las server
 * actions y los componentes cliente, así que todo cambio aquí se prueba en
 * `crm-tasks.contract.test.ts`.
 *
 * Dos invariantes vienen del esquema y se respetan aquí:
 *
 * 1. `(status = 'completada') = (completed_at IS NOT NULL)` es un `CHECK`
 *    bicondicional de 00185. Por eso completar y reabrir son funciones
 *    (`completeTask` / `reopenTask`) y no asignaciones de campo: no existe
 *    "completada sin fecha" ni "pendiente con fecha de cierre", y cualquier
 *    métrica de cumplimiento construida sobre `completed_at` mentiría.
 * 2. Un vencimiento no medido no es cero — la misma regla que `formatMinutes`
 *    en `crm-assignment.ts` y que una tasa sin denominador en `crm-funnel.ts`.
 *    Una tarea sin `due_at` se pinta "Sin fecha" y **no** cuenta como vencida.
 */

/** Prioridades de una tarea, espejo del `CHECK` `crm_tasks_priority_check`. */
export const CRM_TASK_PRIORITIES = ["alta", "media", "baja"] as const

export type CrmTaskPriority = (typeof CRM_TASK_PRIORITIES)[number]

export const CRM_TASK_PRIORITY_LABEL: Record<CrmTaskPriority, string> = {
  alta: "Alta",
  media: "Media",
  baja: "Baja",
}

export function isCrmTaskPriority(value: unknown): value is CrmTaskPriority {
  return typeof value === "string" && (CRM_TASK_PRIORITIES as readonly string[]).includes(value)
}

/** Estados de una tarea, espejo del `CHECK` `crm_tasks_status_check`. */
export const CRM_TASK_STATUSES = ["pendiente", "completada"] as const

export type CrmTaskStatus = (typeof CRM_TASK_STATUSES)[number]

export const CRM_TASK_STATUS_LABEL: Record<CrmTaskStatus, string> = {
  pendiente: "Pendiente",
  completada: "Completada",
}

export function isCrmTaskStatus(value: unknown): value is CrmTaskStatus {
  return typeof value === "string" && (CRM_TASK_STATUSES as readonly string[]).includes(value)
}

/** Prioridad por omisión del alta; es también el `DEFAULT` de la migración. */
export const DEFAULT_TASK_PRIORITY: CrmTaskPriority = "media"

/** Longitud máxima del título, ya normalizado. */
export const MAX_TASK_TITLE_LENGTH = 120

// ─────────────────────────────────────────────────────────────
// Contrato de fila
// ─────────────────────────────────────────────────────────────

/**
 * Una fila de `crm_tasks`.
 *
 * `seller_id` es `null` cuando la tarea nace en un prospecto sin asignar (el
 * pozo) y `created_by` es quien la pidió, que no siempre es quien la hace.
 */
export interface CrmTask {
  id: number
  prospect_id: number
  seller_id: string | null
  title: string
  due_at: string | null
  priority: CrmTaskPriority
  status: CrmTaskStatus
  completed_at: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

function asStringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null
}

function asNumberOrNull(value: unknown): number | null {
  return value != null ? Number(value) : null
}

/**
 * Mapea una fila cruda de PostgREST al contrato.
 *
 * `priority` y `status` caen a los valores por omisión de la migración si el
 * valor guardado no está en el vocabulario: los dos `CHECK` lo hacen imposible,
 * así que el respaldo solo cubre un valor escrito a mano por `psql`, y el tipo
 * tiene que ser total para que ningún consumidor tenga que ramificar.
 */
export function mapCrmTask(row: Record<string, unknown>): CrmTask {
  const priority = row.priority
  const status = row.status
  const createdAt = String(row.created_at)
  return {
    id: Number(row.id),
    prospect_id: Number(row.prospect_id),
    seller_id: row.seller_id != null ? String(row.seller_id) : null,
    title: String(row.title ?? ""),
    due_at: asStringOrNull(row.due_at),
    priority: isCrmTaskPriority(priority) ? priority : DEFAULT_TASK_PRIORITY,
    status: isCrmTaskStatus(status) ? status : "pendiente",
    completed_at: asStringOrNull(row.completed_at),
    created_by: asStringOrNull(row.created_by),
    created_at: createdAt,
    updated_at: asStringOrNull(row.updated_at) ?? createdAt,
  }
}

// ─────────────────────────────────────────────────────────────
// Alta y edición
// ─────────────────────────────────────────────────────────────

/**
 * Lo que un formulario de alta envía. Los tres campos son opcionales salvo el
 * título: una tarea sin fecha ni prioridad es legítima ("llamar cuando pueda"),
 * y convertir eso en obligatorio llenaría la agenda de fechas inventadas.
 */
export interface CrmTaskDraft {
  title: string
  due_at?: string | null
  priority?: string | null
}

/**
 * Normaliza el título: espacios colapsados y recorte. Devuelve `null` cuando no
 * queda nada usable, para que el llamador no tenga que distinguir `""` de `"   "`.
 *
 * No pasa por `normalizeForSearch` (que usan las etiquetas) a propósito: una
 * etiqueta es una clave de filtro y por eso pierde acentos y mayúsculas; un
 * título es texto para leer, y "Llamar a José" no debe guardarse "llamar a jose".
 */
export function normalizeTaskTitle(value: string | null | undefined): string | null {
  if (!value) return null
  const cleaned = value.replace(/\s+/g, " ").trim()
  if (!cleaned) return null
  return cleaned.slice(0, MAX_TASK_TITLE_LENGTH).trim() || null
}

/**
 * Título obligatorio. Lanza en vez de devolver `null` porque es una validación
 * de entrada de usuario: el mensaje se pinta tal cual.
 */
export function requireTaskTitle(value: string | null | undefined): string {
  const title = normalizeTaskTitle(value)
  if (!title) throw new Error("El título de la tarea es obligatorio")
  return title
}

/** Normaliza una fecha de vencimiento: `null`/vacío/ilegible → `null`. */
export function normalizeTaskDueAt(value: string | null | undefined): string | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

/** Valida una prioridad que llega de un formulario. */
export function requireTaskPriority(value: unknown): CrmTaskPriority {
  if (!isCrmTaskPriority(value)) throw new Error("Prioridad de tarea no válida")
  return value
}

// ─────────────────────────────────────────────────────────────
// Estado y coherencia
// ─────────────────────────────────────────────────────────────

/** Una tarea está abierta mientras no se haya completado. */
export function isTaskOpen(task: Pick<CrmTask, "status">): boolean {
  return task.status === "pendiente"
}

/**
 * Una tarea está vencida si sigue pendiente y su fecha ya pasó.
 *
 * Sin `due_at` **no** está vencida: no es "vence ahora", es "sin fecha". La misma
 * distinción que hace `isFollowUpDue` con un seguimiento sin agendar.
 */
export function isTaskOverdue(task: Pick<CrmTask, "status" | "due_at">, now: Date = new Date()): boolean {
  if (task.status !== "pendiente" || !task.due_at) return false
  return new Date(task.due_at) <= now
}

/**
 * Campos derivados de completar una tarea, listos para el `UPDATE`.
 *
 * `completed_at` va aquí y no lo decide el llamador: el `CHECK` bicondicional de
 * 00185 exige que el par `status`/`completed_at` cambie junto, así que dejar la
 * fecha en manos del llamador es dejar abierta la única forma de romperlo.
 */
export function completeTask(now: Date = new Date()): {
  status: "completada"
  completed_at: string
} {
  return { status: "completada", completed_at: now.toISOString() }
}

/** Campos derivados de reabrir una tarea. Limpia la fecha por la misma razón. */
export function reopenTask(): { status: "pendiente"; completed_at: null } {
  return { status: "pendiente", completed_at: null }
}

// ─────────────────────────────────────────────────────────────
// Urgencia y orden
// ─────────────────────────────────────────────────────────────

/**
 * Prioridad de atención de una tarea. Menor = más urgente:
 *
 * - `0` vencida (ya pasó la fecha)
 * - `1` vence hoy
 * - `2` tiene fecha futura
 * - `3` sin fecha
 *
 * La prioridad declarada (`alta`/`media`/`baja`) **no** entra aquí: ordena
 * primero el tiempo, que es lo que se puede incumplir, y solo desempata después.
 * Si `alta` ganara a `vencida`, una tarea marcada alta hace un mes taparía la que
 * se pasó ayer.
 */
export function taskUrgency(task: CrmTask, now: Date = new Date()): 0 | 1 | 2 | 3 {
  if (!task.due_at) return 3
  const due = new Date(task.due_at)
  if (Number.isNaN(due.getTime())) return 3
  if (due <= now) return 0
  return sameLocalDay(due, now) ? 1 : 2
}

/** Mismo día natural en hora local del proceso (no UTC: "hoy" es del usuario). */
function sameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

/** Peso de la prioridad declarada para desempatar; menor = antes. */
const PRIORITY_WEIGHT: Record<CrmTaskPriority, number> = { alta: 0, media: 1, baja: 2 }

/**
 * Ordena por urgencia, luego prioridad declarada y, a igualdad de ambas, la más
 * antigua primero (lleva más esperando).
 *
 * Las completadas van siempre al final, ordenadas por fecha de cierre
 * descendente: la lista sirve para trabajar, no para archivar.
 */
export function sortTasks(tasks: readonly CrmTask[], now: Date = new Date()): CrmTask[] {
  return [...tasks].sort((a, b) => compareTasks(a, b, now))
}

/**
 * El comparador de `sortTasks`, expuesto para ordenar estructuras que envuelven
 * una tarea (una agenda con su cliente) sin descomponerlas y recomponerlas.
 */
export function compareTasks(a: CrmTask, b: CrmTask, now: Date = new Date()): number {
  const openA = isTaskOpen(a)
  const openB = isTaskOpen(b)
  if (openA !== openB) return openA ? -1 : 1
  if (!openA) return (b.completed_at ?? "").localeCompare(a.completed_at ?? "")
  const ua = taskUrgency(a, now)
  const ub = taskUrgency(b, now)
  if (ua !== ub) return ua - ub
  const pa = PRIORITY_WEIGHT[a.priority]
  const pb = PRIORITY_WEIGHT[b.priority]
  if (pa !== pb) return pa - pb
  return a.created_at.localeCompare(b.created_at)
}

/** Las pendientes de una lista, en orden de trabajo. */
export function openTasks(tasks: readonly CrmTask[], now: Date = new Date()): CrmTask[] {
  return sortTasks(tasks, now).filter(isTaskOpen)
}

/** Las vencidas de una lista. Un subconjunto de las abiertas, nunca al revés. */
export function overdueTasks(tasks: readonly CrmTask[], now: Date = new Date()): CrmTask[] {
  return sortTasks(tasks, now).filter((t) => isTaskOverdue(t, now))
}

// ─────────────────────────────────────────────────────────────
// Agenda
// ─────────────────────────────────────────────────────────────

/**
 * Horizontes de la agenda, en el orden en que se leen.
 *
 * `semana` es "en los próximos 7 días, sin contar hoy": una tarea que vence hoy
 * no debe aparecer dos veces, y la que vence en 7 días sí entra. `completadas`
 * es un cajón de archivo, no un horizonte de trabajo — existe para que
 * `taskBucket` sea total y ningún consumidor tenga que ramificar sobre `null`.
 */
export const CRM_TASK_BUCKETS = [
  "vencidas",
  "hoy",
  "semana",
  "despues",
  "sin_fecha",
  "completadas",
] as const

export type CrmTaskBucket = (typeof CRM_TASK_BUCKETS)[number]

export const CRM_TASK_BUCKET_LABEL: Record<CrmTaskBucket, string> = {
  vencidas: "Vencidas",
  hoy: "Hoy",
  semana: "Próximos 7 días",
  despues: "Más adelante",
  sin_fecha: "Sin fecha",
  completadas: "Completadas",
}

/** Días que abarca el horizonte `semana`, contando desde mañana. */
export const TASK_WEEK_DAYS = 7

/**
 * Tamaño de la ventana de la agenda.
 *
 * La superficie avisa cuando lo alcanza: la agenda es la lista de lo que se
 * puede incumplir, y recortarla en silencio esconde precisamente las tareas que
 * llevan más tiempo esperando.
 */
export const TASK_AGENDA_LIMIT = 500

/**
 * Horizonte de una tarea. Función total: las completadas caen en `completadas`
 * sin mirar su fecha, porque una tarea cerrada no vence.
 *
 * Una tarea sin `due_at` cae en `sin_fecha` y **no** en `hoy`: la regla del
 * módulo es que lo no medido no es cero, y "sin fecha" convertido en "vence hoy"
 * es la versión de esta columna del mismo error.
 */
export function taskBucket(task: CrmTask, now: Date = new Date()): CrmTaskBucket {
  if (!isTaskOpen(task)) return "completadas"
  const days = daysUntilDue(task, now)
  if (days === null) return "sin_fecha"
  if (days < 0) return "vencidas"
  if (days === 0) return "hoy"
  if (days <= TASK_WEEK_DAYS) return "semana"
  return "despues"
}

/**
 * Reparte las tareas en los horizontes de la agenda, cada cajón ya ordenado por
 * `sortTasks`.
 *
 * El orden lo decide `sortTasks` y **no** la consulta a la base: la agenda se
 * corta por fecha en la zona del usuario, y PostgREST solo sabe de `TIMESTAMPTZ`.
 * Ordenar en SQL daría una lista que discrepa de los cajones en cuanto un
 * vencimiento cae cerca de la medianoche.
 */
export function groupTasks(
  tasks: readonly CrmTask[],
  now: Date = new Date(),
): Record<CrmTaskBucket, CrmTask[]> {
  const groups = Object.fromEntries(CRM_TASK_BUCKETS.map((b) => [b, [] as CrmTask[]])) as Record<
    CrmTaskBucket,
    CrmTask[]
  >
  for (const task of sortTasks(tasks, now)) {
    groups[taskBucket(task, now)].push(task)
  }
  return groups
}

// ─────────────────────────────────────────────────────────────
// Presentación
// ─────────────────────────────────────────────────────────────

/** Días completos que lleva abierta una tarea; `null` si no se puede medir. */
export function taskAgeDays(task: Pick<CrmTask, "created_at">, now: Date = new Date()): number | null {
  const created = new Date(task.created_at)
  if (Number.isNaN(created.getTime())) return null
  return Math.max(0, Math.floor((now.getTime() - created.getTime()) / 86_400_000))
}

/**
 * Días que faltan para el vencimiento: negativo si ya pasó, `0` si vence hoy.
 *
 * `null` cuando no hay fecha o no es legible. Devolver `0` para "sin fecha"
 * convertiría lo no medido en "vence hoy", que es exactamente el error que la
 * regla del módulo prohíbe.
 */
export function daysUntilDue(
  task: Pick<CrmTask, "due_at">,
  now: Date = new Date(),
): number | null {
  if (!task.due_at) return null
  const due = new Date(task.due_at)
  if (Number.isNaN(due.getTime())) return null
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  return Math.round((startOfDay(due) - startOfDay(now)) / 86_400_000)
}

/** Etiqueta de vencimiento lista para pintar. Nunca inventa una fecha. */
export function formatTaskDue(
  task: Pick<CrmTask, "status" | "due_at">,
  now: Date = new Date(),
): string {
  if (task.status === "completada") return "Completada"
  const days = daysUntilDue(task, now)
  if (days === null) return "Sin fecha"
  if (days < 0) return `Vencida hace ${Math.abs(days)} d`
  if (days === 0) return "Vence hoy"
  if (days === 1) return "Vence mañana"
  return `Vence en ${days} d`
}
