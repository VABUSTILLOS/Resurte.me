"use server"

import { createServiceClient } from "@/lib/supabase/service"
import { requireSellerOrAdminAction } from "@/lib/roles"
import { logger } from "@/lib/logger"
import {
  PROSPECT_STATUSES,
  type Prospect,
  type ProspectStatus,
} from "../types"
import { scopeForRole, crmStatusPatch, type ProspectFilters as CoreProspectFilters } from "@/lib/crm-core"
import { readCrmProspects } from "@/lib/crm-prospects"
import { digitsOf, validateProspectContact, validateProspectSegmentation, mapProspect } from "./helpers"

export type DuplicateMatch = {
  /** Dígitos del teléfono buscado que coincidió. */
  phone: string
  prospectId: number
  prospectName: string
}

export async function findDuplicatesByPhone(
  phones: string[]
): Promise<DuplicateMatch[]> {
  const { userId, role } = await requireSellerOrAdminAction()
  const wanted = new Map<string, string>()
  for (const p of phones) {
    const d = digitsOf(p)
    if (d.length >= 8) wanted.set(d, d)
  }
  if (wanted.size === 0) return []

  const supabase = await createServiceClient()
  const query = supabase
    .from("crm_prospects")
    .select("id, name, phone, whatsapp")
    .limit(2000)
  if (role !== "admin") query.eq("seller_id", userId)
  const { data, error } = await query

  if (error) {
    logger.error("[CRM] findDuplicatesByPhone error:", error)
    return []
  }

  const matches: DuplicateMatch[] = []
  for (const row of data ?? []) {
    const existing = [digitsOf(row.phone as string | null), digitsOf(row.whatsapp as string | null)]
    for (const d of existing) {
      // Coincidencia exacta o por últimos 10 dígitos (con/sin código de país).
      const tail = d.length > 10 ? d.slice(-10) : d
      for (const w of wanted.keys()) {
        const wTail = w.length > 10 ? w.slice(-10) : w
        if (d === w || (tail.length >= 10 && tail === wTail)) {
          matches.push({
            phone: w,
            prospectId: Number(row.id),
            prospectName: String(row.name),
          })
          break
        }
      }
    }
  }
  return matches
}


// ============================================================
// PROSPECTOS
// ============================================================

/**
 * Filtros de la cartera del vendedor: los del núcleo compartido más la forma de
 * la página. `limit`/`offset` son forma de consulta, no criterio de selección,
 * y por eso no viven en `crm-core`.
 */
export interface ProspectFilters extends CoreProspectFilters {
  /** Máximo de filas (default 200) para no traer la tabla completa. */
  limit?: number
  /** Desplazamiento para paginación ("Cargar más"). */
  offset?: number
}

/** Techo de filas por lectura cuando el llamador no pide otra cosa. */
const DEFAULT_PROSPECT_LIMIT = 200

/**
 * Prospectos dentro del alcance del usuario.
 *
 * Envoltorio fino sobre el lector compartido: aquí solo quedan el gate de rol y
 * la traducción de rol a alcance. La búsqueda, el orden, la escalera de columnas
 * y la paginación viven en `readCrmProspects`, para que el panel de administración
 * y la cartera del vendedor respondan exactamente lo mismo a la misma pregunta.
 */
export async function getProspects(
  filters: ProspectFilters = {}
): Promise<Prospect[]> {
  const { userId, role } = await requireSellerOrAdminAction()
  const supabase = await createServiceClient()

  return readCrmProspects(supabase, {
    scope: scopeForRole(role, userId),
    filters,
    limit: filters.limit ?? DEFAULT_PROSPECT_LIMIT,
    offset: filters.offset ?? 0,
  })
}

export interface ProspectInput {
  name: string
  restaurant_name?: string | null
  phone?: string | null
  whatsapp?: string | null
  email?: string | null
  city_id?: number | null
  tier?: number | null
  zone?: string | null
  status?: ProspectStatus
  next_follow_up_at?: string | null
  notes?: string | null
  /** 00184. `null` = nadie lo ha valorado; no es cero. */
  estimated_value?: number | null
  /**
   * Los cuatro campos de segmentación de 00059. Se leían en `CrmProspectRow`
   * desde la Ronda 7 y el agente IA razonaba con ellos, pero ninguna superficie
   * podía escribirlos: el agente leía `null` permanentes.
   */
  employees?: number | null
  instagram?: string | null
  weekly_volume_min?: number | null
  weekly_volume_max?: number | null
  /**
   * **Solo se honra en el alta, y solo para el admin.** El vendedor siempre es
   * dueño de lo que crea. La reasignación de un trato existente tiene su propia
   * puerta (`assignCrmProspect`), que además mueve las tareas abiertas; escribir
   * `seller_id` desde `updateProspect` crearía una segunda ruta que no las mueve.
   */
  seller_id?: string | null
}

/**
 * Quién es el dueño de un prospecto recién creado.
 *
 * El vendedor siempre es dueño de lo que crea: `requested` no puede desviar un
 * prospecto a otro vendedor. El admin sí elige, y si no elige el prospecto queda
 * **sin asignar** — es el pozo, el estado del que `distributeCrmProspects` lo
 * reparte. Antes se guardaba el `userId` de quien creaba, así que un prospecto
 * dado de alta por el admin nacía con un dueño que no lo iba a trabajar.
 */
function resolveNewProspectSeller(
  role: string,
  userId: string,
  requested?: string | null
): string | null {
  if (role !== "admin") return userId
  return requested ?? null
}

export async function createProspect(input: ProspectInput): Promise<Prospect> {
  const { userId, role } = await requireSellerOrAdminAction()
  validateProspectContact(input)
  validateProspectSegmentation(input)

  const supabase = await createServiceClient()
  const { data, error } = await supabase
    .from("crm_prospects")
    .insert({
      seller_id: resolveNewProspectSeller(role, userId, input.seller_id),
      name: input.name.trim(),
      restaurant_name: input.restaurant_name?.trim() || null,
      phone: input.phone?.trim() || null,
      whatsapp: input.whatsapp?.trim() || null,
      email: input.email?.trim() || null,
      city_id: input.city_id ?? null,
      tier: input.tier ?? null,
      zone: input.zone ?? null,
      status: input.status ?? "nuevo",
      next_follow_up_at: input.next_follow_up_at || null,
      notes: input.notes?.trim() || null,
      estimated_value: input.estimated_value ?? null,
      employees: input.employees ?? null,
      instagram: input.instagram?.trim() || null,
      weekly_volume_min: input.weekly_volume_min ?? null,
      weekly_volume_max: input.weekly_volume_max ?? null,
    })
    .select("*")
    .single()

  if (error) {
    logger.error("[CRM] createProspect error:", error)
    throw new Error("Error al crear el prospecto")
  }
  return mapProspect(data as Record<string, unknown>)
}

export async function updateProspect(
  id: number,
  input: Partial<ProspectInput>
): Promise<Prospect> {
  const { userId, role } = await requireSellerOrAdminAction()
  validateProspectContact(input)
  validateProspectSegmentation(input)
  if (input.status !== undefined && !PROSPECT_STATUSES.includes(input.status)) {
    throw new Error("Estado de prospecto inválido")
  }
  const supabase = await createServiceClient()

  const patch: Record<string, unknown> = {}
  if (input.name !== undefined) patch.name = input.name.trim()
  if (input.restaurant_name !== undefined)
    patch.restaurant_name = input.restaurant_name?.trim() || null
  if (input.phone !== undefined) patch.phone = input.phone?.trim() || null
  if (input.whatsapp !== undefined) patch.whatsapp = input.whatsapp?.trim() || null
  if (input.email !== undefined) patch.email = input.email?.trim() || null
  if (input.city_id !== undefined) patch.city_id = input.city_id ?? null
  if (input.tier !== undefined) patch.tier = input.tier ?? null
  if (input.zone !== undefined) patch.zone = input.zone ?? null
  // El parche de estado va en el MISMO `UPDATE`: los `CHECK` de coherencia de
  // 00184 rechazan un motivo de pérdida sobre un trato abierto o un `closed_at`
  // sobre uno no cerrado, así que reabrir un trato perdido desde este formulario
  // fallaría con un error de constraint en la cara del vendedor.
  if (input.status !== undefined) {
    patch.status = input.status
    Object.assign(patch, crmStatusPatch(input.status))
  }
  if (input.next_follow_up_at !== undefined)
    patch.next_follow_up_at = input.next_follow_up_at || null
  if (input.notes !== undefined) patch.notes = input.notes?.trim() || null
  if (input.estimated_value !== undefined)
    patch.estimated_value = input.estimated_value ?? null
  if (input.employees !== undefined) patch.employees = input.employees ?? null
  if (input.instagram !== undefined)
    patch.instagram = input.instagram?.trim() || null
  if (input.weekly_volume_min !== undefined)
    patch.weekly_volume_min = input.weekly_volume_min ?? null
  if (input.weekly_volume_max !== undefined)
    patch.weekly_volume_max = input.weekly_volume_max ?? null
  // `seller_id` NO se escribe aquí a propósito: ver `ProspectInput.seller_id`.

  const query = supabase
    .from("crm_prospects")
    .update(patch)
    .eq("id", id)
  if (role !== "admin") query.eq("seller_id", userId)
  const { data, error } = await query.select("*, cities(name)").single()

  if (error) {
    logger.error("[CRM] updateProspect error:", error)
    throw new Error("Error al actualizar el prospecto")
  }
  return mapProspect({
    ...data,
    city_name: (data.cities as { name?: string } | null)?.name ?? null,
  })
}

export async function deleteProspect(id: number): Promise<void> {
  const { userId, role } = await requireSellerOrAdminAction()
  const supabase = await createServiceClient()
  const query = supabase
    .from("crm_prospects")
    .delete()
    .eq("id", id)
  if (role !== "admin") query.eq("seller_id", userId)
  const { error } = await query
  if (error) {
    logger.error("[CRM] deleteProspect error:", error)
    throw new Error("Error al eliminar el prospecto")
  }
}

export interface BulkProspectRow {
  name: string
  restaurant_name?: string | null
  phone?: string | null
  whatsapp?: string | null
  email?: string | null
  city_name?: string | null
  notes?: string | null
}

export async function bulkCreateProspects(rows: BulkProspectRow[]): Promise<{
  created: number
  errors: { row: number; message: string }[]
}> {
  const { userId, role } = await requireSellerOrAdminAction()
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("No hay filas para importar")
  }
  if (rows.length > 200) {
    throw new Error("Máximo 200 prospectos por importación")
  }

  const supabase = await createServiceClient()

  // Mapeo ciudad (nombre → id) para resolver city_name por fila
  const { data: cities } = await supabase.from("cities").select("id, name")
  const cityMap = new Map<string, number>()
  for (const c of cities ?? []) {
    cityMap.set(String(c.name).trim().toLowerCase(), Number(c.id))
  }

  // Validar todo primero; si hay errores no se inserta nada
  const errors: { row: number; message: string }[] = []
  const prepared = rows.map((row, idx) => {
    try {
      validateProspectContact(row)
    } catch (e) {
      errors.push({ row: idx + 1, message: e instanceof Error ? e.message : "Fila inválida" })
      return null
    }
    const cityKey = row.city_name?.trim().toLowerCase()
    let city_id: number | null = null
    if (cityKey) {
      city_id = cityMap.get(cityKey) ?? null
      if (city_id === null) {
        errors.push({ row: idx + 1, message: `Ciudad "${row.city_name}" no existe en el catálogo` })
        return null
      }
    }
    return {
      // La misma regla que el alta: el vendedor importa para sí mismo; el admin
      // importa al pozo, porque su `userId` no es un vendedor que lo trabaje.
      seller_id: resolveNewProspectSeller(role, userId),
      name: row.name.trim(),
      restaurant_name: row.restaurant_name?.trim() || null,
      phone: row.phone?.trim() || null,
      whatsapp: row.whatsapp?.trim() || null,
      email: row.email?.trim() || null,
      city_id,
      status: "nuevo",
      notes: row.notes?.trim() || null,
      source: "import",
    }
  })

  if (errors.length > 0) return { created: 0, errors }

  const toInsert = prepared.filter((r): r is NonNullable<typeof r> => r !== null)
  const { error } = await supabase.from("crm_prospects").insert(toInsert)
  if (error) {
    logger.error("[CRM] bulkCreateProspects error:", error)
    throw new Error("Error al importar los prospectos")
  }
  return { created: toInsert.length, errors: [] }
}
