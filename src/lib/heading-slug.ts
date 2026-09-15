// ============================================================
// ANCLAS DE ENCABEZADOS — un solo slug para HTML y para schema
// ============================================================
// Los motores de respuesta citan fragmentos, no páginas completas. Si cada
// H2/H3 tiene un `id` estable, la IA puede citar
// `…/blog/mi-post#cuanto-cuesta` en vez de la URL pelada.
//
// El slug se calcula aquí una sola vez y lo consumen DOS lugares que deben
// coincidir siempre:
//   1. `rehypeHeadingAnchors` (src/lib/rehype-heading-anchors.ts) → id en el HTML.
//   2. `extractHeadings` (abajo) → URLs de los `HowToStep` del JSON-LD.
// Si se calcularan por separado, el schema apuntaría a anclas inexistentes.

/** Convierte el texto de un encabezado en un slug estable y URL-safe. */
export function slugifyHeading(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // quita acentos: "cuánto" → "cuanto"
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "")
}

export interface ExtractedHeading {
  text: string
  /** `id` que tendrá el encabezado en el HTML. */
  id: string
  level: 2 | 3 | 4
}

/**
 * Extrae los encabezados de un markdown con los MISMOS ids que genera
 * `rehypeHeadingAnchors`. Ignora lo que esté dentro de bloques de código y
 * resuelve duplicados con el sufijo `-1`, `-2`… en el orden de aparición.
 */
export function extractHeadings(markdown: string): ExtractedHeading[] {
  const headings: ExtractedHeading[] = []
  const seen = new Map<string, number>()
  let insideFence = false

  for (const line of markdown.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) {
      insideFence = !insideFence
      continue
    }
    if (insideFence) continue

    const match = /^(#{2,4})\s+(.+?)\s*#*\s*$/.exec(line)
    if (!match) continue

    const [, hashes, rawText] = match
    if (!hashes || !rawText) continue

    // Limpia markdown inline del texto del encabezado: **negrita**, `code`, [links](url)
    const text = rawText
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/[*_`]/g, "")
      .trim()
    const base = slugifyHeading(text)
    if (!base) continue

    const count = seen.get(base) ?? 0
    seen.set(base, count + 1)

    headings.push({
      text,
      id: count === 0 ? base : `${base}-${count}`,
      level: hashes.length as 2 | 3 | 4,
    })
  }

  return headings
}
