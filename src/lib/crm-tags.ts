/**
 * Ronda 6 — etiquetas de prospectos.
 *
 * Se guardan en `crm_prospects.tags TEXT[]` (00140) **siempre normalizadas**:
 * minúsculas, sin acentos y con los espacios colapsados. Así `Cafetería`,
 * `cafeteria` y `  cafetería ` son la misma etiqueta y el filtro de la URL no
 * depende de cómo la escribió cada vendedor.
 */

import { normalizeForSearch } from "./crm-core"

/**
 * Ronda 7: `readTags` se movió a `crm-core.ts` (lo necesita el mapeo de filas, y
 * `crm-core` no puede importar de aquí sin crear un ciclo). Se reexporta para no
 * romper a sus consumidores.
 */
export { readTags } from "./crm-core"

/** Longitud máxima de una etiqueta, ya normalizada. */
export const MAX_TAG_LENGTH = 24
/** Tope de etiquetas por prospecto: más que esto deja de ser una clasificación. */
export const MAX_TAGS_PER_PROSPECT = 12

/**
 * Normaliza una etiqueta. Devuelve `null` cuando no queda nada usable, para que
 * el llamador no tenga que distinguir entre `""` y `"   "`.
 */
export function normalizeTag(value: string | null | undefined): string | null {
  if (!value) return null
  const cleaned = normalizeForSearch(value)
    .replace(/[^\p{L}\p{N} _-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
  if (!cleaned) return null
  return cleaned.slice(0, MAX_TAG_LENGTH).trim() || null
}

/**
 * Normaliza y deduplica conservando el orden de aparición, y aplica el tope.
 * El tope se aplica aquí y no al leer, para no ocultar etiquetas ya guardadas.
 */
export function normalizeTags(values: readonly string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of values) {
    const tag = normalizeTag(value)
    if (!tag || seen.has(tag)) continue
    seen.add(tag)
    out.push(tag)
    if (out.length >= MAX_TAGS_PER_PROSPECT) break
  }
  return out
}

/** Separa un texto libre (`"vip, mayoreo; nuevo"`) en etiquetas normalizadas. */
export function parseTagInput(input: string | null | undefined): string[] {
  if (!input) return []
  return normalizeTags(input.split(/[,;\n]/))
}

/** Alta sin duplicar ni exceder el tope. */
export function addTags(current: readonly string[], add: readonly string[]): string[] {
  return normalizeTags([...current, ...add])
}

/** Baja de etiquetas, conservando el orden de las que quedan. */
export function removeTags(current: readonly string[], remove: readonly string[]): string[] {
  const drop = new Set(normalizeTags(remove))
  return current.filter((tag) => !drop.has(tag))
}

/** Alta o baja de una etiqueta, según si ya estaba. */
export function toggleTag(current: readonly string[], tag: string): string[] {
  const normalized = normalizeTag(tag)
  if (!normalized) return [...current]
  return current.includes(normalized)
    ? removeTags(current, [normalized])
    : addTags(current, [normalized])
}

/** ¿Coincide con el filtro? Compara normalizado, así `Vip` filtra `vip`. */
export function tagMatches(tag: string, query: string | null | undefined): boolean {
  const needle = normalizeTag(query)
  return needle !== null && normalizeTag(tag) === needle
}

/** Etiqueta lista para pintar: primera letra en mayúscula. */
export function tagLabel(tag: string): string {
  if (!tag) return ""
  return tag.charAt(0).toUpperCase() + tag.slice(1)
}
