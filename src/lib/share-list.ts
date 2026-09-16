import { normalizeSearchTerm } from "./search-terms"

/**
 * Parser de listas compartidas (PWA share target).
 *
 * El caso real: alguien manda por WhatsApp "2 kg de tomate, 1 lechuga, 3
 * limones" y quien recibe tiene que reescribir todo en el buscador. Aquí se
 * convierte ese texto en renglones con nombre y cantidad para que la página
 * `/compartir` solo tenga que resolver cada nombre contra el catálogo.
 */

/** Máximo de renglones distintos que se procesan de una lista compartida. */
export const MAX_SHARE_ITEMS = 20

/** Tope de cantidad por renglón (evita "999999 x" por dedo pegado). */
export const MAX_SHARE_QUANTITY = 99

export interface ShareEntry {
  /** Nombre limpio, tal como se buscará en el catálogo. */
  name: string
  quantity: number
}

export interface ShareParseResult {
  entries: ShareEntry[]
  /** Renglones descartados por exceder MAX_SHARE_ITEMS. */
  truncated: number
}

const LIST_MARKER_RE = /^\s*(?:[-*•·–—]|\d{1,2}[.)])\s+/
const LEADING_QTY_RE = /^(\d{1,3})\s*(?:[x×]|piezas?|pzas?|kg|kilos?|g|litros?|l)?\s+(.+)$/i
const TRAILING_QTY_RE = /^(.+?)\s*[x×]\s*(\d{1,3})$/i
const PAREN_QTY_RE = /^(.+?)\s*\((\d{1,3})\)$/
const URL_RE = /^(?:https?:\/\/|www\.)\S+$/i

function clampQuantity(value: number): number {
  if (!Number.isFinite(value) || value < 1) return 1
  return Math.min(Math.floor(value), MAX_SHARE_QUANTITY)
}

/**
 * Limpia un renglón: quita viñetas/numeración de lista, puntuación final y el
 * conector que queda al separar la cantidad ("2 kg **de** tomate" → "tomate").
 * Devuelve "" si el renglón no aporta un nombre utilizable.
 */
function cleanName(raw: string): string {
  const withoutMarker = raw.replace(LIST_MARKER_RE, "")
  return withoutMarker
    .replace(/[\s.;,·]+$/u, "")
    .replace(/^\s*[-–—:]\s*/, "")
    .replace(/^(?:de|del)\s+/i, "")
    .trim()
}

interface ParsedLine {
  name: string
  quantity: number
}

function parseLine(raw: string): ParsedLine | null {
  const line = raw.trim()
  if (!line || URL_RE.test(line)) return null

  const withoutMarker = line.replace(LIST_MARKER_RE, "")

  const trailing = withoutMarker.match(TRAILING_QTY_RE)
  if (trailing) {
    const name = cleanName(trailing[1] ?? "")
    return name ? { name, quantity: clampQuantity(Number(trailing[2] ?? "")) } : null
  }

  const paren = withoutMarker.match(PAREN_QTY_RE)
  if (paren) {
    const name = cleanName(paren[1] ?? "")
    return name ? { name, quantity: clampQuantity(Number(paren[2] ?? "")) } : null
  }

  const leading = withoutMarker.match(LEADING_QTY_RE)
  if (leading) {
    const name = cleanName(leading[2] ?? "")
    return name ? { name, quantity: clampQuantity(Number(leading[1] ?? "")) } : null
  }

  const name = cleanName(withoutMarker)
  return name ? { name, quantity: 1 } : null
}

/**
 * Convierte el texto compartido en renglones con cantidad. Los renglones
 * repetidos (comparados sin acentos ni mayúsculas) se suman en una sola
 * entrada para no pedir dos veces lo mismo.
 */
export function parseShareText(text: string | null | undefined): ShareParseResult {
  if (!text) return { entries: [], truncated: 0 }

  const byKey = new Map<string, ShareEntry>()
  const order: string[] = []
  let truncated = 0

  for (const raw of text.split(/\r?\n/)) {
    const parsed = parseLine(raw)
    if (!parsed) continue

    const key = normalizeSearchTerm(parsed.name)
    if (key.length < 2) continue

    const existing = byKey.get(key)
    if (existing) {
      existing.quantity = clampQuantity(existing.quantity + parsed.quantity)
      continue
    }
    if (byKey.size >= MAX_SHARE_ITEMS) {
      truncated += 1
      continue
    }
    byKey.set(key, { name: parsed.name, quantity: parsed.quantity })
    order.push(key)
  }

  return {
    entries: order.flatMap((key) => {
      const entry = byKey.get(key)
      return entry ? [entry] : []
    }),
    truncated,
  }
}

/**
 * Texto a parsear a partir de los parámetros del share target. `text` es lo
 * que la persona escribió en la app de origen (la lista); `title` es el
 * respaldo cuando el texto viene vacío.
 */
export function mergeShareInput(
  text: string | null | undefined,
  title: string | null | undefined
): string {
  const cleanText = (text ?? "").trim()
  if (cleanText) return cleanText
  return (title ?? "").trim()
}

export function totalShareQuantity(entries: readonly ShareEntry[]): number {
  return entries.reduce((sum, entry) => sum + entry.quantity, 0)
}

export interface MatchCandidate {
  id: number
  name: string
  slug: string
}

/**
 * Elige el producto que mejor corresponde a un nombre escrito a mano. La
 * búsqueda del catálogo ya filtra por relevancia, así que aquí solo se
 * desempata: primero nombre idéntico, luego el que empieza igual, luego el
 * que lo contiene, y si nada de eso aplica se toma el primer resultado.
 *
 * Devuelve null sin candidatos para que el caller lo mande a la lista de
 * "sin coincidencia" en lugar de agregar algo al azar.
 */
export function pickBestMatch<T extends MatchCandidate>(
  name: string,
  candidates: readonly T[]
): T | null {
  const first = candidates[0]
  if (!first) return null
  const target = normalizeSearchTerm(name)
  if (!target) return first

  let startsWith: T | null = null
  let contains: T | null = null
  for (const candidate of candidates) {
    const current = normalizeSearchTerm(candidate.name)
    if (current === target) return candidate
    if (!startsWith && current.startsWith(target)) startsWith = candidate
    if (!contains && current.includes(target)) contains = candidate
  }
  return startsWith ?? contains ?? first
}

/** "3 productos · 6 piezas" para el encabezado de la lista. */
export function shareSummary(entries: readonly ShareEntry[]): string {
  const count = entries.length
  const pieces = totalShareQuantity(entries)
  const productLabel = count === 1 ? "1 producto" : `${count} productos`
  const pieceLabel = pieces === 1 ? "1 pieza" : `${pieces} piezas`
  return `${productLabel} · ${pieceLabel}`
}
