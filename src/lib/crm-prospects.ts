/**
 * Lector único de `crm_prospects` (Ronda 7).
 *
 * Tres superficies leen la misma tabla —`/admin/leads`, `/comercializacion` y
 * `src/lib/agente`— y hasta ahora cada una armaba su propia consulta. Eso ya
 * había producido dos búsquedas distintas sobre el mismo dato: el admin filtraba
 * en memoria (ignorando acentos) y el vendedor lo hacía con `ilike` en
 * PostgREST, que no los ignora. Quien buscaba "cafeteria" encontraba "Cafetería"
 * en el panel y no en su cartera, sin que nada avisara.
 *
 * Aquí queda una sola ruta de lectura:
 *
 * - El **alcance** se aplica siempre, y para el vendedor es un filtro de código
 *   (`seller_id = userId`), no la política RLS: estas consultas usan
 *   `createServiceClient()`, que salta RLS por completo.
 * - La **escalera de columnas** degrada una migración a la vez (00140 → 00139 →
 *   00059 → 00052) para que un entorno sin aplicar siga pintando la lista.
 * - La **búsqueda** es una sola: en memoria y sin acentos, igual para todos.
 * - El **orden** es `created_at` descendente, el mismo que tenían las dos
 *   lecturas. El orden por urgencia vive en la vista de pipeline, que es la
 *   única que lo necesita.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { logger } from "@/lib/logger"
import { isMissingColumnError } from "@/lib/sale-window"
import {
  CRM_PROSPECT_COLUMN_SETS,
  applyCrmScope,
  filterProspects,
  mapCrmProspect,
  withCityJoin,
  type CrmProspectRow,
  type CrmScope,
  type ProspectFilters,
} from "./crm-core"

/**
 * Techo de filas que se escanean cuando hay texto de búsqueda.
 *
 * Con búsqueda no se puede paginar con `range()` antes de filtrar: la página
 * saldría corta y "Cargar más" volvería a pedir filas que el filtro descarta.
 * Se escanea una ventana acotada desde el principio del alcance y se recorta en
 * memoria, así las páginas de una búsqueda son estables.
 */
export const CRM_SEARCH_SCAN_LIMIT = 1000

export interface CrmProspectQuery {
  /** Alcance por rol. `ADMIN_SCOPE` ve todo, incluido el pozo sin asignar. */
  scope: CrmScope
  filters?: ProspectFilters
  /** Filas por página (default 200, el mismo techo que tenía el CRM vendedor). */
  limit?: number
  offset?: number
  /** Restringe a un conjunto de ids (reparto de prospectos). */
  ids?: readonly number[]
  /** Presencia de vendedor, para el reparto. `any` no filtra nada. */
  sellerPresence?: "any" | "assigned" | "unassigned"
  /**
   * Columnas adicionales fuera del contrato compartido (p. ej. `employees`,
   * `instagram` y el volumen semanal, que solo usa el módulo `agente`).
   * Se leen pero no se mapean: el llamador las toma de la fila cruda.
   */
  extraColumns?: readonly string[]
}

/**
 * Lee prospectos aplicando alcance, degradación de columnas y búsqueda.
 *
 * Devuelve el contrato compartido `CrmProspectRow`; `city_name` viene resuelto
 * por el join `cities(name)`.
 */
export async function readCrmProspects(
  supabase: SupabaseClient,
  query: CrmProspectQuery,
): Promise<CrmProspectRow[]> {
  const {
    scope,
    filters = {},
    limit = 200,
    offset = 0,
    ids,
    sellerPresence = "any",
    extraColumns = [],
  } = query

  const search = filters.q?.trim() ?? ""
  const scanLimit = search ? CRM_SEARCH_SCAN_LIMIT : limit
  const scanOffset = search ? 0 : offset

  const rows = await loadRawRows(supabase, {
    scope,
    filters,
    scanLimit,
    scanOffset,
    ids,
    sellerPresence,
    extraColumns,
  })

  // `filterProspects` vuelve a aplicar `status`/`due`/`unassigned` (ya venían
  // del servidor, así que es idempotente) y resuelve `q` y `onlyPending`, que
  // son los dos que no se pueden delegar a PostgREST.
  // `mapRow` primero (rescata `city_name` del join) y `mapCrmProspect` después,
  // que es quien aplica los valores por omisión del contrato.
  const mapped = rows.map((row) =>
    withExtras(mapCrmProspect(mapRow(row)), row, extraColumns),
  )
  const matched = filterProspects(mapped, filters)
  return search ? matched.slice(offset, offset + limit) : matched
}

/**
 * Cuelga las columnas fuera del contrato en `extra`.
 *
 * `mapCrmProspect` no las conoce —no son parte del contrato compartido—, así
 * que se adjuntan después de mapear. Sin `extraColumns` la fila sale intacta:
 * las superficies del CRM no cargan un objeto vacío por cada prospecto.
 */
function withExtras(
  prospect: CrmProspectRow,
  raw: Record<string, unknown>,
  extraColumns: readonly string[],
): CrmProspectRow {
  if (extraColumns.length === 0) return prospect
  const extra: Record<string, unknown> = {}
  for (const column of extraColumns) extra[column] = raw[column] ?? null
  return { ...prospect, extra }
}

interface RawQuery {
  scope: CrmScope
  filters: ProspectFilters
  scanLimit: number
  scanOffset: number
  ids?: readonly number[]
  sellerPresence: "any" | "assigned" | "unassigned"
  extraColumns: readonly string[]
}

/**
 * Construye la consulta de un escalón de columnas.
 *
 * El orden importa: `.range()` se aplica **después** del alcance. Paginar antes
 * de filtrar por vendedor haría que el vendedor recibiera una página con los
 * huecos que dejaron los prospectos de otros.
 */
function buildQuery(
  supabase: SupabaseClient,
  columns: string,
  { scope, filters, scanLimit, scanOffset, ids, sellerPresence }: RawQuery,
) {
  let q = applyCrmScope(
    supabase
      .from("crm_prospects")
      .select(columns)
      .order("created_at", { ascending: false }),
    scope,
  )

  if (filters.status && filters.status !== "todos") q = q.eq("status", filters.status)
  if (filters.statuses?.length) q = q.in("status", [...filters.statuses])
  if (filters.due) {
    q = q.not("next_follow_up_at", "is", null).lte("next_follow_up_at", new Date().toISOString())
  }
  if (sellerPresence === "assigned") q = q.not("seller_id", "is", null)
  if (sellerPresence === "unassigned") q = q.is("seller_id", null)
  if (ids) q = q.in("id", [...ids])

  return q.range(scanOffset, scanOffset + scanLimit - 1)
}

/** Recorre la escalera de columnas y degrada solo ante columnas ausentes. */
async function loadRawRows(
  supabase: SupabaseClient,
  raw: RawQuery,
): Promise<Record<string, unknown>[]> {
  const extra = raw.extraColumns.join(", ")
  let lastError: unknown = null

  for (const set of CRM_PROSPECT_COLUMN_SETS) {
    const columns = withCityJoin(extra ? [...set, extra] : set)
    const { data, error } = await buildQuery(supabase, columns, raw)
    if (!error) {
      // `.select()` recibe una cadena calculada, así que el cliente no puede
      // tipar las columnas y devuelve `GenericStringError`. El casteo queda aquí.
      return (data ?? []) as unknown as Record<string, unknown>[]
    }
    lastError = error
    if (!isMissingColumnError(error)) {
      logger.error("[CRM] Error al leer prospectos:", error)
      throw new Error("Error al cargar los prospectos")
    }
    // 00140 o 00139 sin aplicar: se reintenta con el escalón anterior.
    logger.warn("[CRM] Columnas incompletas en crm_prospects; se reintenta degradado", {
      message: error.message,
    })
  }

  logger.error("[CRM] Ningún escalón de columnas funcionó:", lastError)
  throw new Error("Error al cargar los prospectos")
}

/**
 * Extrae el nombre de la ciudad del join y lo deja donde el contrato lo espera.
 *
 * Sin join, `city_name` es `null` (no `""`): "no medido" y "vacío" no son lo
 * mismo en ningún indicador del CRM.
 */
function mapRow(row: Record<string, unknown>): Record<string, unknown> {
  const cities = row.cities as { name?: string | null } | null | undefined
  return { ...row, city_name: cities?.name ?? null }
}
