/**
 * Ronda 7 — SEO con IA en lote.
 *
 * Reutiliza el helper de IA de la ronda 6 (`chatCompletion` de `@/lib/ai/kie-ai`)
 * con el mismo prompt que el botón "Generar con IA" del formulario de producto,
 * pero procesando la selección en tandas para poder previsualizar y editar
 * antes de aplicar. Los helpers de este módulo son puros (sin red) para poder
 * testear el armado de prompts y el parseo de respuestas.
 */

export const SEO_TITLE_MAX = 60
export const SEO_DESCRIPTION_MAX = 160
/** Productos por petición: mantiene la respuesta corta y el coste acotado. */
export const SEO_BATCH_SIZE = 10
/** Tope duro de ids por llamada. */
export const SEO_MAX_IDS = 200

export const SEO_SYSTEM_PROMPT =
  'Eres especialista SEO de una tienda de abarrotes mexicana. Responde SOLO con JSON válido: {"title": "...", "description": "..."}. title máx 60 caracteres, description máx 160, orientados a búsqueda local, sin emojis.'

export interface SeoSource {
  id: number
  name: string
  brand?: string | null
  description?: string | null
  tags?: string[] | null
  categoryName?: string | null
}

export interface SeoProposal {
  id: number
  name: string
  seo_title: string
  seo_description: string
}

/** Texto del usuario con el contexto del producto. */
export function buildSeoUserPrompt(src: SeoSource): string {
  const parts: string[] = [`Producto: ${src.name.trim()}`]
  if (src.brand?.trim()) parts.push(`marca ${src.brand.trim()}`)
  if (src.categoryName?.trim()) parts.push(`categoría ${src.categoryName.trim()}`)
  if (src.tags && src.tags.length > 0) parts.push(`etiquetas ${src.tags.slice(0, 6).join(", ")}`)
  if (src.description?.trim()) parts.push(`Descripción: ${src.description.trim().slice(0, 200)}`)
  return parts.join(", ")
}

export function buildSeoMessages(src: SeoSource): { role: "system" | "user"; content: string }[] {
  return [
    { role: "system", content: SEO_SYSTEM_PROMPT },
    { role: "user", content: buildSeoUserPrompt(src) },
  ]
}

/** Limpia un texto propuesto: sin comillas envolventes ni espacios sobrantes. */
export function cleanSeoText(value: string, max: number): string {
  let out = value.replace(/\s+/g, " ").trim()
  if (out.length >= 2 && ((out.startsWith('"') && out.endsWith('"')) || (out.startsWith("'") && out.endsWith("'")))) {
    out = out.slice(1, -1).trim()
  }
  return out.slice(0, max)
}

/**
 * Extrae `{title, description}` de la respuesta del modelo. Tolera texto
 * alrededor del JSON (bloques markdown, preámbulos). Devuelve `null` si no hay
 * JSON válido o si falta algún campo utilizable.
 */
export function parseSeoProposal(content: string): { title: string; description: string } | null {
  if (!content) return null
  const match = content.match(/\{[\s\S]*\}/)
  if (!match) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(match[0])
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== "object") return null
  const raw = parsed as { title?: unknown; description?: unknown }
  const title = typeof raw.title === "string" ? cleanSeoText(raw.title, SEO_TITLE_MAX) : ""
  const description =
    typeof raw.description === "string" ? cleanSeoText(raw.description, SEO_DESCRIPTION_MAX) : ""
  if (!title && !description) return null
  return { title, description }
}

/** Un producto necesita SEO si le falta el título o la descripción. */
export function needsSeo(product: {
  seo_title?: string | null
  seo_description?: string | null
}): boolean {
  return !product.seo_title?.trim() || !product.seo_description?.trim()
}

/** Parte los ids en tandas del tamaño pedido. */
export function chunkIds(ids: number[], size: number = SEO_BATCH_SIZE): number[][] {
  if (size < 1) return ids.length > 0 ? [ids] : []
  const out: number[][] = []
  for (let i = 0; i < ids.length; i += size) out.push(ids.slice(i, i + size))
  return out
}

/** Resumen en español de lo aplicado / omitido / fallido. */
export function seoBatchSummary(counts: {
  applied: number
  skipped: number
  failed: number
}): string {
  const parts = [`${counts.applied} con SEO aplicado`]
  if (counts.skipped > 0) parts.push(`${counts.skipped} ya tenían SEO`)
  if (counts.failed > 0) parts.push(`${counts.failed} sin respuesta de la IA`)
  return parts.join(" · ")
}
