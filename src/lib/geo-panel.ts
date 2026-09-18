// ============================================================
// Panel de prompts GEO — lógica pura
// ============================================================
// El panel de `/admin/seo-ia` nació como una hoja para imprimir: 20 preguntas ×
// 4 motores = 80 celdas con un `—` escrito a mano en el JSX, y un pie de tabla
// pidiendo al lector que anotara "qué dato se citó" y "si era correcto". No
// había dónde anotarlo.
//
// Este módulo es la mitad calculable de la solución: convierte filas guardadas
// en las tasas que `docs/medicion-seo-ia.md` llama "la señal real de progreso".
//
// REGLA QUE GOBIERNA TODO EL MÓDULO
//
// Una tasa sin datos NO es 0%. Un `0%` afirma "lo medí y no pasó nada"; la
// verdad es "no lo he medido". Por eso cada tasa devuelve `number | null` y
// `null` significa sin medición. Es el mismo error que el `—` hardcodeado,
// solo que disfrazado de número. La UI tiene que mostrar "sin datos".
//
// Módulo puro: sin React, sin Supabase, sin `Date` global (el reloj entra como
// parámetro). Se importa desde la server action y desde el componente cliente.

import { dayKeyOf } from "@/lib/local-date"
import { GEO_ENGINES, GEO_PANEL_SIZE, getGeoQuery } from "@/lib/geo-queries"

export const GEO_ACCURACY_VALUES = ["si", "no", "parcial"] as const
export type GeoAccuracy = (typeof GEO_ACCURACY_VALUES)[number]

/** Límites espejo de los CHECK de `00163_geo_panel_checks.sql`. */
export const GEO_PANEL_LIMITS = {
  position: 50,
  fact: 300,
  competitor: 120,
  notes: 500,
} as const

/** Las 5 columnas de valor, atadas a su definición en `GEO_PANEL_FIELDS`. */
export interface GeoPanelFieldBinding {
  /** Nombre del campo en la fila. */
  field: keyof GeoPanelCell
  /** Clave en `GEO_PANEL_FIELDS`, para que la leyenda y el formulario no se separen. */
  docKey: string
}

export const GEO_PANEL_FIELD_BINDINGS: GeoPanelFieldBinding[] = [
  { field: "cited", docKey: "citado" },
  { field: "citationPosition", docKey: "posicion" },
  { field: "citedFact", docKey: "dato" },
  { field: "factAccuracy", docKey: "exacto" },
  { field: "competitorHost", docKey: "competidor" },
]

export interface GeoPanelCell {
  queryId: string
  engineId: string
  cited: boolean
  citationPosition: number | null
  citedFact: string | null
  factAccuracy: GeoAccuracy | null
  competitorHost: string | null
  notes: string | null
}

export interface GeoPanelRecord extends GeoPanelCell {
  /** `YYYY-MM` — mes de la corrida. */
  runMonth: string
}

// ---------------------------------------------------------------------------
// Meses
// ---------------------------------------------------------------------------

const MONTH_NAMES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
]

const pad2 = (n: number) => String(n).padStart(2, "0")

/** `YYYY-MM-DD` → `YYYY-MM`. Devuelve `""` si no es un día válido. */
export function monthKeyOf(dayKey: string): string {
  const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(dayKey)
  if (!m) return ""
  const month = Number(m[2])
  if (month < 1 || month > 12) return ""
  return `${m[1]}-${m[2]}`
}

/**
 * Mes actual en la zona del restaurante. Se deriva del día local —la autoridad
 * única es `local-date`— y no de `toISOString()`, que a las 18:00 de México ya
 * diría que es el mes siguiente.
 */
export function currentMonthKey(
  timezone: string | null | undefined,
  now: Date = new Date()
): string {
  return monthKeyOf(dayKeyOf(timezone, now))
}

/** `YYYY-MM` → `YYYY-MM-01`, la forma que espera la columna `run_month`. */
export function monthStartDate(monthKey: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(monthKey)
  if (!m) return ""
  const month = Number(m[2])
  if (month < 1 || month > 12) return ""
  return `${m[1]}-${m[2]}-01`
}

/** `2026-09` → `septiembre 2026`. Sin `Intl`: no depende de la zona ni del ICU. */
export function monthLabel(monthKey: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(monthKey)
  if (!m) return ""
  const month = Number(m[2])
  if (month < 1 || month > 12) return ""
  return `${MONTH_NAMES[month - 1]} ${m[1]}`
}

/** Desplaza un mes `delta` meses (negativo hacia atrás). `""` si la entrada no sirve. */
export function shiftMonth(monthKey: string, delta: number): string {
  const m = /^(\d{4})-(\d{2})$/.exec(monthKey)
  if (!m) return ""
  const month = Number(m[2])
  if (month < 1 || month > 12) return ""
  const total = Number(m[1]) * 12 + (month - 1) + delta
  return `${Math.floor(total / 12)}-${pad2((total % 12) + 1)}`
}

/** Meses presentes en las filas, de más reciente a más antiguo. */
export function panelRunMonths(records: GeoPanelRecord[]): string[] {
  return [...new Set(records.map((r) => r.runMonth))].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0))
}

/**
 * Mes anterior **con datos**, o `null`.
 *
 * Deliberadamente no es `shiftMonth(actual, -1)`: si agosto no se corrió, el
 * mes anterior calendario no es una base de comparación, es un cero inventado.
 */
export function previousMonthWithData(months: string[], current: string): string | null {
  const earlier = months.filter((m) => m < current).sort()
  return earlier.length > 0 ? earlier[earlier.length - 1] : null
}

// ---------------------------------------------------------------------------
// Normalización
// ---------------------------------------------------------------------------

const trimmedOrNull = (value: string | null | undefined, max: number): string | null => {
  const t = (value ?? "").trim()
  if (!t) return null
  return t.length > max ? t.slice(0, max) : t
}

export function isGeoAccuracy(value: unknown): value is GeoAccuracy {
  return typeof value === "string" && (GEO_ACCURACY_VALUES as readonly string[]).includes(value)
}

/**
 * Sanea una celda antes de guardarla. Aplica las mismas reglas que los CHECK de
 * la tabla para que el formulario no pueda producir una fila que la base
 * rechace a medias.
 *
 * La regla que importa: si no hubo cita, no hay posición ni veredicto sobre el
 * dato. `cited = false` con `citationPosition = 3` es una contradicción que
 * ensuciaría la tasa de acierto, que es justo lo que el panel calcula.
 */
export function normalizeCell(input: {
  queryId: string
  engineId: string
  cited: boolean
  citationPosition?: number | null
  citedFact?: string | null
  factAccuracy?: string | null
  competitorHost?: string | null
  notes?: string | null
}): GeoPanelCell {
  const cited = Boolean(input.cited)
  let position: number | null = null
  let accuracy: GeoAccuracy | null = null

  if (cited) {
    const raw = input.citationPosition
    if (typeof raw === "number" && Number.isFinite(raw)) {
      const rounded = Math.trunc(raw)
      if (rounded >= 1 && rounded <= GEO_PANEL_LIMITS.position) position = rounded
    }
    accuracy = isGeoAccuracy(input.factAccuracy) ? input.factAccuracy : null
  }

  return {
    queryId: input.queryId,
    engineId: input.engineId,
    cited,
    citationPosition: position,
    citedFact: trimmedOrNull(input.citedFact, GEO_PANEL_LIMITS.fact),
    factAccuracy: accuracy,
    competitorHost: trimmedOrNull(input.competitorHost, GEO_PANEL_LIMITS.competitor),
    notes: trimmedOrNull(input.notes, GEO_PANEL_LIMITS.notes),
  }
}

/** Clave de celda dentro de un mes. */
export function cellKey(queryId: string, engineId: string): string {
  return `${queryId}::${engineId}`
}

/** Celdas de un mes indexadas por `cellKey`. */
export function indexCells(records: GeoPanelRecord[]): Map<string, GeoPanelCell> {
  const map = new Map<string, GeoPanelCell>()
  for (const r of records) map.set(cellKey(r.queryId, r.engineId), r)
  return map
}

// ---------------------------------------------------------------------------
// Métricas
// ---------------------------------------------------------------------------

export interface GeoEngineMetrics {
  engineId: string
  label: string
  recorded: number
  cited: number
  citedRate: number | null
}

export interface GeoPanelGap {
  queryId: string
  prompt: string
  targetPath: string
  engineId: string
  engineLabel: string
}

export interface GeoPanelMetrics {
  /** Celdas con fila guardada. */
  recorded: number
  /** `GEO_PANEL_SIZE` — 80. */
  total: number
  coverageRate: number | null
  cited: number
  citedRate: number | null
  /** Celdas con cita Y veredicto sobre el dato. */
  rated: number
  accurate: number
  inaccurate: number
  partial: number
  accuracyRate: number | null
  wrongRate: number | null
  byEngine: GeoEngineMetrics[]
  topCompetitors: { host: string; count: number }[]
  /** Celdas donde la página existe y no nos citaron: lo accionable. */
  gaps: GeoPanelGap[]
}

const rate = (numerator: number, denominator: number): number | null =>
  denominator > 0 ? numerator / denominator : null

export function computePanelMetrics(records: GeoPanelRecord[]): GeoPanelMetrics {
  // Una celda = una fila, pero un mes a medias puede traer duplicados si algo
  // se re-guardó; contar celdas distintas evita que la cobertura pase de 80.
  const cells = indexCells(records)
  const rows = [...cells.values()]

  const recorded = rows.length
  const citedRows = rows.filter((r) => r.cited)
  const ratedRows = citedRows.filter((r) => r.factAccuracy !== null)
  const accurate = ratedRows.filter((r) => r.factAccuracy === "si").length
  const inaccurate = ratedRows.filter((r) => r.factAccuracy === "no").length
  const partial = ratedRows.filter((r) => r.factAccuracy === "parcial").length

  const byEngine: GeoEngineMetrics[] = GEO_ENGINES.map((engine) => {
    const engineRows = rows.filter((r) => r.engineId === engine.id)
    const engineCited = engineRows.filter((r) => r.cited).length
    return {
      engineId: engine.id,
      label: engine.label,
      recorded: engineRows.length,
      cited: engineCited,
      citedRate: rate(engineCited, engineRows.length),
    }
  })

  const competitorCounts = new Map<string, number>()
  for (const r of rows) {
    if (r.cited) continue
    const host = normalizeCompetitorHost(r.competitorHost)
    if (!host) continue
    competitorCounts.set(host, (competitorCounts.get(host) ?? 0) + 1)
  }
  const topCompetitors = [...competitorCounts.entries()]
    .map(([host, count]) => ({ host, count }))
    .sort((a, b) => (b.count !== a.count ? b.count - a.count : a.host.localeCompare(b.host)))
    .slice(0, 5)

  const gaps: GeoPanelGap[] = []
  for (const r of rows) {
    if (r.cited) continue
    const query = getGeoQuery(r.queryId)
    if (!query) continue
    const engine = GEO_ENGINES.find((e) => e.id === r.engineId)
    gaps.push({
      queryId: r.queryId,
      prompt: query.prompt,
      targetPath: query.targetPath,
      engineId: r.engineId,
      engineLabel: engine?.label ?? r.engineId,
    })
  }
  gaps.sort((a, b) => a.prompt.localeCompare(b.prompt) || a.engineLabel.localeCompare(b.engineLabel))

  return {
    recorded,
    total: GEO_PANEL_SIZE,
    coverageRate: rate(recorded, GEO_PANEL_SIZE),
    cited: citedRows.length,
    citedRate: rate(citedRows.length, recorded),
    rated: ratedRows.length,
    accurate,
    inaccurate,
    partial,
    accuracyRate: rate(accurate, ratedRows.length),
    wrongRate: rate(inaccurate, ratedRows.length),
    byEngine,
    topCompetitors,
    gaps,
  }
}

/** `https://www.Competidor.MX/precios` → `competidor.mx`. */
export function normalizeCompetitorHost(value: string | null | undefined): string | null {
  const t = (value ?? "").trim().toLowerCase()
  if (!t) return null
  const withoutScheme = t.replace(/^[a-z][a-z0-9+.-]*:\/\//, "")
  const host = withoutScheme.split("/")[0].replace(/^www\./, "")
  return host || null
}

export interface GeoPanelComparison {
  /** Mes contra el que se compara, o `null` si no hay base. */
  previousMonth: string | null
  citedRateDelta: number | null
  coverageDelta: number | null
  accuracyRateDelta: number | null
}

/**
 * Comparación mes contra mes. Si no hay un mes anterior **con datos**, todo
 * delta es `null`: una variación de +40 puntos contra "nada" es una invención.
 */
export function comparePanelMonths(
  current: GeoPanelMetrics,
  previous: GeoPanelMetrics | null,
  previousMonth: string | null
): GeoPanelComparison {
  if (!previous || !previousMonth) {
    return {
      previousMonth: null,
      citedRateDelta: null,
      coverageDelta: null,
      accuracyRateDelta: null,
    }
  }
  const delta = (a: number | null, b: number | null): number | null =>
    a === null || b === null ? null : a - b
  return {
    previousMonth,
    citedRateDelta: delta(current.citedRate, previous.citedRate),
    coverageDelta: delta(current.coverageRate, previous.coverageRate),
    accuracyRateDelta: delta(current.accuracyRate, previous.accuracyRate),
  }
}

// ---------------------------------------------------------------------------
// Veredicto
// ---------------------------------------------------------------------------

export type GeoPanelVerdict =
  | "sin_datos"
  | "cobertura_parcial"
  | "sin_citas"
  | "citas_inexactas"
  | "citas_correctas"

/**
 * Lectura honesta de una corrida. El orden importa:
 *
 * 1. Sin filas → no hay nada que leer.
 * 2. Cobertura < 100% → con 40 de 80 celdas NO se puede concluir "no nos
 *    citan"; se puede concluir "faltan celdas". Va antes que `sin_citas` para
 *    que un mes a medias nunca se reporte como un fracaso de posicionamiento.
 * 3. Cero citas → el problema es que no aparecemos.
 * 4. Más citas inexactas que exactas → el problema es peor que no aparecer:
 *    el pie de la propia página lo dice ("una cita con el precio equivocado es
 *    peor que no aparecer").
 */
export function panelVerdict(m: GeoPanelMetrics): GeoPanelVerdict {
  if (m.recorded === 0) return "sin_datos"
  if (m.coverageRate !== null && m.coverageRate < 1) return "cobertura_parcial"
  if (m.cited === 0) return "sin_citas"
  if (m.rated > 0 && m.inaccurate > m.accurate) return "citas_inexactas"
  return "citas_correctas"
}

/** Porcentaje legible. `null` → `"sin datos"`, nunca `"0%"`. */
export function formatRate(value: number | null, digits = 0): string {
  if (value === null || !Number.isFinite(value)) return "sin datos"
  return `${(value * 100).toFixed(digits)}%`
}

/** Delta con signo en puntos porcentuales. `null` → `"—"` (no hay base). */
export function formatDelta(value: number | null, digits = 0): string {
  if (value === null || !Number.isFinite(value)) return "—"
  const points = value * 100
  const sign = points > 0 ? "+" : ""
  return `${sign}${points.toFixed(digits)} pp`
}

/** CSV de una corrida, para archivar fuera del panel. */
export function panelRowsToCsv(records: GeoPanelRecord[]): string {
  const header = [
    "mes",
    "pregunta_id",
    "pregunta",
    "motor",
    "citado",
    "posicion",
    "dato_citado",
    "exacto",
    "competidor",
    "notas",
  ]
  const quote = (v: string | null | undefined) => {
    const t = (v ?? "").replace(/"/g, '""')
    return /[",\n]/.test(t) ? `"${t}"` : t
  }
  const lines = [...indexCells(records).values()]
    .map((cell) => {
      const query = getGeoQuery(cell.queryId)
      const engine = GEO_ENGINES.find((e) => e.id === cell.engineId)
      return [
        cell.runMonth,
        cell.queryId,
        query?.prompt ?? "",
        engine?.label ?? cell.engineId,
        cell.cited ? "si" : "no",
        cell.citationPosition === null ? "" : String(cell.citationPosition),
        cell.citedFact,
        cell.factAccuracy,
        cell.competitorHost,
        cell.notes,
      ]
        .map((v) => quote(v))
        .join(",")
    })
    .sort()
  return [header.join(","), ...lines].join("\n")
}
