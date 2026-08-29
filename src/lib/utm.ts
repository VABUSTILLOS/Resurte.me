/**
 * Atribución UTM del checkout (cliente).
 *
 * - `captureUtmParams(search)`: lee los parámetros utm_* de la URL de
 *   aterrizaje y los persiste en localStorage (primer toque con UTMs gana;
 *   no se sobreescriben con navegaciones internas sin parámetros).
 * - `getStoredUtm()`: devuelve la atribución persistida para adjuntarla al
 *   payload de POST /api/orders (columnas utm_* de `orders`, migración 00061).
 *
 * SSR-safe: todas las funciones toleran `window` indefinido.
 */

export interface UtmAttribution {
  utm_source?: string
  utm_medium?: string
  utm_campaign?: string
  utm_term?: string
  utm_content?: string
}

export const UTM_STORAGE_KEY = "resurte_utm"

const UTM_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
] as const

/** Limpia un valor UTM: recorta y limita a 200 chars; vacío → undefined. */
export function sanitizeUtmValue(value: string | null | undefined): string | undefined {
  if (!value) return undefined
  const trimmed = value.trim().slice(0, 200)
  return trimmed.length > 0 ? trimmed : undefined
}

/** Extrae los UTMs presentes en un query string (con o sin `?` inicial). */
export function parseUtmParams(search: string): UtmAttribution | null {
  const query = search.startsWith("?") ? search.slice(1) : search
  if (!query) return null
  const params = new URLSearchParams(query)
  const utm: UtmAttribution = {}
  let found = false
  for (const key of UTM_KEYS) {
    const value = sanitizeUtmValue(params.get(key))
    if (value) {
      utm[key] = value
      found = true
    }
  }
  return found ? utm : null
}

/**
 * Captura los UTMs de la URL actual y los persiste. Si la URL no trae UTMs,
 * conserva los ya guardados (atribución de primer toque con parámetros).
 * Devuelve true si se persistió una nueva atribución.
 */
export function captureUtmParams(search?: string): boolean {
  if (typeof window === "undefined") return false
  const utm = parseUtmParams(search ?? window.location.search)
  if (!utm) return false
  try {
    window.localStorage.setItem(UTM_STORAGE_KEY, JSON.stringify(utm))
    return true
  } catch {
    return false
  }
}

/** Lee la atribución persistida; null si no hay o el dato está corrupto. */
export function getStoredUtm(): UtmAttribution | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(UTM_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const utm: UtmAttribution = {}
    let found = false
    for (const key of UTM_KEYS) {
      const value = sanitizeUtmValue(
        typeof parsed[key] === "string" ? (parsed[key] as string) : undefined
      )
      if (value) {
        utm[key] = value
        found = true
      }
    }
    return found ? utm : null
  } catch {
    return null
  }
}
