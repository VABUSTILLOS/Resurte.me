/**
 * "Respuesta rápida": el bloque citable que va al inicio de cada guía.
 *
 * Los motores de respuesta (AI Overviews, ChatGPT, Perplexity) extraen un
 * pasaje autocontenido, no la página entera. Este módulo deriva ese pasaje del
 * primer párrafo real del MDX cuando el frontmatter no trae uno explícito, de
 * modo que las 226 guías publicadas tengan respuesta citable sin reescribirlas.
 *
 * Es puro a propósito: sin fs y sin Next, para poder probarlo directamente.
 */

/** Máximo de palabras de la respuesta. Más largo deja de ser citable. */
export const QUICK_ANSWER_MAX_WORDS = 50

/** Un párrafo con menos palabras que esto no sirve como respuesta. */
const MIN_PARAGRAPH_WORDS = 8

/** Bloques que nunca son la respuesta: encabezados, listas, tablas, JSX. */
const NON_PARAGRAPH_START = /^\s*(?:#{1,6}\s|[-*+]\s|\d+[.)]\s|>|\||<|```|~~~|import\s|export\s|:::|!\[)/

/**
 * Convierte markdown en línea a texto plano.
 * Los enlaces conservan su texto, no su URL.
 */
function stripInlineMarkdown(text: string): string {
  return text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1") // imágenes → alt
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // enlaces → texto
    .replace(/`{1,3}([^`]*)`{1,3}/g, "$1") // código
    .replace(/(\*\*|__)(.*?)\1/g, "$2") // negrita
    .replace(/(\*|_)(.*?)\1/g, "$2") // cursiva
    .replace(/~~(.*?)~~/g, "$1") // tachado
    .replace(/<[^>]+>/g, "") // HTML/JSX en línea
    .replace(/\\/g, "") // escapes
    .replace(/\s+/g, " ") // incluye los saltos de línea de párrafos partidos
    .trim()
}

/** Divide en oraciones. Los decimales ("28.5") no llevan espacio, así que no cortan. */
function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length
}

/**
 * Recorta a `maxWords` respetando el final de oración cuando se puede.
 * Si una sola oración excede el presupuesto, corta y marca el corte.
 */
function clampToBudget(text: string, maxWords: number): string {
  if (countWords(text) <= maxWords) return text

  const kept: string[] = []
  let used = 0
  for (const sentence of splitSentences(text)) {
    const words = countWords(sentence)
    if (used + words > maxWords) break
    kept.push(sentence)
    used += words
  }
  if (kept.length > 0) return kept.join(" ")

  // Primera oración más larga que el presupuesto: corte duro.
  const words = text.split(/\s+/).filter(Boolean).slice(0, maxWords)
  const last = words[words.length - 1] ?? ""
  words[words.length - 1] = last.replace(/[,;:.]+$/, "")
  return `${words.join(" ")}…`
}

/**
 * Deriva la respuesta rápida del cuerpo MDX.
 *
 * Devuelve `null` cuando no hay un párrafo aprovechable; el llamador decide
 * entonces si cae al `description` del frontmatter.
 */
export function deriveQuickAnswer(
  body: string,
  maxWords: number = QUICK_ANSWER_MAX_WORDS
): string | null {
  if (!body) return null

  // Fuera bloques de código y comentarios MDX antes de partir en párrafos:
  // su contenido no es prosa y arruinaría la detección.
  const withoutCode = body
    .replace(/```[\s\S]*?```/g, "\n\n")
    .replace(/~~~[\s\S]*?~~~/g, "\n\n")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "\n\n")

  for (const block of withoutCode.split(/\n{2,}/)) {
    const trimmed = block.trim()
    if (!trimmed) continue
    // Un párrafo puede venir partido en varias líneas por el formato del MDX,
    // así que solo se descarta el bloque si *alguna* línea arranca un bloque no
    // narrativo (lista, encabezado, tabla, cita, JSX, import).
    if (trimmed.split("\n").some((line) => NON_PARAGRAPH_START.test(line))) {
      continue
    }

    const plain = stripInlineMarkdown(trimmed)
    if (countWords(plain) < MIN_PARAGRAPH_WORDS) continue

    return clampToBudget(plain, maxWords)
  }

  return null
}
