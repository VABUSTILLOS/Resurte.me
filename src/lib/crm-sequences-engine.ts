// ============================================================
// Motor de secuencias de goteo del CRM (Ronda 6 — C8).
//
// Una secuencia es una lista ordenada de pasos (`crm_sequence_steps`). Un
// prospecto se INSCRIBE (`crm_sequence_enrollments`) y desde ahí el cron diario
// avanza un paso por corrida. La inscripción nunca envía nada: solo encola.
//
// Reglas duras (no negociables):
//  1. Consentimiento antes que volumen. Un prospecto del CRM no es un usuario
//     registrado, así que su consentimiento es DESCONOCIDO: solo se envía
//     plantilla aprobada por Meta, salvo que la ventana de servicio de 24 h
//     esté abierta (el cliente nos escribió; WhatsApp permite responder).
//  2. Nada se envía en silencio: lo que no cumpla se registra como `skipped`
//     con el motivo en `whatsapp_automation_sends.detail`.
//  3. Tope por corrida (`MAX_SEQUENCE_SENDS_PER_RUN`): un cron nunca dispara en
//     bloque, aunque haya miles de inscripciones vencidas.
//
// Los envíos se registran en `whatsapp_automation_sends` (00097) con
// `automation_type = 'crm_sequence'`, reutilizando su `dedupe_key UNIQUE`: un
// reintento del mismo paso no vuelve a escribir al cliente.
// ============================================================

import type { SupabaseClient } from "@supabase/supabase-js"
import { logger } from "@/lib/logger"
import { mapCrmProspect } from "@/lib/crm-core"
import { createServiceClient } from "@/lib/supabase/service"
import { sendTemplate, sendTextMessage } from "@/lib/whatsapp"
import { isMissingRelationError } from "@/lib/sale-window"
import {
  buildThread,
  nextSequenceRun,
  quickReplyValuesFor,
  renderQuickReply,
  sequenceDedupeKey,
  indexMessagesByPhone,
  phoneLookupVariants,
  type ConversationProspect,
  type InboxMessage,
} from "@/lib/crm-inbox"

/** Tope de envíos por corrida. El resto queda para el día siguiente. */
export const MAX_SEQUENCE_SENDS_PER_RUN = 50

/** Tope de pasos por secuencia. Una secuencia de 50 pasos no es un goteo. */
export const MAX_SEQUENCE_STEPS = 10

/** Tope de espera por paso (30 días). */
export const MAX_SEQUENCE_DELAY_HOURS = 24 * 30

/** Inscripciones que se leen para poder descartar las que no cumplen reglas. */
export const MAX_SEQUENCE_CANDIDATES = 200

/** Motivos de omisión. Se guardan tal cual en `whatsapp_automation_sends.detail`. */
export const SEQUENCE_SKIP_NO_PHONE = "el prospecto no tiene teléfono"
export const SEQUENCE_SKIP_NO_TEMPLATE =
  "sin plantilla aprobada y ventana de servicio de 24 h cerrada"

export const CRM_SEQUENCE_AUTOMATION_TYPE = "crm_sequence"

/** Tamaño máximo de un lote de inscripción desde el panel. */
export const MAX_SEQUENCE_ENROLLMENTS_PER_BATCH = 200

export interface SequenceStep {
  id: number
  sequence_id: number
  step_order: number
  delay_hours: number
  template_name: string | null
  body: string | null
}

export interface SequenceEnrollment {
  id: number
  sequence_id: number
  prospect_id: number
  current_step: number
  next_run_at: string | null
  status: string
}

export interface SequenceProspect {
  id: number
  name: string
  restaurant_name: string | null
  phone: string | null
  whatsapp: string | null
}

// ---------- Helpers puros ----------

/** Pasos ordenados de menor a mayor. No muta la entrada. */
export function sortSequenceSteps(steps: readonly SequenceStep[]): SequenceStep[] {
  return [...steps].sort((a, b) => a.step_order - b.step_order)
}

/**
 * Paso siguiente al último ejecutado. `current_step = 0` significa "nada
 * enviado todavía", así que devuelve el paso 1. `null` = secuencia terminada.
 */
export function nextSequenceStep(
  steps: readonly SequenceStep[],
  currentStep: number
): SequenceStep | null {
  const ordered = sortSequenceSteps(steps)
  const last = Number.isFinite(currentStep) ? Math.max(0, currentStep) : 0
  return ordered.find((s) => s.step_order > last) ?? null
}

/** Texto del paso, con las variables `{{nombre}}` ya sustituidas. */
export function sequenceStepText(
  step: Pick<SequenceStep, "body">,
  values: Record<string, string | null | undefined> = {}
): string {
  return step.body ? renderQuickReply(step.body, values).trim() : ""
}

export interface SequenceSkipContext {
  /** ¿Hay ventana de servicio de 24 h abierta para este teléfono? */
  windowOpen: boolean
  /** Teléfono de destino ya resuelto (`whatsapp ?? phone`). */
  recipient: string | null
}

/**
 * Motivo por el que este paso NO se puede enviar, o `null` si sí se puede.
 *
 * Se evalúa en este orden: sin teléfono no hay nada que hacer; y sin plantilla
 * aprobada solo se puede escribir con la ventana abierta.
 */
export function sequenceSkipReason(
  step: Pick<SequenceStep, "template_name">,
  ctx: SequenceSkipContext
): string | null {
  if (!ctx.recipient) return SEQUENCE_SKIP_NO_PHONE
  if (!step.template_name && !ctx.windowOpen) return SEQUENCE_SKIP_NO_TEMPLATE
  return null
}

export interface SequencePlan {
  enrollmentId: number
  prospectId: number
  sequenceId: number
  stepOrder: number
  /** Clave de dedupe en `whatsapp_automation_sends.dedupe_key`. */
  dedupeKey: string
  recipient: string | null
  templateName: string | null
  text: string
  /** `null` = enviar. Cualquier otra cosa = registrar `skipped` con este motivo. */
  skipReason: string | null
}

export interface SequencePlanOptions {
  windowOpen: boolean
  sellerName?: string | null
}

/**
 * Decide qué hacer con una inscripción vencida. `null` = no queda ningún paso
 * (la inscripción se marca `completada`, no se envía nada).
 *
 * Es puro: no consulta ni escribe. El runner es quien aplica el plan.
 */
export function planSequenceEnrollment(
  enrollment: SequenceEnrollment,
  steps: readonly SequenceStep[],
  prospect: SequenceProspect,
  options: SequencePlanOptions
): SequencePlan | null {
  const step = nextSequenceStep(steps, enrollment.current_step)
  if (!step) return null

  const recipient = prospect.whatsapp ?? prospect.phone
  const values = quickReplyValuesFor(
    {
      name: prospect.name,
      restaurant_name: prospect.restaurant_name,
      phone: prospect.phone,
      whatsapp: prospect.whatsapp,
    },
    options.sellerName ?? null
  )

  return {
    enrollmentId: enrollment.id,
    prospectId: prospect.id,
    sequenceId: enrollment.sequence_id,
    stepOrder: step.step_order,
    dedupeKey: sequenceDedupeKey(enrollment.sequence_id, prospect.id, step.step_order),
    recipient,
    templateName: step.template_name,
    text: sequenceStepText(step, values),
    skipReason: sequenceSkipReason(step, { windowOpen: options.windowOpen, recipient }),
  }
}

export interface SequenceAdvance {
  current_step: number
  next_run_at: string | null
  status: "activa" | "completada"
}

/**
 * Estado de la inscripción después de procesar `step`.
 *
 * `from` es el instante de referencia (normalmente `now`): la espera del paso
 * siguiente se cuenta desde que se procesó el anterior, no desde la inscripción.
 */
export function advanceSequenceEnrollment(
  step: Pick<SequenceStep, "step_order">,
  steps: readonly SequenceStep[],
  from: Date | string
): SequenceAdvance {
  const next = nextSequenceStep(steps, step.step_order)
  if (!next) return { current_step: step.step_order, next_run_at: null, status: "completada" }
  return {
    current_step: step.step_order,
    next_run_at: nextSequenceRun(from, next.delay_hours),
    status: "activa",
  }
}

// ---------- Runner ----------

export interface SequenceRunResult {
  /** `false` cuando la migración 00140 todavía no está aplicada. */
  active: boolean
  sequences: number
  candidates: number
  sent: number
  skipped: number
  failed: number
  completed: number
  errors: string[]
}

const emptyRun = (active: boolean): SequenceRunResult => ({
  active,
  sequences: 0,
  candidates: 0,
  sent: 0,
  skipped: 0,
  failed: 0,
  completed: 0,
  errors: [],
})

interface SequenceRow {
  id: number
  name: string
}

/**
 * Ejecuta las secuencias activas cuyo siguiente paso ya venció.
 *
 * Nunca lanza: un fallo se registra en `errors` y el resto de la corrida sigue.
 * Es idempotente: el `dedupe_key` de cada paso impide reenviar.
 */
export async function runCrmSequences(now: Date = new Date()): Promise<SequenceRunResult> {
  const supabase = await createServiceClient()

  let sequences: SequenceRow[]
  try {
    const { data, error } = await supabase
      .from("crm_sequences")
      .select("id, name")
      .eq("is_active", true)
    if (error) {
      if (isMissingRelationError(error)) {
        logger.warn("Secuencias del CRM no disponibles (migración 00140 sin aplicar)")
        return emptyRun(false)
      }
      throw error
    }
    sequences = (data ?? []) as SequenceRow[]
  } catch (err) {
    logger.error("[CRM-SEQUENCES] No se pudieron leer las secuencias:", err)
    return { ...emptyRun(true), errors: [err instanceof Error ? err.message : String(err)] }
  }

  if (sequences.length === 0) return emptyRun(true)

  const result: SequenceRunResult = { ...emptyRun(true), sequences: sequences.length }
  const sequenceIds = sequences.map((s) => s.id)

  const stepsBySequence = new Map<number, SequenceStep[]>()
  try {
    const { data, error } = await supabase
      .from("crm_sequence_steps")
      .select("id, sequence_id, step_order, delay_hours, template_name, body")
      .in("sequence_id", sequenceIds)
    if (error) throw error
    for (const row of (data ?? []) as SequenceStep[]) {
      const bucket = stepsBySequence.get(row.sequence_id)
      if (bucket) bucket.push(row)
      else stepsBySequence.set(row.sequence_id, [row])
    }
  } catch (err) {
    logger.error("[CRM-SEQUENCES] No se pudieron leer los pasos:", err)
    result.errors.push(err instanceof Error ? err.message : String(err))
    return result
  }

  const dueEnrollments = await loadDueEnrollments(supabase, sequenceIds, now, result)
  result.candidates = dueEnrollments.length
  if (dueEnrollments.length === 0) return result

  const prospects = await loadSequenceProspects(supabase, dueEnrollments, result)
  const messages = await loadSequenceMessages(supabase, prospects.values(), result)

  for (const enrollment of dueEnrollments) {
    if (result.sent + result.skipped + result.failed >= MAX_SEQUENCE_SENDS_PER_RUN) break

    const steps = stepsBySequence.get(enrollment.sequence_id) ?? []
    const prospect = prospects.get(enrollment.prospect_id)

    if (!prospect) {
      // El prospecto se borró o no se pudo leer: no se puede seguir nutriendo.
      await markEnrollment(supabase, enrollment.id, {
        current_step: enrollment.current_step,
        next_run_at: null,
        status: "cancelada",
      })
      continue
    }

    const thread = buildThread(
      toConversationProspect(prospect),
      indexMessagesByPhone(messages),
      now
    )
    const plan = planSequenceEnrollment(enrollment, steps, prospect, {
      windowOpen: thread.window.open,
    })

    if (!plan) {
      await markEnrollment(supabase, enrollment.id, {
        current_step: enrollment.current_step,
        next_run_at: null,
        status: "completada",
      })
      result.completed++
      continue
    }

    const outcome = await deliverSequenceStep(supabase, plan)
    if (outcome === "sent") result.sent++
    else if (outcome === "failed") result.failed++
    else result.skipped++

    const step = nextSequenceStep(steps, enrollment.current_step)
    if (!step) continue
    const advance = advanceSequenceEnrollment(step, steps, now)
    if (advance.status === "completada") result.completed++
    await markEnrollment(supabase, enrollment.id, advance)
  }

  return result
}

/** Inscripciones activas ya vencidas, en orden de antigüedad. */
async function loadDueEnrollments(
  supabase: SupabaseClient,
  sequenceIds: readonly number[],
  now: Date,
  result: SequenceRunResult
): Promise<SequenceEnrollment[]> {
  try {
    const { data, error } = await supabase
      .from("crm_sequence_enrollments")
      .select("id, sequence_id, prospect_id, current_step, next_run_at, status")
      .eq("status", "activa")
      .in("sequence_id", sequenceIds)
      .not("next_run_at", "is", null)
      .lte("next_run_at", now.toISOString())
      .order("next_run_at", { ascending: true })
      .limit(MAX_SEQUENCE_CANDIDATES)
    if (error) throw error
    return (data ?? []) as SequenceEnrollment[]
  } catch (err) {
    logger.error("[CRM-SEQUENCES] No se pudieron leer las inscripciones:", err)
    result.errors.push(err instanceof Error ? err.message : String(err))
    return []
  }
}

async function loadSequenceProspects(
  supabase: SupabaseClient,
  enrollments: readonly SequenceEnrollment[],
  result: SequenceRunResult
): Promise<Map<number, SequenceProspect>> {
  const ids = [...new Set(enrollments.map((e) => e.prospect_id))]
  const map = new Map<number, SequenceProspect>()
  if (ids.length === 0) return map
  try {
    const { data, error } = await supabase
      .from("crm_prospects")
      .select("id, name, restaurant_name, phone, whatsapp")
      .in("id", ids)
    if (error) throw error
    for (const row of (data ?? []) as SequenceProspect[]) map.set(row.id, row)
  } catch (err) {
    logger.error("[CRM-SEQUENCES] No se pudieron leer los prospectos:", err)
    result.errors.push(err instanceof Error ? err.message : String(err))
  }
  return map
}

/**
 * Mensajes recientes de los teléfonos implicados, para saber si la ventana de
 * servicio está abierta. Si falla, se devuelve vacío: sin mensajes la ventana
 * se considera cerrada y solo saldrán plantillas (el lado conservador).
 */
async function loadSequenceMessages(
  supabase: SupabaseClient,
  prospects: Iterable<SequenceProspect>,
  result: SequenceRunResult
): Promise<InboxMessage[]> {
  const variants = new Set<string>()
  for (const p of prospects) {
    for (const phone of [p.whatsapp, p.phone]) {
      for (const variant of phoneLookupVariants(phone)) variants.add(variant)
    }
  }
  if (variants.size === 0) return []
  try {
    const { data, error } = await supabase
      .from("whatsapp_messages")
      .select("id, direction, content, created_at, message_type, from_number")
      .in("from_number", [...variants])
      .order("created_at", { ascending: true })
      .limit(2000)
    if (error) throw error
    return (data ?? []) as InboxMessage[]
  } catch (err) {
    logger.warn("[CRM-SEQUENCES] No se pudieron leer los mensajes para la ventana", {
      error: err instanceof Error ? err.message : String(err),
    })
    result.errors.push(err instanceof Error ? err.message : String(err))
    return []
  }
}

/**
 * Entrega (o registra la omisión de) un paso ya planificado.
 *
 * Devuelve `"skipped"` tanto cuando el paso no cumple las reglas como cuando el
 * `dedupe_key` ya existía. En ambos casos se deja rastro en la bitácora.
 */
async function deliverSequenceStep(
  supabase: SupabaseClient,
  plan: SequencePlan
): Promise<"sent" | "skipped" | "failed"> {
  const { count } = await supabase
    .from("whatsapp_automation_sends")
    .select("id", { count: "exact", head: true })
    .eq("dedupe_key", plan.dedupeKey)
  if ((count ?? 0) > 0) return "skipped"

  if (plan.skipReason) {
    await logSequenceSend(supabase, plan, "skipped", plan.skipReason)
    return "skipped"
  }

  const recipient = plan.recipient
  if (!recipient) {
    await logSequenceSend(supabase, plan, "skipped", SEQUENCE_SKIP_NO_PHONE)
    return "skipped"
  }

  let status: "sent" | "failed" = "sent"
  let detail: string | null = null
  try {
    if (plan.templateName) {
      const res = await sendTemplate({ to: recipient, templateName: plan.templateName })
      detail = res.messages?.[0]?.id ?? null
    } else {
      const res = await sendTextMessage({ to: recipient, text: plan.text })
      detail = res.messages?.[0]?.id ?? null
    }
  } catch (err) {
    status = "failed"
    detail = err instanceof Error ? err.message : String(err)
    logger.warn("[CRM-SEQUENCES] Envío falló", { dedupeKey: plan.dedupeKey, error: detail })
  }

  const logged = await logSequenceSend(supabase, plan, status, detail)
  if (!logged) return "skipped"
  return status
}

/** Bitácora del envío. `false` = ya existía la fila (carrera con otro proceso). */
async function logSequenceSend(
  supabase: SupabaseClient,
  plan: SequencePlan,
  status: "sent" | "failed" | "skipped",
  detail: string | null
): Promise<boolean> {
  const { error } = await supabase.from("whatsapp_automation_sends").insert({
    automation_type: CRM_SEQUENCE_AUTOMATION_TYPE,
    recipient: plan.recipient ?? "",
    dedupe_key: plan.dedupeKey,
    user_id: null,
    order_id: null,
    status,
    detail,
  })
  if (error) {
    if (error.code === "23505") return false
    logger.warn("[CRM-SEQUENCES] No se pudo registrar el envío", { error: error.message })
  }
  return true
}

async function markEnrollment(
  supabase: SupabaseClient,
  id: number,
  patch: { current_step: number; next_run_at: string | null; status: string }
): Promise<void> {
  const { error } = await supabase
    .from("crm_sequence_enrollments")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
  if (error) {
    logger.warn("[CRM-SEQUENCES] No se pudo avanzar la inscripción", {
      id,
      error: error.message,
    })
  }
}

/**
 * El motor solo conoce un puñado de campos, pero la bandeja exige el contrato
 * completo. `mapCrmProspect` rellena lo ausente con los mismos valores por
 * defecto que usa cualquier otra lectura, en vez de repetirlos aquí.
 */
function toConversationProspect(prospect: SequenceProspect): ConversationProspect {
  return mapCrmProspect({ ...prospect, created_at: new Date(0).toISOString() })
}
