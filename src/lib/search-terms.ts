/**
 * Normalización y expansión de términos de búsqueda del catálogo.
 *
 * La búsqueda SQL (ilike) es sensible a acentos y no conoce sinónimos
 * regionales del español de México; aquí se normaliza (minúsculas, sin
 * acentos) y se expande el término con equivalencias comunes de abastos
 * para que "palta" encuentre "aguacate" o "soda" encuentre "refresco".
 *
 * Extraído para testabilidad (lo usa searchAll en data.ts).
 */

export function normalizeSearchTerm(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    // strip diacríticos combinantes (U+0300–U+036F): "café" → "cafe"
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
}

/** Sinónimos bidireccionales comunes del abasto/restaurante en México. */
const SYNONYMS: Record<string, string[]> = {
  aguacate: ["palta"],
  palta: ["aguacate"],
  jitomate: ["tomate"],
  tomate: ["jitomate"],
  elote: ["maiz"],
  maiz: ["elote"],
  chicharo: ["arveja"],
  arveja: ["chicharo"],
  frijol: ["frijoles"],
  frijoles: ["frijol"],
  camaron: ["camarones"],
  refresco: ["soda", "gaseosa"],
  soda: ["refresco", "gaseosa"],
  gaseosa: ["refresco", "soda"],
  cerveza: ["chela"],
  chela: ["cerveza"],
  servilleta: ["servilletas"],
  platano: ["banana"],
  banana: ["platano"],
  papa: ["papas"],
  chile: ["chiles"],
  pollo: ["pechuga", "pollo"],
  res: ["carne de res", "bistec"],
  cerdo: ["puerco"],
  puerco: ["cerdo"],
  aceite: ["aceites"],
  manteca: ["grasa"],
  azucar: ["azucar"],
  leche: ["lacteo", "lacteos"],
  queso: ["quesos"],
  limon: ["limones"],
  cebolla: ["cebollas"],
  ajo: ["ajos"],
}

/**
 * Devuelve el término normalizado + sus sinónimos (sin duplicados),
 * listo para construir un OR de ilike en Supabase.
 */
export function expandSearchTerms(query: string): string[] {
  const base = normalizeSearchTerm(query)
  if (!base) return []
  const terms = new Set<string>([base])
  for (const word of base.split(/\s+/)) {
    for (const syn of SYNONYMS[word] ?? []) {
      terms.add(base.replace(word, syn))
    }
  }
  return Array.from(terms).slice(0, 6)
}

/** Escapa caracteres con significado especial en patrones ilike de PostgREST. */
export function escapeIlike(term: string): string {
  return term.replace(/[%_.,()]/g, " ")
}
