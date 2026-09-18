"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { CalendarClock, Check, Loader2, RefreshCw } from "lucide-react"
import {
  CRM_TASK_BUCKET_LABEL,
  CRM_TASK_PRIORITY_LABEL,
  TASK_AGENDA_LIMIT,
  formatTaskDue,
  groupTaskEntries,
  isTaskOverdue,
  type CrmTask,
  type CrmTaskBucket,
} from "@/lib/crm-tasks"
import {
  getTaskAgenda,
  type TaskAgendaEntry,
  type TaskAgendaProspect,
} from "@/lib/comercializacion/actions/tareas"
import { completeCrmTask } from "../actions"
import { useToast } from "@/components/toast"

/**
 * Agenda de trabajo del CRM (Ronda 16, F4).
 *
 * Es la vista que responde "qué me toca hoy" sin abrir ficha por ficha. Agrupa
 * por horizonte natural —vencidas, hoy, próximos 7 días, más adelante, sin
 * fecha— y no por fecha absoluta: una tarea sin `due_at` no vence, así que
 * tiene su propio cajón y nunca aparece como vencida.
 *
 * El orden y los cajones los decide `crm-tasks.ts` sobre la lista completa que
 * devuelve el servidor, no la consulta: el corte de "hoy" es el día natural en
 * la zona del usuario y PostgREST solo sabe de `TIMESTAMPTZ`.
 */

/** Horizontes que se pintan, en orden de urgencia. */
const BUCKETS: CrmTaskBucket[] = ["vencidas", "hoy", "semana", "despues", "sin_fecha"]

/** Tope de filas pintadas por cajón antes de plegar el resto. */
const BUCKET_PREVIEW = 25

export function LeadAgenda({ onOpenProspect }: { onOpenProspect: (prospectId: number) => void }) {
  const { toast } = useToast()
  const [entries, setEntries] = useState<TaskAgendaEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const [expanded, setExpanded] = useState<CrmTaskBucket | null>(null)

  const load = useCallback(async () => {
    try {
      setEntries(await getTaskAgenda())
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar la agenda")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void Promise.resolve().then(load)
  }, [load, reloadToken])

  const grouped = useMemo(() => groupTaskEntries(entries, (entry) => entry.task), [entries])

  async function complete(task: CrmTask) {
    setBusyId(task.id)
    try {
      await completeCrmTask(task.id)
      toast("Tarea completada", "success")
      setReloadToken((n) => n + 1)
    } catch (e) {
      toast(e instanceof Error ? e.message : "No se pudo completar la tarea", "error")
    } finally {
      setBusyId(null)
    }
  }

  const total = entries.length
  const truncated = total >= TASK_AGENDA_LIMIT

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-bold text-gray-900">
          <CalendarClock className="h-4 w-4" aria-hidden="true" />
          Agenda de tareas
          {total > 0 && <span className="font-normal text-gray-600">({total} abiertas)</span>}
        </h2>
        <button
          type="button"
          onClick={() => setReloadToken((n) => n + 1)}
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-700 hover:bg-gray-50"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          Actualizar
        </button>
      </div>

      {truncated && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Se muestran las {TASK_AGENDA_LIMIT} tareas más urgentes. Hay más trabajo abierto del que
          cabe en esta vista.
        </p>
      )}

      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </p>
      )}

      {loading && total === 0 ? (
        <p className="flex items-center justify-center gap-2 py-16 text-sm text-gray-600">
          <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
          Cargando agenda…
        </p>
      ) : total === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-center">
          <p className="text-sm font-semibold text-gray-900">Nada pendiente</p>
          <p className="mt-1 text-xs text-gray-600">
            Las tareas se crean desde la ficha de cada prospecto. Una tarea sin fecha queda como
            recordatorio abierto y no vence nunca.
          </p>
        </div>
      ) : (
        BUCKETS.map((bucket) => {
          const rows = grouped[bucket]
          if (rows.length === 0) return null
          const open = expanded === bucket
          const visible = open ? rows : rows.slice(0, BUCKET_PREVIEW)
          return (
            <div key={bucket} className="rounded-xl border border-gray-200 bg-white">
              <div className="flex items-center justify-between gap-2 border-b border-gray-100 px-3 py-2">
                <h3
                  className={`text-xs font-bold uppercase tracking-wide ${
                    bucket === "vencidas" ? "text-red-700" : "text-gray-600"
                  }`}
                >
                  {CRM_TASK_BUCKET_LABEL[bucket]}
                  <span className="ml-1.5 font-normal text-gray-600">{rows.length}</span>
                </h3>
                {rows.length > BUCKET_PREVIEW && (
                  <button
                    type="button"
                    onClick={() => setExpanded(open ? null : bucket)}
                    className="text-[11px] font-semibold text-brand-700 hover:underline"
                  >
                    {open ? "Ver menos" : `Ver las ${rows.length}`}
                  </button>
                )}
              </div>
              <ul>
                {visible.map((entry) => (
                  <AgendaRow
                    key={entry.task.id}
                    entry={entry}
                    busy={busyId === entry.task.id}
                    onComplete={complete}
                    onOpenProspect={onOpenProspect}
                  />
                ))}
              </ul>
            </div>
          )
        })
      )}
    </section>
  )
}

function AgendaRow({
  entry,
  busy,
  onComplete,
  onOpenProspect,
}: {
  entry: TaskAgendaEntry
  busy: boolean
  onComplete: (task: CrmTask) => void
  onOpenProspect: (prospectId: number) => void
}) {
  const { task, prospect } = entry
  const overdue = isTaskOverdue(task)
  return (
    <li className="flex items-start gap-3 border-b border-gray-50 px-3 py-2 last:border-b-0">
      <div className="min-w-0 flex-1">
        <p className="text-xs text-gray-900">{task.title}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-gray-600">
          <span className={overdue ? "font-semibold text-red-700" : undefined}>
            {formatTaskDue(task)}
          </span>
          <span>{CRM_TASK_PRIORITY_LABEL[task.priority]}</span>
          {prospect ? (
            <button
              type="button"
              onClick={() => onOpenProspect(prospect.id)}
              className="font-semibold text-brand-700 hover:underline"
            >
              {prospectLabel(prospect)}
            </button>
          ) : (
            <span className="text-gray-500">Prospecto no disponible</span>
          )}
        </p>
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={() => onComplete(task)}
        aria-label={`Marcar «${task.title}» como hecha`}
        className="inline-flex min-h-[36px] flex-none items-center gap-1 rounded-lg border border-gray-200 px-2 text-[11px] font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40"
      >
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
        ) : (
          <Check className="h-3.5 w-3.5" aria-hidden="true" />
        )}
        Hecha
      </button>
    </li>
  )
}

/** El nombre comercial si lo hay; si no, el de contacto. Nunca una cadena vacía. */
function prospectLabel(prospect: TaskAgendaProspect): string {
  const name = prospect.restaurant_name?.trim() || prospect.name.trim()
  return name.length > 0 ? name : `Prospecto #${prospect.id}`
}
