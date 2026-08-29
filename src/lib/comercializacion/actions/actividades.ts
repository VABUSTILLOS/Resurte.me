"use server"

import { createServiceClient } from "@/lib/supabase/service"
import { requireSellerOrAdminAction } from "@/lib/roles"
import { logger } from "@/lib/logger"
import {
  ACTIVITY_TYPES,
  type Prospect,
  type Activity,
  type ActivityType,
  type ActivityDirection,
} from "../types"
import { mapProspect } from "./helpers"

// ============================================================
// DETALLE + ACTIVIDADES
// ============================================================

export async function getProspectDetail(id: number): Promise<{
  prospect: Prospect
  activities: Activity[]
}> {
  const { userId, role } = await requireSellerOrAdminAction()
  const supabase = await createServiceClient()

  const prospectQuery = supabase
    .from("crm_prospects")
    .select("*, cities(name)")
    .eq("id", id)
  if (role !== "admin") prospectQuery.eq("seller_id", userId)
  const { data: prospect, error } = await prospectQuery.single()

  if (error || !prospect) {
    throw new Error("Prospecto no encontrado")
  }

  const { data: activities } = await supabase
    .from("crm_activities")
    .select("*")
    .eq("prospect_id", id)
    .order("occurred_at", { ascending: false })

  return {
    prospect: mapProspect({
      ...prospect,
      city_name: (prospect.cities as { name?: string } | null)?.name ?? null,
    }),
    activities: (activities ?? []).map((a) => ({
      id: Number(a.id),
      prospect_id: Number(a.prospect_id),
      seller_id: String(a.seller_id),
      type: a.type as ActivityType,
      direction: a.direction as ActivityDirection,
      outcome: (a.outcome as string | null) ?? null,
      summary: (a.summary as string | null) ?? null,
      duration_seconds: a.duration_seconds != null ? Number(a.duration_seconds) : null,
      occurred_at: String(a.occurred_at),
      created_at: String(a.created_at),
    })),
  }
}

export interface ActivityInput {
  type: ActivityType
  direction?: ActivityDirection
  outcome?: string | null
  summary?: string | null
  duration_seconds?: number | null
}

export async function addActivity(
  prospectId: number,
  input: ActivityInput
): Promise<void> {
  const { userId, role } = await requireSellerOrAdminAction()
  if (!ACTIVITY_TYPES.includes(input.type)) {
    throw new Error("Tipo de actividad inválido")
  }
  if (
    input.duration_seconds != null &&
    (!Number.isFinite(input.duration_seconds) || input.duration_seconds <= 0)
  ) {
    throw new Error("La duración debe ser mayor a 0")
  }
  const supabase = await createServiceClient()

  // Verificar propiedad
  const ownerQuery = supabase
    .from("crm_prospects")
    .select("id, status")
    .eq("id", prospectId)
  if (role !== "admin") ownerQuery.eq("seller_id", userId)
  const { data: prospect, error: ownerErr } = await ownerQuery.single()
  if (ownerErr || !prospect) {
    throw new Error("Prospecto no encontrado")
  }

  const { error } = await supabase.from("crm_activities").insert({
    prospect_id: prospectId,
    seller_id: userId,
    type: input.type,
    direction: input.direction ?? "saliente",
    outcome: input.outcome ?? null,
    summary: input.summary?.trim() || null,
    duration_seconds: input.duration_seconds ?? null,
  })
  if (error) {
    logger.error("[CRM] addActivity error:", error)
    throw new Error("Error al registrar la actividad")
  }

  // Refrescar last_contact_at y promocionar de "nuevo" a "contactado"
  const now = new Date().toISOString()
  const patch: Record<string, unknown> = { last_contact_at: now }
  if (prospect.status === "nuevo") patch.status = "contactado"
  await supabase.from("crm_prospects").update(patch).eq("id", prospectId)
}

export async function updateActivity(
  id: number,
  input: Partial<ActivityInput>
): Promise<void> {
  const { userId, role } = await requireSellerOrAdminAction()
  if (input.type !== undefined && !ACTIVITY_TYPES.includes(input.type)) {
    throw new Error("Tipo de actividad inválido")
  }
  if (
    input.duration_seconds != null &&
    (!Number.isFinite(input.duration_seconds) || input.duration_seconds <= 0)
  ) {
    throw new Error("La duración debe ser mayor a 0")
  }
  const supabase = await createServiceClient()

  const patch: Record<string, unknown> = {}
  if (input.type !== undefined) patch.type = input.type
  if (input.direction !== undefined) patch.direction = input.direction
  if (input.outcome !== undefined) patch.outcome = input.outcome ?? null
  if (input.summary !== undefined) patch.summary = input.summary?.trim() || null
  if (input.duration_seconds !== undefined)
    patch.duration_seconds = input.duration_seconds ?? null

  const query = supabase
    .from("crm_activities")
    .update(patch)
    .eq("id", id)
  if (role !== "admin") query.eq("seller_id", userId)
  const { error } = await query
  if (error) {
    logger.error("[CRM] updateActivity error:", error)
    throw new Error("Error al actualizar la actividad")
  }
}

export async function deleteActivity(id: number): Promise<void> {
  const { userId, role } = await requireSellerOrAdminAction()
  const supabase = await createServiceClient()
  const query = supabase
    .from("crm_activities")
    .delete()
    .eq("id", id)
  if (role !== "admin") query.eq("seller_id", userId)
  const { error } = await query
  if (error) {
    logger.error("[CRM] deleteActivity error:", error)
    throw new Error("Error al eliminar la actividad")
  }
}

