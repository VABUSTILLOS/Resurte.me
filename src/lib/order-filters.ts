/**
 * Fase 9 — utilidades puras para la búsqueda avanzada de pedidos admin:
 * rango de fechas y filtros guardados (presets en localStorage).
 */

export interface OrderDateRange {
  /** ISO date (YYYY-MM-DD) inclusive, día calendario local */
  from?: string
  /** ISO date (YYYY-MM-DD) inclusive, día calendario local */
  to?: string
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE_RE.test(value)) return false
  const d = new Date(`${value}T00:00:00`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value
}

/**
 * Normaliza el rango de fechas de la UI a límites ISO para SQL.
 * `from` se interpreta como inicio del día local; `to` como fin del día
 * local, por eso el límite superior devuelto es EXCLUSIVO (inicio del
 * día siguiente). Devuelve undefined para valores inválidos o ausentes.
 */
export function normalizeDateRange(range: OrderDateRange): {
  fromIso?: string
  toExclusiveIso?: string
} {
  const out: { fromIso?: string; toExclusiveIso?: string } = {}
  const from = range.from?.trim()
  const to = range.to?.trim()
  if (from && isValidIsoDate(from)) {
    out.fromIso = new Date(`${from}T00:00:00`).toISOString()
  }
  if (to && isValidIsoDate(to)) {
    const end = new Date(`${to}T00:00:00`)
    end.setDate(end.getDate() + 1)
    out.toExclusiveIso = end.toISOString()
  }
  return out
}

/** Filtro guardado: combinación con nombre de los filtros de la página. */
export interface SavedOrderFilter {
  name: string
  status: string
  search: string
  from: string
  to: string
}

const MAX_SAVED_FILTERS = 10
const MAX_NAME_LENGTH = 40

export const SAVED_FILTERS_STORAGE_KEY = "admin-pedidos-filtros"

/** Parsea el JSON de localStorage; nunca lanza, devuelve [] si es inválido. */
export function parseSavedFilters(json: string | null): SavedOrderFilter[] {
  if (!json) return []
  try {
    const raw: unknown = JSON.parse(json)
    if (!Array.isArray(raw)) return []
    return raw
      .filter(
        (f): f is SavedOrderFilter =>
          typeof f === "object" &&
          f !== null &&
          typeof (f as SavedOrderFilter).name === "string" &&
          typeof (f as SavedOrderFilter).status === "string" &&
          typeof (f as SavedOrderFilter).search === "string" &&
          typeof (f as SavedOrderFilter).from === "string" &&
          typeof (f as SavedOrderFilter).to === "string"
      )
      .slice(0, MAX_SAVED_FILTERS)
  } catch {
    return []
  }
}

export function serializeSavedFilters(filters: SavedOrderFilter[]): string {
  return JSON.stringify(filters.slice(0, MAX_SAVED_FILTERS))
}

/**
 * Crea un preset normalizado. Devuelve null si el nombre queda vacío.
 * Recorta el nombre y evita duplicados por nombre (el caller decide si
 * reemplaza o rechaza).
 */
export function makeSavedFilter(
  name: string,
  current: Omit<SavedOrderFilter, "name">
): SavedOrderFilter | null {
  const clean = name.trim().slice(0, MAX_NAME_LENGTH)
  if (!clean) return null
  return { name: clean, ...current }
}
