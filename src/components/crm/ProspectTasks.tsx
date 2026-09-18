"use client"

import { useCallback, useEffect, useState } from "react"
import { CalendarClock, Check, Loader2, Plus, RotateCcw, Trash2 } from "lucide-react"
import {
  CRM_TASK_BUCKET_LABEL,
  CRM_TASK_PRIORITIES,
  CRM_TASK_PRIORITY_LABEL,
  DEFAULT_TASK_PRIORITY,
  MAX_TASK_TITLE_LENGTH,
  formatTaskDue,
  groupTasks,
  isTaskOpen,
  taskAgeDays,
  type CrmTask,
  type CrmTaskBucket,
  type CrmTaskDraft,
} from "@/lib/crm-tasks"

/**
 * Tareas del prospecto (Ronda 18, F4).
 *
 * Vive en `crm/` y no en una de las dos superficies porque la ficha es una sola:
 * el panel y el vendedor ven exactamente esta sección, y lo que cambia entre
 * ellos son los comandos que inyectan.
 *
 * La sección se pinta **solo si `listTasks` llega**, igual que el resto de la
 * ficha: una superficie sin comandos no debe mostrar un bloque vacío que parece
 * "este trato no tiene tareas" cuando en realidad es "aquí no se pueden ver".
 *
 * El orden y los cajones los decide `groupTasks` sobre la lista completa que
 * devuelve el servidor, nunca la consulta: la agenda corta por día natural en la
 * zona del usuario y PostgREST solo sabe de `TIMESTAMPTZ`.
 */
export interface ProspectTasksProps {
  prospectId: number
  listTasks: (prospectId: number) => Promise<CrmTask[]>
  /** Sin este comando no se pinta el alta. */
  addTask?: (prospectId: number, draft: CrmTaskDraft) => Promise<void>
  /** Sin este comando la fila es de solo lectura. */
  completeTask?: (taskId: number) => Promise<void>
  reopenTask?: (taskId: number) => Promise<void>
  deleteTask?: (taskId: number) => Promise<void>
  /** Cambiar este número recarga la lista. Lo mueve el refresco de la ficha. */
  reloadToken?: number
  /** `true` mientras la ficha está ocupada en otra acción. */
  disabled?: boolean
}

/** Horizontes que se despliegan. `completadas` se pliega para no comer altura. */
const OPEN_BUCKETS: CrmTaskBucket[] = ["vencidas", "hoy", "semana", "despues", "sin_fecha"]

export function ProspectTasks({
  prospectId,
  listTasks,
  addTask,
  completeTask,
  reopenTask,
  deleteTask,
  reloadToken = 0,
  disabled = false,
}: ProspectTasksProps) {
  const [tasks, setTasks] = useState<CrmTask[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [draftTitle, setDraftTitle] = useState("")
  const [draftDue, setDraftDue] = useState("")
  const [draftPriority, setDraftPriority] = useState<string>(DEFAULT_TASK_PRIORITY)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      setTasks(await listTasks(prospectId))
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar las tareas")
    } finally {
      setLoading(false)
    }
  }, [listTasks, prospectId])

  useEffect(() => {
    void Promise.resolve().then(load)
  }, [load, reloadToken])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!addTask) return
    setSaving(true)
    try {
      await addTask(prospectId, {
        title: draftTitle,
        due_at: draftDue || null,
        priority: draftPriority,
      })
      setDraftTitle("")
      setDraftDue("")
      setDraftPriority(DEFAULT_TASK_PRIORITY)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear la tarea")
    } finally {
      setSaving(false)
    }
  }

  async function act(id: number, run: () => Promise<void>) {
    setBusyId(id)
    try {
      await run()
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo actualizar la tarea")
    } finally {
      setBusyId(null)
    }
  }

  const groups = groupTasks(tasks)
  const openCount = tasks.filter(isTaskOpen).length

  return (
    <section className="mb-4 rounded-lg border border-gray-200 bg-white p-3">
      <h3 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-gray-500">
        <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
        Tareas
        {openCount > 0 && <span className="font-normal text-gray-600">({openCount})</span>}
      </h3>

      {addTask && (
        <form onSubmit={submit} className="mb-3 flex flex-wrap items-end gap-2">
          <label className="min-w-[10rem] flex-1">
            <span className="sr-only">Título de la tarea</span>
            <input
              type="text"
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              maxLength={MAX_TASK_TITLE_LENGTH}
              placeholder="Llamar para confirmar precio"
              className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-xs"
            />
          </label>
          <label>
            <span className="sr-only">Vencimiento</span>
            <input
              type="date"
              value={draftDue}
              onChange={(e) => setDraftDue(e.target.value)}
              className="rounded-lg border border-gray-300 px-2 py-1.5 text-xs"
            />
          </label>
          <label>
            <span className="sr-only">Prioridad</span>
            <select
              value={draftPriority}
              onChange={(e) => setDraftPriority(e.target.value)}
              className="rounded-lg border border-gray-300 px-2 py-1.5 text-xs"
            >
              {CRM_TASK_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {CRM_TASK_PRIORITY_LABEL[p]}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            disabled={saving || disabled || !draftTitle.trim()}
            className="inline-flex items-center gap-1 rounded-lg bg-gray-900 px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
            ) : (
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            Añadir
          </button>
        </form>
      )}

      {error && (
        <p className="mb-2 rounded-lg border border-red-200 bg-red-50 px-2 py-1.5 text-[11px] text-red-700">
          {error}
        </p>
      )}

      {loading && tasks.length === 0 ? (
        <p className="flex items-center gap-1.5 py-1 text-[11px] text-gray-600">
          <Loader2 className="h-3 w-3 animate-spin motion-reduce:animate-none" />
          Cargando tareas…
        </p>
      ) : openCount === 0 && groups.completadas.length === 0 ? (
        <p className="py-1 text-[11px] text-gray-600">
          Sin tareas. Una tarea sin fecha no vence: queda como recordatorio abierto.
        </p>
      ) : (
        <>
          {OPEN_BUCKETS.map((bucket) => (
            <Bucket
              key={bucket}
              bucket={bucket}
              tasks={groups[bucket]}
              busyId={busyId}
              disabled={disabled}
              completeTask={completeTask}
              reopenTask={reopenTask}
              deleteTask={deleteTask}
              onAct={act}
            />
          ))}
          <Bucket
            bucket="completadas"
            tasks={groups.completadas}
            busyId={busyId}
            disabled={disabled}
            completeTask={completeTask}
            reopenTask={reopenTask}
            deleteTask={deleteTask}
            onAct={act}
            collapsed
          />
        </>
      )}
    </section>
  )
}

function Bucket({
  bucket,
  tasks,
  busyId,
  disabled,
  completeTask,
  reopenTask,
  deleteTask,
  onAct,
  collapsed = false,
}: {
  bucket: CrmTaskBucket
  tasks: CrmTask[]
  busyId: number | null
  disabled: boolean
  completeTask?: (taskId: number) => Promise<void>
  reopenTask?: (taskId: number) => Promise<void>
  deleteTask?: (taskId: number) => Promise<void>
  onAct: (id: number, run: () => Promise<void>) => Promise<void>
  collapsed?: boolean
}) {
  if (tasks.length === 0) return null

  return (
    <div className="mb-2 last:mb-0">
      <h4
        className={`mb-1 text-[10px] font-bold uppercase tracking-wide ${
          bucket === "vencidas" ? "text-red-700" : "text-gray-500"
        }`}
      >
        {CRM_TASK_BUCKET_LABEL[bucket]}
        <span className="ml-1 font-normal text-gray-600">({tasks.length})</span>
      </h4>
      <ul className="space-y-1">
        {tasks.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            busy={busyId === task.id}
            disabled={disabled}
            completeTask={completeTask}
            reopenTask={reopenTask}
            deleteTask={deleteTask}
            onAct={onAct}
            collapsed={collapsed}
          />
        ))}
      </ul>
    </div>
  )
}

function TaskRow({
  task,
  busy,
  disabled,
  completeTask,
  reopenTask,
  deleteTask,
  onAct,
  collapsed,
}: {
  task: CrmTask
  busy: boolean
  disabled: boolean
  completeTask?: (taskId: number) => Promise<void>
  reopenTask?: (taskId: number) => Promise<void>
  deleteTask?: (taskId: number) => Promise<void>
  onAct: (id: number, run: () => Promise<void>) => Promise<void>
  collapsed: boolean
}) {
  const open = isTaskOpen(task)
  const age = open ? taskAgeDays(task) : null
  const priority = CRM_TASK_PRIORITY_LABEL[task.priority]

  return (
    <li className="flex items-start gap-2 rounded-lg border border-gray-100 bg-gray-50 px-2 py-1.5">
      <div className="min-w-0 flex-1">
        <p
          className={`text-xs ${open ? "text-gray-900" : "text-gray-500 line-through"}`}
          title={task.title}
        >
          {task.title}
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[10px] text-gray-600">
          <span className={isTaskOverdueLabel(task) ? "font-semibold text-red-700" : undefined}>
            {formatTaskDue(task)}
          </span>
          <span>{priority}</span>
          {/* Lo no medido no es cero: sin `created_at` no se dice "hace 0 días". */}
          {age !== null && age >= 3 && <span>abierta hace {age} días</span>}
        </p>
      </div>
      <div className="flex flex-none items-center gap-1">
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-500 motion-reduce:animate-none" />
        ) : (
          <>
            {open && completeTask && (
              <button
                type="button"
                disabled={disabled}
                onClick={() => onAct(task.id, () => completeTask(task.id))}
                title="Marcar como hecha"
                aria-label={`Marcar «${task.title}» como hecha`}
                className="rounded p-1 text-gray-600 hover:bg-gray-200 hover:text-gray-900 disabled:opacity-50"
              >
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            )}
            {!open && reopenTask && !collapsed && (
              <button
                type="button"
                disabled={disabled}
                onClick={() => onAct(task.id, () => reopenTask(task.id))}
                title="Reabrir"
                aria-label={`Reabrir «${task.title}»`}
                className="rounded p-1 text-gray-600 hover:bg-gray-200 hover:text-gray-900 disabled:opacity-50"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            )}
            {deleteTask && (
              <button
                type="button"
                disabled={disabled}
                onClick={() => onAct(task.id, () => deleteTask(task.id))}
                title="Eliminar"
                aria-label={`Eliminar «${task.title}»`}
                className="rounded p-1 text-gray-600 hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            )}
          </>
        )}
      </div>
    </li>
  )
}

/** Etiqueta de la fila. `formatTaskDue` ya decide el texto; esto solo el color. */
function isTaskOverdueLabel(task: CrmTask): boolean {
  return isTaskOpen(task) && task.due_at !== null && formatTaskDue(task).startsWith("Vencida")
}
