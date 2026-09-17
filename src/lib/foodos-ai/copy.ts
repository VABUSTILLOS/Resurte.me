/**
 * Marketing IA: redacción de campañas.
 *
 * El dueño escribe la intención ("queremos llenar el martes, hay tacos de
 * pastor y ya no vendemos el corte") y el modelo la convierte en un mensaje
 * de WhatsApp que suena a persona y no a plantilla corporativa.
 *
 * Lo que el modelo NO puede hacer, igual que en el Mesero IA:
 *  - Inventar cifras. Solo puede usar los números que ya estaban en el brief
 *    o en la oferta configurada. Un "20% de descuento" inventado es dinero
 *    real que el restaurante no autorizó.
 *  - Escribir enlaces. El enlace siempre es `{link}`, que el motor
 *    reemplaza por el correcto para cada cliente.
 *
 * Nunca lanza: si no hay modelo, hay plantilla.
 */

import { chatCompletionRaw, fallbackTemplates } from "@/lib/ai/llm"
import { logger } from "@/lib/logger"

export type CampaignTone = "cercano" | "formal" | "urgente" | "festivo"

const TONE_INSTRUCTION: Record<CampaignTone, string> = {
  cercano: "Cálido y de tú, como si le escribieras a un cliente de siempre.",
  formal: "Cortés y profesional, sin emojis ni coloquialismos.",
  urgente: "Con sentido de urgencia real (pocas piezas, solo hoy), sin sonar a spam.",
  festivo: "Alegre y celebratorio, con algún emoji, sin exagerar.",
}

/** Tope defensivo: WhatsApp corta y el restaurante pierde el mensaje. */
export const MAX_TEMPLATE_LENGTH = 500

export interface CampaignCopyInput {
  restaurantName: string
  /** Intención del dueño en lenguaje natural. */
  brief: string
  /** Oferta ya configurada, p. ej. "10% de descuento". */
  offer?: string | null
  /** Audiencia objetivo, p. ej. "los que no vienen hace un mes". */
  audienceLabel?: string | null
  tone?: CampaignTone
  restaurantId?: string | null
}

export interface CampaignCopyOutput {
  /** Plantilla con `{nombre}` y `{link}` para el motor de campañas. */
  text: string
  source: "llm" | "template"
  model: string | null
  tokensUsed: number | null
}

function digitsOf(text: string): Set<string> {
  return new Set(text.match(/\d+/g) ?? [])
}

/** Un mensaje generado no puede introducir cifras que nadie autorizó. */
function introducesNewNumbers(allowed: Set<string>, generated: string): boolean {
  for (const n of digitsOf(generated)) {
    if (!allowed.has(n)) return true
  }
  return false
}

/** Quita comillas y bloques de código con los que los modelos se adornan. */
function clean(raw: string): string {
  let text = raw.trim()
  const fence = text.match(/^```(?:\w+)?\n([\s\S]*?)\n?```$/)
  if (fence?.[1]) text = fence[1].trim()
  if (
    (text.startsWith('"') && text.endsWith('"')) ||
    (text.startsWith("«") && text.endsWith("»"))
  ) {
    text = text.slice(1, -1).trim()
  }
  return text
}

/**
 * Genera la plantilla de un mensaje de campaña.
 *
 * Devuelve siempre una plantilla usable: con `{link}` al final garantizado
 * (si el modelo lo omitió se añade) y sin URLs inventadas.
 */
export async function generateCampaignCopy(
  input: CampaignCopyInput
): Promise<CampaignCopyOutput> {
  const {
    restaurantName,
    brief,
    offer,
    audienceLabel,
    tone = "cercano",
    restaurantId,
  } = input

  const fallback = () =>
    fallbackTemplates.campaign_copy({
      restaurant: restaurantName,
      offer: offer?.trim() || brief.trim(),
      audience: audienceLabel?.trim() || "cliente de siempre",
      orderLink: "{link}",
    })

  const cleanBrief = brief.trim()
  if (!cleanBrief) {
    return { text: fallback(), source: "template", model: null, tokensUsed: null }
  }

  // Cifras legítimas: las que el dueño ya escribió o configuró.
  const allowedDigits = digitsOf(
    [cleanBrief, offer ?? "", audienceLabel ?? "", restaurantName].join(" ")
  )

  const system =
    `Eres el encargado de marketing de ${restaurantName}, un restaurante en México. ` +
    "Escribes mensajes de WhatsApp para clientes que ya conocen el negocio. " +
    `Tono: ${TONE_INSTRUCTION[tone]} ` +
    "Reglas estrictas: máximo 3 frases y 350 caracteres; una sola llamada a la acción; " +
    "usa {nombre} para dirigirte al cliente por su nombre (una sola vez); " +
    "usa {link} como el único enlace y NO escribas ningún otro enlace ni URL; " +
    "no inventes precios, porcentajes, fechas ni promociones que no estén en la instrucción; " +
    "no prometas nada que no se te haya dicho; " +
    "responde solo con el mensaje, sin explicaciones, sin comillas y sin encabezados."

  const userLines = [`Instrucción: ${cleanBrief}`]
  if (offer?.trim()) userLines.push(`Oferta autorizada: ${offer.trim()}`)
  if (audienceLabel?.trim()) userLines.push(`Va dirigido a: ${audienceLabel.trim()}`)

  let result: Awaited<ReturnType<typeof chatCompletionRaw>>
  try {
    result = await chatCompletionRaw(
      system,
      userLines.join("\n"),
      { feature: "marketing_ia", maxTokens: 300, restaurantId },
      {}
    )
  } catch (err) {
    // `chatCompletionRaw` ya degrada solo; esto protege el contrato si
    // alguna vez deja de hacerlo.
    logger.warn("[Marketing IA] Falló la generación", {
      error: err instanceof Error ? err.message : String(err),
    })
    return { text: fallback(), source: "template", model: null, tokensUsed: null }
  }

  if (!result) {
    return { text: fallback(), source: "template", model: null, tokensUsed: null }
  }

  let body = clean(result.text)
  // Enlaces inventados fuera: el único enlace válido es `{link}`.
  body = body.replace(/https?:\/\/\S+/gi, "").replace(/[ \t]{2,}/g, " ").trim()

  const rejected =
    !body ||
    body.length > MAX_TEMPLATE_LENGTH ||
    introducesNewNumbers(allowedDigits, body)

  if (rejected) {
    logger.warn("[Marketing IA] Copy descartado", {
      reason: !body
        ? "empty"
        : body.length > MAX_TEMPLATE_LENGTH
          ? "too_long"
          : "new_numbers",
    })
    return {
      text: fallback(),
      source: "template",
      model: result.model,
      tokensUsed: result.tokensUsed,
    }
  }

  if (!body.includes("{link}")) body = `${body}\n\nPide aquí: {link}`

  return {
    text: body,
    source: "llm",
    model: result.model,
    tokensUsed: result.tokensUsed,
  }
}
