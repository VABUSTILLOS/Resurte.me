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
 * - La **escalera de columnas** degrada una migración a la vez (00184 → 00140 →
 *   00139 → 00059 → 00052) para que un entorno sin aplicar siga pintando la lista.
 * - La **búsqueda** es una sola: en memoria y sin acentos, igual para todos.
 * - El **orden** es `created_at` descendente, el mismo que tenían las dos
 *   lecturas. El orden por urgencia vive en la vista de pipeline, que es la
 *   única que lo necesita.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { logger } from "@/lib/logger"
import { isMissingColumnError } from "@/lib/sale-window"
import {
  CRM_CLOSED_STATUSES,
  CRM_PROSPECT_COLUMN_SETS,
  applyCrmScope,
  filterProspects,
  mapCrmProspect,
  withCityJoin,
  type CrmProspectRow,
  type CrmScope,
  type ProspectFilters,
} from "./crm-core"
import { sumEstimatedValue, type EstimatedValueSum } from "./crm-pipeline"

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
  })

  // `filterProspects` vuelve a aplicar `status`/`due`/`unassigned` (ya venían
  // del servidor, así que es idempotente) y resuelve `q` y `onlyPending`, que
  // son los dos que no se pueden delegar a PostgREST.
  // `mapRow` primero (rescata `city_name` del join) y `mapCrmProspect` después,
  // que es quien aplica los valores por omisión del contrato.
  const mapped = rows.map((row) => mapCrmProspect(mapRow(row)))
  const matched = filterProspects(mapped, filters)
  return search ? matched.slice(offset, offset + limit) : matched
}

interface RawQuery {
  scope: CrmScope
  filters: ProspectFilters
  scanLimit: number
  scanOffset: number
  ids?: readonly number[]
  sellerPresence: "any" | "assigned" | "unassigned"
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
  let lastError: unknown = null

  for (const set of CRM_PROSPECT_COLUMN_SETS) {
    const columns = withCityJoin(set)
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

/**
 * Techo de filas que se escanean para sumar el valor previsto del pipeline.
 *
 * Alto a propósito: el pipeline completo de un CRM de leads de restaurantes
 * cabe de sobra. Si algún día no cupiera, la consulta pide **una fila de más**
 * y `truncated` lo dice: el total se presenta entonces como mínimo, nunca como
 * el total. Un techo silencioso sería peor que no tener total.
 */
export const CRM_VALUE_SCAN_LIMIT = 5000

export interface PipelineValue extends EstimatedValueSum {
  /** `true` si la ventana de escaneo se quedó corta y `total` es un mínimo. */
  truncated: boolean
}

/**
 * Valor previsto de todo el alcance: suma de `estimated_value`.
 *
 * No pasa por `readCrmProspects` por una razón de exactitud, no de comodidad:
 * el lector de listas devuelve una **página** (200 filas por omisión) y sumar
 * una página daría un total que parece completo y no lo es. Aquí se pide solo
 * la columna —sin `join`, sin mapear filas— con la ventana alta y la fila
 * extra que delata el corte.
 *
 * Si `00184` no está aplicada, `estimated_value` no existe: se degrada a «nadie
 * ha declarado valor» en vez de reventar el panel, igual que la escalera de
 * columnas del lector de listas. Un error de otro tipo sí se propaga.
 *
 * `openOnly` deja fuera los tratos cerrados (`CRM_CLOSED_STATUSES`, espejo del
 * índice parcial `idx_crm_prospects_open_pipeline` de `00184`). El panel quiere
 * el alcance entero —lo ganado y lo perdido también se valoró—, pero el
 * briefing del agente habla de lo que queda por cerrar, y ahí sumar un trato
 * ganado sería inflar la cifra que el vendedor usa para planear su semana.
 */
export async function readCrmPipelineValue(
  supabase: SupabaseClient,
  scope: CrmScope,
  limit: number = CRM_VALUE_SCAN_LIMIT,
  openOnly = false,
): Promise<PipelineValue> {
  const base = supabase
    .from("crm_prospects")
    .select("estimated_value")
    .not("estimated_value", "is", null)
  const query = openOnly ? base.not("status", "in", `(${CRM_CLOSED_STATUSES.join(",")})`) : base

  const { data, error } = await applyCrmScope(query, scope).limit(limit + 1)

  if (error) {
    if (isMissingColumnError(error)) {
      logger.warn("[CRM] Sin columna estimated_value; el valor previsto se omite", {
        message: error.message,
      })
      return { total: null, declared: 0, truncated: false }
    }
    logger.error("[CRM] Error al sumar el valor previsto:", error)
    throw new Error("Error al calcular el valor del pipeline")
  }

  const rows = (data ?? []) as unknown as { estimated_value?: unknown }[]
  const truncated = rows.length > limit
  const counted = truncated ? rows.slice(0, limit) : rows
  return { ...sumEstimatedValue(counted), truncated }
}

/**
 * Valor previsto de lo que sigue **abierto**: el pipeline que queda por cerrar.
 *
 * Existe como nombre propio, y no como un cuarto argumento posicional en cada
 * llamante, porque los dos totales no son intercambiables: el del alcance entero
 * responde «cuánto dinero pasó por el CRM» y este responde «cuánto queda vivo».
 * Un `true` suelto en la llamada no dice cuál de los dos se está pidiendo.
 */
export function readOpenCrmPipelineValue(
  supabase: SupabaseClient,
  scope: CrmScope,
  limit: number = CRM_VALUE_SCAN_LIMIT,
): Promise<PipelineValue> {
  return readCrmPipelineValue(supabase, scope, limit, true)
}
