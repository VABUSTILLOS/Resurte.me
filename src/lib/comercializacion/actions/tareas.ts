"use server"

/**
 * Tareas del CRM (Ronda 18, F4 — migración `00185_crm_tasks.sql`).
 *
 * La ficha de prospecto es compartida entre el panel y el vendedor, así que sus
 * comandos también: este módulo sirve a las dos superficies y resuelve el
 * alcance con `CrmScope`, igual que `getProspectDetail`. El panel además lo
 * envuelve en `src/app/admin/actions.ts` para dejar la bitácora de auditoría,
 * que es exclusiva del panel.
 *
 * **El alcance se decide sobre el prospecto, no sobre `crm_tasks.seller_id`.**
 * Ese campo es el responsable de la tarea (y nace copiado del vendedor del
 * prospecto), pero no es una barrera: quien no puede ver el trato no puede
 * tocar su trabajo, y el dueño de la tarea puede cambiar sin que cambie el
 * dueño del trato. Filtrar por `seller_id` aquí dejaría al vendedor operando
 * sobre tareas de prospectos que ya no ve.
 *
 * La agenda filtra por el **vendedor del prospecto**, no por
 * `crm_tasks.seller_id`: es la misma regla que el resto del módulo, y además la
 * única que no se desfasa cuando un trato cambia de manos por una ruta que no
 * toca las tareas.
 */

import { createServiceClient } from "@/lib/supabase/service"
import { requireSellerOrAdminAction } from "@/lib/roles"
import { logger } from "@/lib/logger"
import { applyCrmScope, scopeForRole, type CrmScope } from "@/lib/crm-core"
import {
  DEFAULT_TASK_PRIORITY,
  TASK_AGENDA_LIMIT,
  compareTasks,
  completeTask,
  mapCrmTask,
  normalizeTaskDueAt,
  reopenTask,
  requireTaskPriority,
  requireTaskTitle,
  sortTasks,
  type CrmTask,
  type CrmTaskDraft,
} from "@/lib/crm-tasks"

type Supabase = Awaited<ReturnType<typeof createServiceClient>>

/**
 * Comprueba que el prospecto entra en el alcance y devuelve su vendedor.
 *
 * Lanza `"Prospecto no encontrado"` tanto si no existe como si existe fuera del
 * alcance: para el vendedor son el mismo caso, y distinguirlos convertiría la
 * ficha en un oráculo de qué prospectos tiene el resto del equipo.
 */
async function resolveProspectSeller(
  supabase: Supabase,
  prospectId: number,
  scope: CrmScope,
): Promise<string | null> {
  const query = applyCrmScope(
    supabase.from("crm_prospects").select("id, seller_id").eq("id", prospectId),
    scope,
  )
  const { data, error } = await query.maybeSingle()
  if (error) {
    logger.error("[CRM-TASKS] Error comprobando el prospecto:", error)
    throw new Error("Error al comprobar el prospecto")
  }
  if (!data) throw new Error("Prospecto no encontrado")
  return (data.seller_id as string | null) ?? null
}

/** Idem para una tarea: se comprueba el prospecto del que cuelga. */
async function assertTaskInScope(supabase: Supabase, taskId: number, scope: CrmScope): Promise<void> {
  const { data, error } = await supabase
    .from("crm_tasks")
    .select("id, prospect_id")
    .eq("id", taskId)
    .maybeSingle()
  if (error) {
    logger.error("[CRM-TASKS] Error comprobando la tarea:", error)
    throw new Error("Error al comprobar la tarea")
  }
  if (!data) throw new Error("Tarea no encontrada")
  await resolveProspectSeller(supabase, Number(data.prospect_id), scope)
}

/** Las tareas de un prospecto, ya ordenadas por `sortTasks`. */
export async function listProspectTasks(prospectId: number): Promise<CrmTask[]> {
  const { userId, role } = await requireSellerOrAdminAction()
  const scope = scopeForRole(role, userId)
  const supabase = await createServiceClient()
  await resolveProspectSeller(supabase, prospectId, scope)

  // Sin `order()` a propósito: el orden de trabajo se decide en `sortTasks`, que
  // corta por día natural en la zona del usuario. PostgREST solo sabe de
  // `TIMESTAMPTZ`, así que ordenar aquí daría una lista que discrepa del orden
  // de la agenda en cuanto un vencimiento cae cerca de la medianoche.
  const { data, error } = await supabase
    .from("crm_tasks")
    .select("*")
    .eq("prospect_id", prospectId)

  if (error) {
    logger.error("[CRM-TASKS] Error listando tareas:", error)
    throw new Error("Error al cargar las tareas")
  }
  return sortTasks((data ?? []).map(mapCrmTask))
}

/**
 * Alta de una tarea sobre un prospecto.
 *
 * El responsable nace siendo el vendedor del prospecto y no quien la escribe:
 * un admin repartiendo carga no se queda con el trabajo, y un vendedor
 * apuntándose algo en su propio trato ya es el responsable. Si el prospecto
 * está en el pozo, la tarea nace sin responsable, igual que él.
 */
export async function createTask(prospectId: number, input: CrmTaskDraft): Promise<void> {
  const { userId, role } = await requireSellerOrAdminAction()
  const scope = scopeForRole(role, userId)
  const title = requireTaskTitle(input.title)
  const dueAt = normalizeTaskDueAt(input.due_at)
  const priority =
    input.priority == null || input.priority === ""
      ? DEFAULT_TASK_PRIORITY
      : requireTaskPriority(input.priority)

  const supabase = await createServiceClient()
  const sellerId = await resolveProspectSeller(supabase, prospectId, scope)

  const { error } = await supabase.from("crm_tasks").insert({
    prospect_id: prospectId,
    seller_id: sellerId,
    title,
    due_at: dueAt,
    priority,
    created_by: userId,
  })
  if (error) {
    logger.error("[CRM-TASKS] Error creando tarea:", error)
    throw new Error("Error al crear la tarea")
  }
}

async function patchTask(
  id: number,
  patch: Record<string, unknown>,
  failure: string,
): Promise<void> {
  const { userId, role } = await requireSellerOrAdminAction()
  const scope = scopeForRole(role, userId)
  const supabase = await createServiceClient()
  await assertTaskInScope(supabase, id, scope)

  const { error } = await supabase.from("crm_tasks").update(patch).eq("id", id)
  if (error) {
    logger.error("[CRM-TASKS] Error actualizando tarea:", error)
    throw new Error(failure)
  }
}

/**
 * Completa una tarea. El par `status`/`completed_at` va junto porque el `CHECK`
 * bicondicional de 00185 no admite "completada sin fecha".
 */
export async function completeCrmTask(id: number): Promise<void> {
  await patchTask(id, completeTask(), "Error al completar la tarea")
}

/** Reabre una tarea. Limpia `completed_at` por la misma razón que la completa lo escribe. */
export async function reopenCrmTask(id: number): Promise<void> {
  await patchTask(id, reopenTask(), "Error al reabrir la tarea")
}

/**
 * Borra una tarea. No hay vuelta atrás: el panel lee el título antes de llamar
 * aquí para poder dejarlo en la bitácora.
 */
export async function deleteCrmTask(id: number): Promise<void> {
  const { userId, role } = await requireSellerOrAdminAction()
  const scope = scopeForRole(role, userId)
  const supabase = await createServiceClient()
  await assertTaskInScope(supabase, id, scope)

  const { error } = await supabase.from("crm_tasks").delete().eq("id", id)
  if (error) {
    logger.error("[CRM-TASKS] Error borrando tarea:", error)
    throw new Error("Error al borrar la tarea")
  }
}

/**
 * Las tareas abiertas del alcance, para la agenda.
 *
 * Se pide solo lo pendiente: el cajón de completadas no es trabajo, y traerlo
 * haría que el límite se gastara en archivo. El `order` de SQL solo decide
 * **qué** filas entran cuando hay más que el límite; el orden que se pinta lo
 * pone `groupTaskEntries` en la vista.
 */
/** El prospecto al que pertenece una tarea de la agenda, reducido a su etiqueta. */
export interface TaskAgendaProspect {
  id: number
  name: string
  restaurant_name: string | null
  phone: string | null
}

export interface TaskAgendaEntry {
  task: CrmTask
  prospect: TaskAgendaProspect | null
}

/** Las columnas del prospecto que la agenda necesita para poder nombrarlo. */
const AGENDA_PROSPECT_COLUMNS = "id, name, restaurant_name, phone"

function mapAgendaProspect(value: unknown): TaskAgendaProspect | null {
  if (value == null || typeof value !== "object") return null
  const row = value as Record<string, unknown>
  return {
    id: Number(row.id),
    name: String(row.name ?? ""),
    restaurant_name: typeof row.restaurant_name === "string" ? row.restaurant_name : null,
    phone: typeof row.phone === "string" ? row.phone : null,
  }
}

/**
 * La agenda abierta: todas las tareas pendientes dentro del alcance, con el
 * cliente al que pertenecen.
 *
 * Una tarea sin el nombre del cliente no sirve para trabajar —"Llamar" no dice
 * a quién—, así que el prospecto viene embebido en la misma consulta en vez de
 * resolverse con una segunda pasada por `id`.
 *
 * El orden que devuelve la consulta solo decide **qué filas entran** cuando hay
 * más que el tope (`nullsFirst: false` deja fuera primero a las "sin fecha",
 * que son las que menos urgen); el orden que se pinta lo pone `sortTasks` sobre
 * la lista completa, en la zona del usuario.
 */
export async function getTaskAgenda(): Promise<TaskAgendaEntry[]> {
  const { userId, role } = await requireSellerOrAdminAction()
  const scope = scopeForRole(role, userId)
  const supabase = await createServiceClient()

  // `!inner` no es decorativo: filtrar por un recurso embebido sin `inner` deja
  // la fila padre y anula el embebido, que es justo lo contrario de lo que se
  // quiere. Con `inner`, el filtro del vendedor recorta los padres.
  const query = supabase
    .from("crm_tasks")
    .select(`*, crm_prospects${scope.kind === "seller" ? "!inner" : ""}(${AGENDA_PROSPECT_COLUMNS})`)
    .eq("status", "pendiente")
    .order("due_at", { ascending: true, nullsFirst: false })
    .limit(TASK_AGENDA_LIMIT)

  const scoped = scope.kind === "seller" ? query.eq("crm_prospects.seller_id", scope.userId) : query

  const { data, error } = await scoped
  if (error) {
    logger.error("[CRM-TASKS] Error cargando la agenda:", error)
    throw new Error("Error al cargar la agenda")
  }

  const entries: TaskAgendaEntry[] = (data ?? []).map((raw) => {
    const { crm_prospects: prospect, ...rest } = raw as Record<string, unknown>
    return { task: mapCrmTask(rest), prospect: mapAgendaProspect(prospect) }
  })
  return entries.sort((a, b) => compareTasks(a.task, b.task))
}
