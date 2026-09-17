/**
 * Reescritura de tono del Mesero IA.
 *
 * Es el **único** lugar donde el LLM toca una respuesta al comensal, y solo
 * cuando `turn.rephraseable === true`. Las respuestas con dinero (resumen,
 * confirmación, lista de platillos con precios) llegan con
 * `rephraseable: false` y se envían literales: un modelo que "mejora" una
 * cifra es un bug de cobro, no una mejora de redacción.
 *
 * Nunca lanza: si el modelo falla, tarda, se pasa del presupuesto o devuelve
 * algo sospechoso, se envía el texto original de la máquina de estados.
 */

import { chatCompletionRaw } from "@/lib/ai/llm"
import { logger } from "@/lib/logger"
import type { MeseroTurn } from "./state-machine"

export type MeseroTone = "amable" | "formal" | "rapido" | "divertido"

const TONE_INSTRUCTION: Record<MeseroTone, string> = {
  amable: "Cálido y cercano, como un mesero que conoce al cliente de siempre.",
  formal: "Cortés y profesional, sin coloquialismos ni emojis.",
  rapido: "Directo y breve, sin rodeos. Máximo dos líneas.",
  divertido: "Con humor ligero y algún emoji, sin exagerar ni hacer chistes a costa del cliente.",
}

/** Tope defensivo: si el modelo se desborda, se descarta su versión. */
const MAX_POLISHED_LENGTH = 700

export interface PolishInput {
  turn: MeseroTurn
  tone: MeseroTone
  restaurantName: string
  restaurantId?: string | null
}

export interface PolishOutput {
  text: string
  source: "literal" | "llm"
  model: string | null
  tokensUsed: number | null
}

/** Dígitos presentes en un texto, para detectar cifras inventadas. */
function digitsOf(text: string): Set<string> {
  return new Set(text.match(/\d+/g) ?? [])
}

/**
 * Un texto reescrito solo puede conservar o quitar cifras, nunca añadirlas.
 * Si el modelo inventa un precio, un teléfono o una hora, se descarta.
 */
function introducesNewNumbers(original: string, polished: string): boolean {
  const before = digitsOf(original)
  for (const n of digitsOf(polished)) {
    if (!before.has(n)) return true
  }
  return false
}

export async function polishReply(input: PolishInput): Promise<PolishOutput> {
  const { turn, tone, restaurantName, restaurantId } = input
  const literal = turn.reply

  // Silencio deliberado (handoff) o respuesta con dinero: se envía tal cual.
  if (!turn.rephraseable || !literal.trim()) {
    return { text: literal, source: "literal", model: null, tokensUsed: null }
  }

  const system =
    `Eres el mesero virtual de ${restaurantName} por WhatsApp. ` +
    `Reescribes el mensaje que te doy con este tono: ${TONE_INSTRUCTION[tone]} ` +
    "Reglas estrictas: conserva TODO el significado; no agregues platillos, precios, " +
    "promociones, horarios ni datos que no estén en el mensaje; no cambies ni inventes " +
    "cifras; conserva los enlaces tal cual; responde solo con el mensaje reescrito, sin " +
    "explicaciones ni comillas."

  const result = await chatCompletionRaw(
    system,
    literal,
    { feature: "mesero_ia", maxTokens: 300, restaurantId },
    {}
  )

  if (!result) {
    return { text: literal, source: "literal", model: null, tokensUsed: null }
  }

  const polished = result.text.trim()
  if (
    !polished ||
    polished.length > MAX_POLISHED_LENGTH ||
    introducesNewNumbers(literal, polished)
  ) {
    logger.warn("[Mesero IA] Reescritura descartada", {
      reason: !polished ? "empty" : polished.length > MAX_POLISHED_LENGTH ? "too_long" : "new_numbers",
    })
    return { text: literal, source: "literal", model: result.model, tokensUsed: result.tokensUsed }
  }

  return {
    text: polished,
    source: "llm",
    model: result.model,
    tokensUsed: result.tokensUsed,
  }
}
