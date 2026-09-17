import { createServiceClient } from "@/lib/supabase/service"
import type { RedemptionBrief, RedemptionStatus } from "@/lib/redemptions"

/**
 * Operaciones de servidor sobre las solicitudes de servicio.
 *
 * Ninguna de las dos tablas (`redemptions`, `redemption_events`) tiene política
 * de UPDATE/INSERT para el usuario: el estado lo mueve únicamente
 * `public.advance_redemption()` (service_role), y el brief se escribe aquí con
 * el cliente de servicio. Así el cliente nunca puede fabricarse un estado.
 */

/**
 * Guarda el brief capturado en el checkout sobre una solicitud ya creada.
 *
 * No comparte transacción con el débito de créditos a propósito: el brief es
 * contexto operativo, no dinero. Si esta escritura falla, la solicitud sigue
 * existiendo en la cola del equipo (y el panel la marca como incompleta) en
 * lugar de perderse o de bloquear el canje.
 *
 * La propiedad se exige en el propio predicado (`user_id`), de modo que el
 * `id` de otra persona no puede recibir el brief de quien llama.
 */
export async function attachRedemptionBrief(
  redemptionId: number,
  userId: string,
  brief: RedemptionBrief
): Promise<{ ok: boolean; status?: RedemptionStatus; due_at?: string | null; error?: string }> {
  // `isInteger`, no `isFinite`: un 1.5 pasaba el filtro y llegaba a Postgres.
  if (!Number.isInteger(redemptionId) || redemptionId <= 0) {
    return { ok: false, error: "Solicitud inválida" }
  }

  const supabase = await createServiceClient()
  const { data, error } = await supabase
    .from("redemptions")
    .update({ brief })
    .eq("id", redemptionId)
    .eq("user_id", userId)
    .select("id, status, due_at")
    .maybeSingle()

  if (error) return { ok: false, error: error.message }
  if (!data) return { ok: false, error: "Solicitud no encontrada" }
  return {
    ok: true,
    status: data.status as RedemptionStatus,
    due_at: (data.due_at as string | null) ?? null,
  }
}

export interface AdvanceRedemptionInput {
  id: number
  /** `null` explícito = sólo actualizar metadatos, sin cambiar de estado. */
  status?: RedemptionStatus | null
  actor: string
  note?: string | null
  assignedTo?: string | null
  deliverableUrl?: string | null
  deliverableNote?: string | null
}

export interface AdvanceRedemptionResult {
  ok: boolean
  status: RedemptionStatus | null
  /** `false` cuando la solicitud ya estaba en ese estado (no-op idempotente). */
  changed: boolean
  refunded: boolean
  error?: string
}

/**
 * Mueve una solicitud por la máquina de estados de `advance_redemption()`
 * (00151/00152). La función valida la transición, devuelve los créditos al
 * cancelar y registra el evento del timeline del cliente.
 */
export async function advanceRedemption(
  input: AdvanceRedemptionInput
): Promise<AdvanceRedemptionResult> {
  const empty: AdvanceRedemptionResult = { ok: false, status: null, changed: false, refunded: false }

  if (!Number.isInteger(input.id) || input.id <= 0) {
    return { ...empty, error: "Solicitud inválida" }
  }

  const args: Record<string, unknown> = {
    p_id: input.id,
    p_actor: input.actor,
  }
  // Sólo se envían las claves presentes: omitir una deja que Postgres aplique
  // su DEFAULT, mientras que enviar null lo sobrescribe.
  if (input.status !== undefined) args.p_status = input.status
  if (input.note != null) args.p_note = input.note
  if (input.assignedTo != null) args.p_assigned_to = input.assignedTo
  if (input.deliverableUrl != null) args.p_deliverable_url = input.deliverableUrl
  if (input.deliverableNote != null) args.p_deliverable_note = input.deliverableNote

  const supabase = await createServiceClient()
  const { data, error } = await supabase.rpc("advance_redemption", args)

  if (error) return { ...empty, error: error.message }

  const row = data?.[0]
  if (!row) {
    // La función es RETURNS TABLE: si no emite fila no hay resultado que
    // interpretar (es el defecto que 00149 corrigió en redeem_service).
    return { ...empty, error: "La operación no devolvió resultado" }
  }

  if (!row.ok) {
    return { ...empty, status: null, error: row.error_msg ?? "No se pudo actualizar la solicitud" }
  }

  return {
    ok: true,
    status: (row.new_status as RedemptionStatus | null) ?? null,
    changed: row.changed === true,
    refunded: row.refunded === true,
  }
}
