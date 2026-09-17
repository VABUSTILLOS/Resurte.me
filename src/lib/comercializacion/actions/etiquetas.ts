"use server"

/**
 * Ronda 7 (F4) — etiquetado de prospectos desde la cartera del vendedor.
 *
 * Es la contraparte de `setCrmProspectTags` / `bulkTagProspects` de
 * `admin/actions.ts`, pero **con alcance de vendedor**. Las tres diferencias que
 * importan frente a la versión de administración:
 *
 * 1. El gate es `requireSellerOrAdminAction()`, no `requireAdmin()`.
 * 2. Toda lectura y toda escritura llevan `.eq("seller_id", userId)` cuando el
 *    rol no es admin. El cliente de servicio **ignora RLS**, así que el filtro
 *    de código es la única barrera real: sin él, un vendedor podría etiquetar
 *    el prospecto de otro pasando su `id`.
 * 3. Si 00140 no está aplicada, la columna `tags` no existe y se degrada con un
 *    mensaje claro en vez de romper la lista (que se pinta sin chips).
 */

import { revalidatePath } from "next/cache"

import { createServiceClient } from "@/lib/supabase/service"
import { requireSellerOrAdminAction } from "@/lib/roles"
import { logger } from "@/lib/logger"
import { isMissingColumnError } from "@/lib/sale-window"
import { logAdminAction } from "@/lib/audit-log"
import { addTags, normalizeTags, readTags, removeTags } from "@/lib/crm-tags"

/**
 * Tope de prospectos por operación en bloque: una sola pasada, no N updates.
 * No se exporta a propósito — un módulo `"use server"` solo puede exportar
 * funciones asíncronas; un `export const` invalida el módulo entero y Turbopack
 * lo deja "sin exports", rompiendo el `export *` del barrel.
 */
const BULK_TAG_LIMIT = 200

const TAGS_UNAVAILABLE = "Las etiquetas todavía no están disponibles en este entorno"

/**
 * Reemplaza las etiquetas de un prospecto. Devuelve la lista ya normalizada,
 * para que la interfaz pinte lo que realmente quedó guardado y no lo que el
 * usuario tecleó (`Cafetería` → `cafeteria`).
 */
export async function setProspectTags(
  prospectId: number,
  tags: readonly string[],
): Promise<string[]> {
  const { userId, user, role } = await requireSellerOrAdminAction()
  const id = Number(prospectId)
  if (!Number.isFinite(id)) throw new Error("Prospecto inválido")

  const next = normalizeTags(tags)
  const supabase = await createServiceClient()

  const query = supabase
    .from("crm_prospects")
    .update({ tags: next, updated_at: new Date().toISOString() })
    .eq("id", id)
  if (role !== "admin") query.eq("seller_id", userId)
  const { data, error } = await query.select("id")

  if (error) {
    if (isMissingColumnError(error)) throw new Error(TAGS_UNAVAILABLE)
    logger.error("[CRM] setProspectTags error:", error)
    throw new Error("Error al guardar las etiquetas")
  }
  // Un update filtrado que no toca ninguna fila significa "fuera de alcance".
  if (!data || data.length === 0) throw new Error("Prospecto no encontrado")

  await logAdminAction(supabase, {
    actorId: userId,
    actorEmail: user?.email ?? null,
    action: "crm_prospect_tags",
    entity: "crm_prospects",
    entityId: id,
    detail: { tags: next },
  })
  revalidateProspectPaths(id)
  return next
}

/**
 * Pone y quita etiquetas sobre una selección. Devuelve cuántos prospectos
 * cambiaron de verdad.
 *
 * Se agrupa por resultado idéntico antes de escribir: "marcar 40 prospectos
 * como vip" es un UPDATE, no cuarenta. El precio es leer antes de escribir, que
 * es obligatorio igualmente porque PostgREST no sabe restar elementos de un
 * arreglo sin una función en la base.
 */
export async function bulkTagProspects(
  prospectIds: readonly number[],
  add: readonly string[] = [],
  remove: readonly string[] = [],
): Promise<number> {
  const { userId, user, role } = await requireSellerOrAdminAction()

  const ids = [...new Set(prospectIds.filter((id) => Number.isFinite(id)))].slice(
    0,
    BULK_TAG_LIMIT,
  )
  if (ids.length === 0) return 0

  const toAdd = normalizeTags(add)
  const toRemove = normalizeTags(remove)
  if (toAdd.length === 0 && toRemove.length === 0) return 0

  const supabase = await createServiceClient()

  const readQuery = supabase.from("crm_prospects").select("id, tags").in("id", ids)
  if (role !== "admin") readQuery.eq("seller_id", userId)
  const { data, error } = await readQuery

  if (error) {
    if (isMissingColumnError(error)) throw new Error(TAGS_UNAVAILABLE)
    logger.error("[CRM] bulkTagProspects lectura error:", error)
    throw new Error("Error al leer las etiquetas")
  }

  const groups = new Map<string, number[]>()
  for (const row of data ?? []) {
    const next = addTags(removeTags(readTags(row.tags), toRemove), toAdd)
    const key = JSON.stringify(next)
    const group = groups.get(key)
    if (group) group.push(Number(row.id))
    else groups.set(key, [Number(row.id)])
  }
  if (groups.size === 0) return 0

  for (const [key, groupIds] of groups) {
    const writeQuery = supabase
      .from("crm_prospects")
      .update({ tags: JSON.parse(key) as string[], updated_at: new Date().toISOString() })
      .in("id", groupIds)
    if (role !== "admin") writeQuery.eq("seller_id", userId)
    const { error: updateError } = await writeQuery
    if (updateError) {
      logger.error("[CRM] bulkTagProspects escritura error:", updateError)
      throw new Error("Error al guardar las etiquetas")
    }
  }

  const touched = [...groups.values()].reduce((sum, group) => sum + group.length, 0)
  await logAdminAction(supabase, {
    actorId: userId,
    actorEmail: user?.email ?? null,
    action: "crm_prospect_tags",
    entity: "crm_prospects",
    entityId: null,
    detail: { add: toAdd, remove: toRemove, prospects: touched },
  })
  revalidateProspectPaths(null)
  return touched
}

function revalidateProspectPaths(id: number | null): void {
  revalidatePath("/comercializacion/prospectos")
  if (id != null) revalidatePath(`/comercializacion/prospectos/${id}`)
}
