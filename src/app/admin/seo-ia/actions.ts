"use server"

// ============================================================
// Panel de prompts GEO — server actions
// ============================================================
// Lectura y escritura de las 80 celdas (20 preguntas × 4 motores) del panel de
// `docs/medicion-seo-ia.md` §2. Hasta ahora el procedimiento decía "guarda los
// resultados" y la pantalla mostraba un `—` escrito a mano: no había dónde
// guardarlos.
//
// Guard de acceso: `requireAdmin()`. Es el mismo patrón que el resto de las
// acciones de `/admin` (ver `src/app/admin/usuarios/actions.ts`). El layout de
// `/admin` ya redirige, pero la acción es un endpoint público y se protege por
// sí misma.
//
// Se usa `createServiceClient()` para la escritura Y para la bitácora:
// `geo_panel_checks` sólo concede privilegios a `service_role` y
// `admin_audit_log` sólo tiene política de lectura, así que sus INSERT vienen
// de service_role. Un solo cliente, un solo modelo de permisos: usar dos
// invitaría a que una mitad fallara en silencio.

import { requireAdmin } from "@/lib/admin-auth"
import { logAdminAction } from "@/lib/audit-log"
import { createServiceClient } from "@/lib/supabase/service"
import { GEO_ENGINES, GEO_PANEL_SIZE, getGeoQuery } from "@/lib/geo-queries"
import { DEFAULT_TIMEZONE } from "@/lib/local-date"
import {
  currentMonthKey,
  monthLabel,
  monthStartDate,
  normalizeCell,
  previousMonthWithData,
  type GeoPanelRecord,
} from "@/lib/geo-panel"

/** Resumen de un mes con datos, para el selector. */
export interface GeoPanelMonthSummary {
  monthKey: string
  label: string
  /** Celdas capturadas de las 80 posibles. Un conteo, siempre un hecho. */
  recorded: number
  total: number
}

/** Datos de un mes del panel, listos para la vista. */
export interface GeoPanelMonthData {
  monthKey: string
  monthLabel: string
  /** Celdas guardadas del mes pedido. */
  records: GeoPanelRecord[]
  /** Todos los meses con al menos una celda, de más reciente a más antiguo. */
  availableMonths: GeoPanelMonthSummary[]
  /** Mes anterior **con datos**, o `null` si no hay base de comparación. */
  previousMonth: string | null
  previousRecords: GeoPanelRecord[]
}

export interface GeoPanelSaveResult {
  ok: boolean
  error?: string
  /** Estado fresco del mes tras guardar, para que el cliente no lo adivine. */
  data?: GeoPanelMonthData
}

const SELECT_COLUMNS =
  "run_month, query_id, engine_id, cited, citation_position, cited_fact, fact_accuracy, competitor_host, notes"

/** `2026-09-01` (o un timestamptz) → `2026-09`. */
function monthKeyFromDb(value: unknown): string {
  const s = typeof value === "string" ? value : ""
  return /^\d{4}-\d{2}/.test(s) ? s.slice(0, 7) : ""
}

function toRecord(row: Record<string, unknown>): GeoPanelRecord | null {
  const runMonth = monthKeyFromDb(row.run_month)
  const queryId = typeof row.query_id === "string" ? row.query_id : ""
  const engineId = typeof row.engine_id === "string" ? row.engine_id : ""
  if (!runMonth || !queryId || !engineId) return null
  return {
    runMonth,
    queryId,
    engineId,
    cited: row.cited === true,
    citationPosition: typeof row.citation_position === "number" ? row.citation_position : null,
    citedFact: typeof row.cited_fact === "string" ? row.cited_fact : null,
    factAccuracy:
      row.fact_accuracy === "si" || row.fact_accuracy === "no" || row.fact_accuracy === "parcial"
        ? row.fact_accuracy
        : null,
    competitorHost: typeof row.competitor_host === "string" ? row.competitor_host : null,
    notes: typeof row.notes === "string" ? row.notes : null,
  }
}

/**
 * Meses con datos y cuántas celdas tiene cada uno.
 *
 * Una sola consulta: se leen `run_month, query_id, engine_id` de todas las
 * filas y se deduplica por (mes, pregunta, motor). Traer el conteo aquí evita
 * una segunda pasada completa sólo para poblar el selector, y el selector
 * necesita saber qué meses están a medias para no ofrecerlos como si fueran
 * corridas completas.
 */
async function readMonths(
  supabase: Awaited<ReturnType<typeof createServiceClient>>
): Promise<GeoPanelMonthSummary[]> {
  const { data, error } = await supabase
    .from("geo_panel_checks")
    .select("run_month, query_id, engine_id")
  if (error || !data) return []

  const cellsByMonth = new Map<string, Set<string>>()
  for (const row of data as Record<string, unknown>[]) {
    const key = monthKeyFromDb(row.run_month)
    if (!key) continue
    const queryId = typeof row.query_id === "string" ? row.query_id : ""
    const engineId = typeof row.engine_id === "string" ? row.engine_id : ""
    if (!queryId || !engineId) continue
    const set = cellsByMonth.get(key)
    if (set) set.add(`${queryId}::${engineId}`)
    else cellsByMonth.set(key, new Set([`${queryId}::${engineId}`]))
  }

  return [...cellsByMonth.entries()]
    .map(([monthKey, cells]) => ({
      monthKey,
      label: monthLabel(monthKey),
      recorded: cells.size,
      total: GEO_PANEL_SIZE,
    }))
    .sort((a, b) => (a.monthKey < b.monthKey ? 1 : a.monthKey > b.monthKey ? -1 : 0))
}

async function readMonthCells(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  monthKey: string
): Promise<GeoPanelRecord[]> {
  const start = monthStartDate(monthKey)
  if (!start) return []
  const { data, error } = await supabase
    .from("geo_panel_checks")
    .select(SELECT_COLUMNS)
    .eq("run_month", start)
  if (error || !data) return []
  const records: GeoPanelRecord[] = []
  for (const row of data as Record<string, unknown>[]) {
    const rec = toRecord(row)
    if (rec) records.push(rec)
  }
  return records
}

/** Arma el estado completo de un mes: celdas, meses disponibles y base de comparación. */
async function buildMonthData(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  monthKey: string
): Promise<GeoPanelMonthData> {
  const availableMonths = await readMonths(supabase)
  // El mes pedido puede no tener filas todavía (corrida recién abierta): en ese
  // caso igual debe aparecer como "el mes que estás llenando".
  const monthKeys = availableMonths.map((m) => m.monthKey)
  const monthsForLookup = monthKeys.includes(monthKey)
    ? monthKeys
    : [monthKey, ...monthKeys].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0))
  const previousMonth = previousMonthWithData(monthsForLookup, monthKey)

  const [records, previousRecords] = await Promise.all([
    readMonthCells(supabase, monthKey),
    previousMonth ? readMonthCells(supabase, previousMonth) : Promise.resolve([]),
  ])

  return { monthKey, monthLabel: monthLabel(monthKey), records, availableMonths, previousMonth, previousRecords }
}

/**
 * Lee un mes del panel. `monthKey` vacío → el mes en curso.
 *
 * Nunca lanza por datos: si la consulta falla devuelve un mes vacío. La página
 * se renderiza igual y la cobertura dirá 0 de 80, que es la verdad.
 */
export async function getGeoPanelMonth(monthKey?: string): Promise<GeoPanelMonthData> {
  const { response: adminDenied } = await requireAdmin()
  if (adminDenied) throw new Error("Acceso restringido a administradores")

  const supabase = await createServiceClient()
  const requested = /^\d{4}-\d{2}$/.test(monthKey ?? "") ? (monthKey as string) : ""
  const month = requested || currentMonthKey(DEFAULT_TIMEZONE)
  return buildMonthData(supabase, month)
}

/**
 * Guarda (o actualiza) una celda del panel.
 *
 * Reglas que aplica antes de escribir:
 *  - La pregunta y el motor deben existir en el catálogo. Una fila con un id
 *    inventado nunca aparecería en la cuadrícula y ensuciaría la cobertura.
 *  - El mes debe ser el primer día y no puede estar en el futuro: no se puede
 *    haber medido cómo citan a un negocio en un mes que no ha pasado.
 *  - `normalizeCell` impone las mismas reglas que los CHECK de la tabla, así
 *    que el formulario no puede producir una fila que la base rechace a medias.
 */
export async function saveGeoPanelCell(input: {
  monthKey: string
  queryId: string
  engineId: string
  cited: boolean
  citationPosition?: number | null
  citedFact?: string | null
  factAccuracy?: string | null
  competitorHost?: string | null
  notes?: string | null
}): Promise<GeoPanelSaveResult> {
  const { user, response: adminDenied } = await requireAdmin()
  if (adminDenied || !user) throw new Error("Acceso restringido a administradores")

  const start = monthStartDate(input.monthKey ?? "")
  if (!start) return { ok: false, error: "Mes inválido." }

  const thisMonth = currentMonthKey(DEFAULT_TIMEZONE)
  if (input.monthKey > thisMonth) {
    return { ok: false, error: "No se puede registrar una corrida de un mes que todavía no ocurre." }
  }

  if (!getGeoQuery(input.queryId)) return { ok: false, error: "Pregunta desconocida." }
  if (!GEO_ENGINES.some((e) => e.id === input.engineId)) return { ok: false, error: "Motor desconocido." }

  const cell = normalizeCell({
    queryId: input.queryId,
    engineId: input.engineId,
    cited: input.cited,
    citationPosition: input.citationPosition,
    citedFact: input.citedFact,
    factAccuracy: input.factAccuracy,
    competitorHost: input.competitorHost,
    notes: input.notes,
  })

  const supabase = await createServiceClient()
  const { error } = await supabase.from("geo_panel_checks").upsert(
    {
      run_month: start,
      query_id: cell.queryId,
      engine_id: cell.engineId,
      cited: cell.cited,
      citation_position: cell.citationPosition,
      cited_fact: cell.citedFact,
      fact_accuracy: cell.factAccuracy,
      competitor_host: cell.competitorHost,
      notes: cell.notes,
      recorded_by: user.id,
    },
    { onConflict: "run_month,query_id,engine_id" }
  )

  if (error) return { ok: false, error: error.message }

  await logAdminAction(supabase, {
    actorId: user.id,
    actorEmail: user.email ?? null,
    action: "geo_panel_check_save",
    entity: "geo_panel_checks",
    entityId: `${start}:${cell.queryId}:${cell.engineId}`,
    detail: {
      run_month: start,
      query_id: cell.queryId,
      engine_id: cell.engineId,
      cited: cell.cited,
      citation_position: cell.citationPosition,
      fact_accuracy: cell.factAccuracy,
    },
  })

  return { ok: true, data: await buildMonthData(supabase, input.monthKey) }
}

/**
 * Borra la fila de una celda, para deshacer una captura equivocada.
 *
 * Sin esto, un "citado = sí" puesto por error sólo se podría corregir a otro
 * valor, y la celda seguiría contando en la cobertura como medida.
 */
export async function clearGeoPanelCell(input: {
  monthKey: string
  queryId: string
  engineId: string
}): Promise<GeoPanelSaveResult> {
  const { user, response: adminDenied } = await requireAdmin()
  if (adminDenied || !user) throw new Error("Acceso restringido a administradores")

  const start = monthStartDate(input.monthKey ?? "")
  if (!start) return { ok: false, error: "Mes inválido." }
  if (!getGeoQuery(input.queryId)) return { ok: false, error: "Pregunta desconocida." }
  if (!GEO_ENGINES.some((e) => e.id === input.engineId)) return { ok: false, error: "Motor desconocido." }

  const supabase = await createServiceClient()
  const { error } = await supabase
    .from("geo_panel_checks")
    .delete()
    .eq("run_month", start)
    .eq("query_id", input.queryId)
    .eq("engine_id", input.engineId)

  if (error) return { ok: false, error: error.message }

  await logAdminAction(supabase, {
    actorId: user.id,
    actorEmail: user.email ?? null,
    action: "geo_panel_check_save",
    entity: "geo_panel_checks",
    entityId: `${start}:${input.queryId}:${input.engineId}`,
    detail: { run_month: start, query_id: input.queryId, engine_id: input.engineId, cleared: true },
  })

  return { ok: true, data: await buildMonthData(supabase, input.monthKey) }
}
