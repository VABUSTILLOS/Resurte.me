"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  ChevronDown,
  Clock,
  Loader2,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Send,
  Trash2,
  XCircle,
  Zap,
} from "lucide-react"
import {
  cancelSequenceEnrollment,
  enrollProspectsInSequence,
  listCrmSequenceEnrollments,
  listCrmSequences,
  listWaTemplates,
  saveCrmSequence,
  toggleCrmSequence,
  type AdminSequence,
} from "../actions"
import { MAX_SEQUENCE_DELAY_HOURS, MAX_SEQUENCE_STEPS } from "@/lib/crm-sequences-engine"
import { QUICK_REPLY_VARIABLES } from "@/lib/crm-inbox"
import {
  ENROLLMENT_STATUSES,
  ENROLLMENT_STATUS_LABEL,
  enrollmentStepLabel,
  enrollmentSummary,
  isEnrollmentOpen,
  type AdminEnrollment,
  type EnrollmentStatus,
  type EnrollmentSummary,
} from "@/lib/crm-enrollments"
import { useToast } from "@/components/toast"

const CARD = "rounded-xl border border-gray-200 bg-white"
const FIELD =
  "w-full rounded-lg border border-gray-200 px-2.5 py-2 text-xs text-gray-700 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"

interface DraftStep {
  delayHours: number
  templateName: string
  body: string
}

const EMPTY_STEP: DraftStep = { delayHours: 24, templateName: "", body: "" }

/** "3 días", "12 h", "0 h" — la espera de un paso, en palabras. */
function delayLabel(hours: number): string {
  if (hours <= 0) return "de inmediato"
  if (hours < 24) return `${hours} h`
  const days = Math.round((hours / 24) * 10) / 10
  return days === 1 ? "1 día" : `${days} días`
}

const ENROLLMENT_PILL: Record<EnrollmentStatus, string> = {
  activa: "bg-emerald-100 text-emerald-800",
  pausada: "bg-amber-100 text-amber-800",
  completada: "bg-sky-100 text-sky-800",
  cancelada: "bg-gray-100 text-gray-600",
}

/** "3 activas · 1 completada" — solo los estados que de verdad existen. */
function summaryLabel(summary: EnrollmentSummary): string {
  const parts = ENROLLMENT_STATUSES.filter((status) => summary[status] > 0).map(
    (status) => `${summary[status]} ${ENROLLMENT_STATUS_LABEL[status].toLowerCase()}`,
  )
  return parts.length > 0 ? parts.join(" · ") : "Sin inscripciones"
}

/**
 * Las inscripciones de una secuencia, plegadas hasta que se piden.
 *
 * Se leen al abrir y no antes: son la única lectura del panel que trae una fila
 * por prospecto, y una secuencia con cientos de inscripciones no debe costar
 * nada mientras el desplegable esté cerrado. Cancelar aquí es lo que hace útil
 * la reactivación: la fila se queda, vuelve a estar disponible para reinscribir.
 */
function SequenceEnrollments({
  sequence,
  onChanged,
}: {
  sequence: AdminSequence
  onChanged: () => void
}) {
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<AdminEnrollment[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [confirmId, setConfirmId] = useState<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setRows(await listCrmSequenceEnrollments(sequence.id))
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron leer las inscripciones")
    } finally {
      setLoading(false)
    }
  }, [sequence.id])

  function toggle() {
    const next = !open
    setOpen(next)
    if (next && rows === null && !loading) void load()
  }

  async function cancel(enrollment: AdminEnrollment) {
    setBusyId(enrollment.id)
    try {
      await cancelSequenceEnrollment(enrollment.id)
      toast(`Inscripción de ${enrollment.prospectName} cancelada`, "success")
      setConfirmId(null)
      await load()
      onChanged()
    } catch (e) {
      toast(e instanceof Error ? e.message : "No se pudo cancelar la inscripción", "error")
    } finally {
      setBusyId(null)
    }
  }

  const summary = rows === null ? null : enrollmentSummary(rows)

  return (
    <div className="mt-2 border-t border-gray-100 pt-2">
      <button
        type="button"
        aria-expanded={open}
        onClick={toggle}
        className="inline-flex min-h-[32px] items-center gap-1 text-[11px] font-semibold text-gray-500 hover:text-gray-700"
      >
        <ChevronDown
          className={`h-3 w-3 transition-transform motion-reduce:transition-none ${open ? "" : "-rotate-90"}`}
        />
        Inscripciones
        {summary && <span className="font-normal text-gray-600">· {summaryLabel(summary)}</span>}
      </button>

      {open && (
        <div className="mt-1.5">
          {loading && rows === null ? (
            <p className="flex items-center gap-2 py-2 text-[11px] text-gray-600">
              <Loader2 className="h-3 w-3 animate-spin motion-reduce:animate-none" /> Cargando...
            </p>
          ) : error ? (
            <div className="flex items-center gap-2 py-2">
              <p className="flex-1 text-[11px] text-red-700">{error}</p>
              <button
                type="button"
                onClick={() => void load()}
                className="min-h-[32px] rounded-lg border border-gray-200 px-2.5 text-[11px] font-semibold text-gray-700 hover:bg-gray-50"
              >
                Reintentar
              </button>
            </div>
          ) : rows !== null && rows.length === 0 ? (
            <p className="py-2 text-[11px] text-gray-600">
              Nadie inscrito todavía. Selecciona prospectos en el embudo y usa «Inscribir en
              secuencia».
            </p>
          ) : (
            <ul className="divide-y divide-gray-50">
              {(rows ?? []).map((enrollment) => (
                <li key={enrollment.id} className="flex flex-wrap items-center gap-2 py-1.5">
                  <span className="min-w-[8rem] flex-1 truncate text-[11px] font-medium text-gray-700">
                    {enrollment.prospectName}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${ENROLLMENT_PILL[enrollment.status]}`}
                  >
                    {enrollment.statusLabel}
                  </span>
                  <span className="w-20 shrink-0 text-[11px] tabular-nums text-gray-500">
                    {enrollmentStepLabel(enrollment.currentStep, enrollment.totalSteps)}
                  </span>
                  <span className="w-32 shrink-0 truncate text-[11px] text-gray-600">
                    {enrollment.nextRunAt
                      ? new Date(enrollment.nextRunAt).toLocaleString("es-MX", {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "—"}
                  </span>
                  {isEnrollmentOpen(enrollment.status) &&
                    (confirmId === enrollment.id ? (
                      <span className="flex items-center gap-1">
                        <button
                          type="button"
                          disabled={busyId !== null}
                          onClick={() => void cancel(enrollment)}
                          className="min-h-[32px] rounded-lg bg-red-600 px-2.5 text-[11px] font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                        >
                          {busyId === enrollment.id ? "Cancelando..." : "Sí, cancelar"}
                        </button>
                        <button
                          type="button"
                          disabled={busyId !== null}
                          onClick={() => setConfirmId(null)}
                          className="min-h-[32px] rounded-lg border border-gray-200 px-2.5 text-[11px] font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                        >
                          No
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmId(enrollment.id)}
                        aria-label={`Cancelar la inscripción de ${enrollment.prospectName}`}
                        className="inline-flex min-h-[32px] items-center gap-1 rounded-lg border border-gray-200 px-2.5 text-[11px] font-semibold text-gray-600 hover:bg-gray-50"
                      >
                        <XCircle className="h-3 w-3" /> Cancelar
                      </button>
                    ))}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-1.5 text-[10px] text-gray-600">
            Cancelar no borra la fila: el prospecto deja de recibir pasos y puede volver a
            inscribirse en esta misma secuencia.
          </p>
        </div>
      )}
    </div>
  )
}

/**
 * Gestor de secuencias de goteo. Crear, editar y encender/apagar.
 *
 * Nada se envía desde aquí: una secuencia encendida solo programa los pasos,
 * el cron diario es el único que envía, un paso por inscripción vencida.
 */
export function LeadSequences({ onChanged }: { onChanged: () => void }) {
  const { toast } = useToast()
  const [sequences, setSequences] = useState<AdminSequence[]>([])
  const [templates, setTemplates] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState<number | "nuevo" | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setSequences(await listCrmSequences())
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar las secuencias")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void Promise.resolve().then(load)
  }, [load])

  useEffect(() => {
    void listWaTemplates()
      .then((rows) =>
        setTemplates(
          rows
            .filter((row) => row.status === "approved")
            .map((row) => row.template_name)
            .sort((a, b) => a.localeCompare(b, "es")),
        ),
      )
      .catch(() => setTemplates([]))
  }, [])

  async function toggle(sequence: AdminSequence) {
    setBusy(true)
    try {
      await toggleCrmSequence(sequence.id, !sequence.isActive)
      toast(
        sequence.isActive
          ? `«${sequence.name}» en pausa: no programa más pasos`
          : `«${sequence.name}» activa`,
        "success",
      )
      await load()
      onChanged()
    } catch (e) {
      toast(e instanceof Error ? e.message : "No se pudo cambiar la secuencia", "error")
    } finally {
      setBusy(false)
    }
  }

  const editingSequence =
    editing === "nuevo" ? null : (sequences.find((s) => s.id === editing) ?? null)

  if (loading && sequences.length === 0) {
    return (
      <p className="flex items-center gap-2 py-10 text-sm text-gray-600">
        <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> Cargando secuencias...
      </p>
    )
  }

  if (error) {
    return (
      <div className={`${CARD} p-6 text-center`}>
        <p className="text-sm font-medium text-red-700">{error}</p>
        <button
          type="button"
          onClick={() => void load()}
          className="mt-3 min-h-[44px] rounded-lg bg-gray-900 px-4 text-sm font-semibold text-white"
        >
          Reintentar
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className={`${CARD} flex flex-wrap items-center gap-2 p-3`}>
        <p className="flex-1 text-xs text-gray-500">
          Una secuencia encendida programa un paso por corrida del cron. Sin plantilla aprobada y con
          la ventana de 24 h cerrada, el paso se registra como omitido, nunca se fuerza el envío.
        </p>
        <button
          type="button"
          onClick={() => void load()}
          aria-label="Refrescar secuencias"
          className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border border-gray-200 px-3 text-xs font-semibold text-gray-600 hover:bg-gray-50"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${loading ? "animate-spin motion-reduce:animate-none" : ""}`}
          />
          Refrescar
        </button>
        <button
          type="button"
          onClick={() => setEditing("nuevo")}
          className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl bg-brand-600 px-3 text-xs font-semibold text-white hover:bg-brand-700"
        >
          <Plus className="h-3.5 w-3.5" /> Nueva secuencia
        </button>
      </div>

      {editing !== null && (
        <SequenceForm
          sequence={editingSequence}
          templates={templates}
          onCancel={() => setEditing(null)}
          onSaved={async (name) => {
            setEditing(null)
            toast(`Secuencia «${name}» guardada`, "success")
            await load()
            onChanged()
          }}
        />
      )}

      {sequences.length === 0 && editing === null ? (
        <div className={`${CARD} px-4 py-12 text-center`}>
          <Zap className="mx-auto h-6 w-6 text-gray-300" />
          <p className="mt-2 text-sm font-medium text-gray-700">Todavía no hay secuencias</p>
          <p className="mt-1 text-xs text-gray-500">
            Crea una para dar seguimiento automático a los prospectos que se enfrían.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {sequences.map((sequence) => (
            <li key={sequence.id} className={`${CARD} p-3`}>
              <div className="flex flex-wrap items-start gap-2">
                <div className="min-w-[12rem] flex-1">
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
                    {sequence.name}
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        sequence.isActive
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {sequence.isActive ? "Activa" : "En pausa"}
                    </span>
                  </p>
                  {sequence.description && (
                    <p className="mt-0.5 text-xs text-gray-500">{sequence.description}</p>
                  )}
                  <p className="mt-1 text-[11px] text-gray-600">
                    {sequence.steps.length} paso{sequence.steps.length === 1 ? "" : "s"} ·{" "}
                    {sequence.activeEnrollments} en curso
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setEditing(sequence.id)}
                    className="min-h-[36px] rounded-lg border border-gray-200 px-3 text-[11px] font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void toggle(sequence)}
                    className={`inline-flex min-h-[36px] items-center gap-1 rounded-lg px-3 text-[11px] font-semibold disabled:opacity-50 ${
                      sequence.isActive
                        ? "border border-gray-200 text-gray-700 hover:bg-gray-50"
                        : "bg-gray-900 text-white hover:bg-gray-800"
                    }`}
                  >
                    {sequence.isActive ? (
                      <>
                        <Pause className="h-3.5 w-3.5" /> Pausar
                      </>
                    ) : (
                      <>
                        <Play className="h-3.5 w-3.5" /> Activar
                      </>
                    )}
                  </button>
                </div>
              </div>

              <ol className="mt-2 space-y-1">
                {sequence.steps.map((step) => (
                  <li key={step.stepOrder} className="flex items-start gap-2 text-[11px] text-gray-600">
                    <span className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-gray-100 text-[10px] font-semibold text-gray-600">
                      {step.stepOrder}
                    </span>
                    <Clock className="mt-0.5 h-3 w-3 shrink-0 text-gray-600" />
                    <span className="shrink-0 text-gray-500">{delayLabel(step.delayHours)}</span>
                    <span className="min-w-0 flex-1 truncate">
                      {step.templateName ? (
                        <span className="font-mono text-[10px] text-gray-700">
                          {step.templateName}
                        </span>
                      ) : (
                        step.body
                      )}
                    </span>
                  </li>
                ))}
              </ol>

              <SequenceEnrollments sequence={sequence} onChanged={onChanged} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

interface SequenceFormProps {
  sequence: AdminSequence | null
  templates: string[]
  onCancel: () => void
  onSaved: (name: string) => void | Promise<void>
}

function SequenceForm({ sequence, templates, onCancel, onSaved }: SequenceFormProps) {
  const [name, setName] = useState(sequence?.name ?? "")
  const [description, setDescription] = useState(sequence?.description ?? "")
  const [isActive, setIsActive] = useState(sequence?.isActive ?? false)
  const [steps, setSteps] = useState<DraftStep[]>(
    sequence && sequence.steps.length > 0
      ? sequence.steps.map((step) => ({
          delayHours: step.delayHours,
          templateName: step.templateName ?? "",
          body: step.body ?? "",
        }))
      : [{ ...EMPTY_STEP }],
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function patchStep(index: number, patch: Partial<DraftStep>) {
    setSteps((prev) => prev.map((step, i) => (i === index ? { ...step, ...patch } : step)))
  }

  const validSteps = useMemo(
    () => steps.filter((step) => step.templateName.trim() || step.body.trim()).length,
    [steps],
  )

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await saveCrmSequence({
        id: sequence?.id ?? null,
        name,
        description,
        isActive,
        steps: steps.map((step) => ({
          delayHours: step.delayHours,
          templateName: step.templateName,
          body: step.body,
        })),
      })
      await onSaved(name.trim())
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar la secuencia")
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className={`${CARD} space-y-3 p-3`}>
      <p className="text-sm font-semibold text-gray-900">
        {sequence ? `Editar «${sequence.name}»` : "Nueva secuencia"}
      </p>

      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold text-gray-600">Nombre</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={80}
            placeholder="Reactivación 30 días"
            className={FIELD}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold text-gray-600">
            Descripción (opcional)
          </span>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={200}
            placeholder="Para prospectos que no respondieron"
            className={FIELD}
          />
        </label>
      </div>

      <div className="space-y-2">
        <p className="text-[11px] font-semibold text-gray-600">
          Pasos ({steps.length}/{MAX_SEQUENCE_STEPS})
        </p>
        {steps.map((step, index) => (
          <div
            key={index}
            className="rounded-lg border border-gray-200 bg-gray-50/60 p-2.5"
          >
            <div className="flex items-center gap-2">
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-white text-[10px] font-semibold text-gray-600 ring-1 ring-gray-200">
                {index + 1}
              </span>
              <label className="flex items-center gap-1.5 text-[11px] text-gray-600">
                <Clock className="h-3 w-3 text-gray-600" />
                Espera
                <input
                  type="number"
                  min={0}
                  max={MAX_SEQUENCE_DELAY_HOURS}
                  value={step.delayHours}
                  onChange={(e) => patchStep(index, { delayHours: Number(e.target.value) })}
                  className="w-20 rounded-lg border border-gray-200 px-2 py-1 text-xs"
                />
                h
              </label>
              <span className="flex-1 text-[11px] text-gray-600">
                {delayLabel(step.delayHours)} después del paso anterior
              </span>
              {steps.length > 1 && (
                <button
                  type="button"
                  aria-label={`Quitar el paso ${index + 1}`}
                  onClick={() => setSteps((prev) => prev.filter((_, i) => i !== index))}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-gray-600 hover:bg-white hover:text-red-700"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
              <label className="block">
                <span className="mb-1 block text-[10px] font-semibold text-gray-500">
                  Plantilla aprobada (opcional)
                </span>
                <input
                  value={step.templateName}
                  onChange={(e) => patchStep(index, { templateName: e.target.value })}
                  list="crm-sequence-templates"
                  placeholder="reactivacion_30_dias"
                  className={`${FIELD} font-mono`}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[10px] font-semibold text-gray-500">
                  Texto libre (solo dentro de la ventana de 24 h)
                </span>
                <textarea
                  value={step.body}
                  onChange={(e) => patchStep(index, { body: e.target.value })}
                  rows={2}
                  maxLength={1024}
                  placeholder="Hola {{nombre}}, ¿seguimos con tu pedido?"
                  className={FIELD}
                />
              </label>
            </div>
          </div>
        ))}
        <datalist id="crm-sequence-templates">
          {templates.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>

        {steps.length < MAX_SEQUENCE_STEPS && (
          <button
            type="button"
            onClick={() => setSteps((prev) => [...prev, { ...EMPTY_STEP }])}
            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-dashed border-gray-300 px-3 text-[11px] font-semibold text-gray-600 hover:bg-gray-50"
          >
            <Plus className="h-3.5 w-3.5" /> Añadir paso
          </button>
        )}
      </div>

      <p className="text-[11px] text-gray-600">
        Variables disponibles:{" "}
        {QUICK_REPLY_VARIABLES.map((v) => `{{${v}}}`).join(", ")}. Un paso sin plantilla aprobada
        solo se envía si el prospecto escribió en las últimas 24 h.
      </p>

      <label className="flex items-center gap-2 text-xs text-gray-700">
        <input
          type="checkbox"
          checked={isActive}
          onChange={(e) => setIsActive(e.target.checked)}
          className="h-4 w-4 rounded border-gray-300"
        />
        Activar al guardar
      </label>

      {error && <p className="text-xs font-medium text-red-700">{error}</p>}

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={busy || name.trim().length === 0 || validSteps === 0}
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />}
          Guardar
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex min-h-[44px] items-center rounded-lg px-4 text-sm font-semibold text-gray-600 hover:bg-gray-50"
        >
          Cancelar
        </button>
        {validSteps === 0 && (
          <span className="text-[11px] text-amber-700">
            Cada paso necesita plantilla o texto
          </span>
        )}
      </div>
    </form>
  )
}

/**
 * Botón de la barra de selección del pipeline: inscribe lo seleccionado en una
 * secuencia. Solo encola; el primer envío lo hace el cron.
 */
export function SequenceEnrollControl({
  selectedIds,
  disabled,
  onEnrolled,
}: {
  selectedIds: number[]
  disabled: boolean
  onEnrolled: (message: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [sequences, setSequences] = useState<AdminSequence[] | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)

  useEffect(() => {
    if (!open || sequences !== null) return
    void listCrmSequences()
      .then(setSequences)
      .catch(() => setSequences([]))
  }, [open, sequences])

  async function enroll(sequence: AdminSequence) {
    setBusyId(sequence.id)
    try {
      const result = await enrollProspectsInSequence(sequence.id, selectedIds)
      const parts: string[] = []
      if (result.enrolled > 0) parts.push(`${result.enrolled} en «${sequence.name}»`)
      if (result.reactivated > 0) parts.push(`${result.reactivated} reactivados`)
      if (result.skipped > 0) parts.push(`${result.skipped} sin cambios`)
      onEnrolled(parts.length > 0 ? parts.join(" · ") : (result.reason ?? "Sin cambios"))
      setOpen(false)
    } catch (e) {
      onEnrolled(e instanceof Error ? e.message : "No se pudieron inscribir")
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-gray-200 px-3 text-[11px] font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
      >
        <Send className="h-3.5 w-3.5" /> Inscribir en secuencia
        <ChevronDown className="h-3 w-3 text-gray-600" />
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-1 w-64 rounded-xl border border-gray-200 bg-white p-2 shadow-lg">
          {sequences === null ? (
            <p className="flex items-center gap-2 px-2 py-3 text-[11px] text-gray-600">
              <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" /> Cargando...
            </p>
          ) : sequences.length === 0 ? (
            <p className="px-2 py-3 text-[11px] text-gray-500">
              No hay secuencias. Créalas en la pestaña Bandeja.
            </p>
          ) : (
            <ul className="max-h-64 overflow-y-auto">
              {sequences.map((sequence) => (
                <li key={sequence.id}>
                  <button
                    type="button"
                    disabled={busyId !== null || !sequence.isActive}
                    title={sequence.isActive ? undefined : "La secuencia está en pausa"}
                    onClick={() => void enroll(sequence)}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-[11px] font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    {busyId === sequence.id ? (
                      <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin motion-reduce:animate-none" />
                    ) : (
                      <Zap
                        className={`h-3.5 w-3.5 shrink-0 ${
                          sequence.isActive ? "text-brand-600" : "text-gray-300"
                        }`}
                      />
                    )}
                    <span className="min-w-0 flex-1 truncate">{sequence.name}</span>
                    <span className="shrink-0 text-[10px] text-gray-600">
                      {sequence.steps.length} pasos
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
