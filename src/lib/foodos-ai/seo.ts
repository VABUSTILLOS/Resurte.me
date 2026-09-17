/**
 * Sitio IA: redacción del contenido que se publica y se indexa.
 *
 * El dueño escribe poco y con prisa; el modelo convierte "tacos de canasta,
 * desde 2019, en el centro" en un párrafo que un cliente —y Google— entiende.
 *
 * Lo que el modelo NO puede hacer, igual que en el Mesero IA y en Marketing IA:
 *  - Inventar cifras. Ni precios, ni años de fundación, ni número de sucursales,
 *    ni calificaciones. Solo lo que el dueño ya declaró en el formulario.
 *  - Inventar enlaces o promesas ("envío gratis") que nadie autorizó.
 *  - Publicarse solo. El texto sale como borrador y el dueño lo aprueba.
 *
 * Nunca lanza: si no hay modelo, hay plantilla determinista.
 */

import { chatCompletionRaw, fallbackTemplates } from "@/lib/ai/llm"
import { logger } from "@/lib/logger"
import {
  fallbackAbout,
  truncate,
  type SeoBranchFacts,
  type SeoFaqItem,
} from "@/lib/foodos-seo"

/** Más que esto ya no se lee; la página vive de la primera frase. */
export const MAX_ABOUT_LENGTH = 1200
/** Una ficha de platillo es una línea, no un ensayo. */
export const MAX_DISH_LENGTH = 240

export type SeoSource = "llm" | "template"

export interface SeoAboutInput {
  restaurantName: string
  /** Notas del dueño en lenguaje natural: lo único que el modelo puede usar. */
  notes?: string | null
  keywords?: string[] | null
  city?: string | null
  restaurantId?: string | null
}

export interface SeoAboutOutput {
  text: string
  source: SeoSource
  model: string | null
  tokensUsed: number | null
}

export interface SeoDishInput {
  restaurantName: string
  dishName: string
  /** Descripción actual del platillo en el menú, si la hay. */
  notes?: string | null
  tags?: string[] | null
  restaurantId?: string | null
}

export interface SeoDishOutput {
  text: string
  source: SeoSource
  model: string | null
  tokensUsed: number | null
}

function digitsOf(text: string): Set<string> {
  return new Set(text.match(/\d+/g) ?? [])
}

function introducesNewNumbers(allowed: Set<string>, generated: string): boolean {
  for (const n of digitsOf(generated)) {
    if (!allowed.has(n)) return true
  }
  return false
}

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
  // Markdown de encabezado: el sitio renderiza párrafos, no documentos.
  return text
    .split("\n")
    .map((line) => line.replace(/^#{1,6}\s*/, "").replace(/^[-*]\s+/, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

/**
 * Genera el párrafo "Sobre nosotros".
 *
 * Devuelve siempre texto usable: si el modelo no está, si tarda o si inventa
 * una cifra, se responde con la plantilla determinista construida a partir de
 * los datos reales del restaurante.
 */
export async function generateAboutText(input: SeoAboutInput): Promise<SeoAboutOutput> {
  const { restaurantName, notes, keywords, city, restaurantId } = input

  const fallback = () =>
    fallbackTemplates.seo_about({
      about: fallbackAbout({ name: restaurantName, city, keywords }),
    })

  const cleanNotes = notes?.trim() ?? ""
  const system =
    `Eres el redactor del sitio web de ${restaurantName}, un restaurante en México. ` +
    "Escribes en español de México, en segunda persona del plural neutro, sin exagerar. " +
    "Reglas estrictas: entre 60 y 180 palabras; dos o tres párrafos cortos; " +
    "no inventes precios, fechas, años de fundación, número de sucursales, premios ni calificaciones; " +
    "no prometas envío gratis, descuentos ni promociones; " +
    "no escribas enlaces ni URLs; no uses listas, encabezados ni markdown; " +
    "responde solo con el texto, sin comillas ni explicaciones."

  const userLines = [`Restaurante: ${restaurantName}`]
  if (city?.trim()) userLines.push(`Ciudad: ${city.trim()}`)
  if (keywords?.length) userLines.push(`Lo que sirve: ${keywords.filter(Boolean).join(", ")}`)
  userLines.push(
    cleanNotes
      ? `Lo que dice el dueño: ${cleanNotes}`
      : "El dueño no dejó notas. Escribe solo con los datos de arriba, sin inventar detalles."
  )

  let result: Awaited<ReturnType<typeof chatCompletionRaw>>
  try {
    result = await chatCompletionRaw(
      system,
      userLines.join("\n"),
      { feature: "sitio_ia", maxTokens: 500, restaurantId },
      {}
    )
  } catch (err) {
    logger.warn("[Sitio IA] Falló la generación del 'sobre nosotros'", {
      error: err instanceof Error ? err.message : String(err),
    })
    return { text: fallback(), source: "template", model: null, tokensUsed: null }
  }

  if (!result) {
    return { text: fallback(), source: "template", model: null, tokensUsed: null }
  }

  let body = clean(result.text)
  // Enlaces fuera: el sitio no puede prometer destinos que no existen.
  body = body.replace(/https?:\/\/\S+/gi, "").replace(/[ \t]{2,}/g, " ").trim()

  const allowedDigits = digitsOf(
    [cleanNotes, (keywords ?? []).join(" "), restaurantName, city ?? ""].join(" ")
  )

  const rejected =
    body.length < 80 ||
    body.length > MAX_ABOUT_LENGTH ||
    introducesNewNumbers(allowedDigits, body)

  if (rejected) {
    logger.warn("[Sitio IA] Texto descartado", {
      reason:
        body.length < 80 ? "too_short" : body.length > MAX_ABOUT_LENGTH ? "too_long" : "new_numbers",
    })
    return {
      text: fallback(),
      source: "template",
      model: result.model,
      tokensUsed: result.tokensUsed,
    }
  }

  return {
    text: body,
    source: "llm",
    model: result.model,
    tokensUsed: result.tokensUsed,
  }
}

/**
 * Genera la ficha de un platillo.
 *
 * Nunca menciona precio: el precio vive en el menú y lo pone el restaurante.
 * Un precio repetido en la descripción se desincroniza al primer cambio.
 */
export async function generateDishCopy(input: SeoDishInput): Promise<SeoDishOutput> {
  const { restaurantName, dishName, notes, tags, restaurantId } = input

  const fallback = () =>
    fallbackTemplates.seo_dish({
      dish: dishName,
      restaurant: restaurantName,
      notes: notes?.trim() || (tags ?? []).filter(Boolean).join(", ") || "Preparado al momento.",
    })

  const system =
    `Eres el redactor del menú de ${restaurantName}, un restaurante en México. ` +
    "Escribes en español de México. " +
    "Reglas estrictas: una sola frase de máximo 25 palabras; " +
    "describe sabor, textura e ingredientes visibles, nunca el precio; " +
    "no inventes ingredientes que no se te hayan dicho; " +
    "no escribas enlaces, emojis, comillas ni punto y seguido extra; " +
    "responde solo con la frase."

  const userLines = [`Platillo: ${dishName}`]
  if (notes?.trim()) userLines.push(`Lo que dice el menú: ${notes.trim()}`)
  if (tags?.length) userLines.push(`Etiquetas: ${tags.filter(Boolean).join(", ")}`)

  let result: Awaited<ReturnType<typeof chatCompletionRaw>>
  try {
    result = await chatCompletionRaw(
      system,
      userLines.join("\n"),
      { feature: "sitio_ia", maxTokens: 120, restaurantId },
      {}
    )
  } catch (err) {
    logger.warn("[Sitio IA] Falló la ficha de platillo", {
      error: err instanceof Error ? err.message : String(err),
    })
    return { text: fallback(), source: "template", model: null, tokensUsed: null }
  }

  if (!result) {
    return { text: fallback(), source: "template", model: null, tokensUsed: null }
  }

  const body = clean(result.text).replace(/\s+/g, " ").trim()
  const allowedDigits = digitsOf([dishName, notes ?? "", (tags ?? []).join(" "), restaurantName].join(" "))

  // Una descripción de platillo no lleva cifras en absoluto: ni precio, ni
  // "2 personas", ni "3 salsas" que nadie pidió.
  const rejected =
    body.length < 12 ||
    body.length > MAX_DISH_LENGTH ||
    introducesNewNumbers(allowedDigits, body)

  if (rejected) {
    logger.warn("[Sitio IA] Ficha de platillo descartada", {
      reason: body.length < 12 ? "too_short" : body.length > MAX_DISH_LENGTH ? "too_long" : "new_numbers",
    })
    return {
      text: fallback(),
      source: "template",
      model: result.model,
      tokensUsed: result.tokensUsed,
    }
  }

  return {
    text: body,
    source: "llm",
    model: result.model,
    tokensUsed: result.tokensUsed,
  }
}

export interface SeoFaqInput {
  restaurantName: string
  branches: SeoBranchFacts[]
  city?: string | null
}

export interface SeoFaqOutput {
  items: SeoFaqItem[]
  source: SeoSource
}

/**
 * Preguntas frecuentes del restaurante.
 *
 * Aquí no participa el modelo a propósito: cada respuesta habla de envío,
 * recolección o forma de pago, y una alucinación sobre eso se convierte en un
 * cliente reclamando en el mostrador. Las respuestas salen de los datos que el
 * restaurante ya configuró, y `parseFaq` las normaliza al guardarlas.
 */
export function generateFaq(input: SeoFaqInput): SeoFaqOutput {
  const { restaurantName, branches, city } = input
  const resolvedCity = city?.trim() || branches.find((b) => b.city?.trim())?.city?.trim() || null
  const hasDelivery = branches.some((b) => b.delivery_active)
  const hasPickup = branches.some((b) => b.pickup_active)
  const hasDineIn = branches.some((b) => b.dine_in_active)

  const items: SeoFaqItem[] = []
  const where = resolvedCity ? ` en ${resolvedCity}` : ""

  if (hasDelivery) {
    items.push({
      q: `¿${restaurantName} hace envíos a domicilio?`,
      a: `Sí. Entregamos${where} y zonas cercanas. Al pedir en línea ves el costo de envío antes de confirmar.`,
    })
  }
  if (hasPickup) {
    items.push({
      q: "¿Puedo pasar a recoger mi pedido?",
      a: "Sí. Elige «para llevar» al hacer tu pedido y te avisamos en cuanto esté listo para recoger.",
    })
  }
  if (hasDineIn) {
    items.push({
      q: "¿Tienen servicio en el local?",
      a: "Sí, puedes comer en el restaurante. Si vienes en grupo, te recomendamos llegar temprano.",
    })
  }
  items.push({
    q: "¿Cómo puedo pagar?",
    a: "Puedes pagar en línea con tarjeta o en efectivo al recibir, según lo que tenga activado el restaurante al confirmar tu pedido.",
  })
  items.push({
    q: "¿Cómo sé cuándo estará listo mi pedido?",
    a: "Al confirmar te damos un enlace para seguir tu pedido en tiempo real y te avisamos por WhatsApp cuando salga o esté listo.",
  })

  return { items: items.map((item) => ({ q: item.q, a: truncate(item.a, 320) })), source: "template" }
}
