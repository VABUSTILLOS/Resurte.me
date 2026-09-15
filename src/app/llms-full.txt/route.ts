import { PRIMARY_AUTHOR, SITE_URL } from "@/lib/author"
import {
  getAllPosts,
  getPostBySlug,
  getPostUrl,
  type BlogPostMeta,
} from "@/lib/blog"
import { getCategory, getContentType } from "@/lib/blog-categories"
import { MEXICO_CITIES } from "@/lib/cities"
import { DELIVERY_FEE_FLAT } from "@/lib/checkout-config"
import {
  CREDIT_DAYS_PROSE,
  FREE_SHIPPING_MXN,
  INVOICING,
  MIN_ORDER_MXN,
  formatMxn,
} from "@/lib/commercial-facts"

// ============================================================
// /llms-full.txt — corpus markdown completo para LLM y agentes
// ============================================================
// Complemento de /llms.txt: en vez de un mapa de enlaces, entrega el texto
// íntegro de cada guía (título, metadatos, FAQ y cuerpo markdown) para que un
// agente pueda responder y citar sin rastrear 200+ páginas.
//
// El cuerpo sale de getPostBySlug(slug).content, que ya devuelve el markdown
// crudo del MDX (frontmatter incluido el parseo de gray-matter, sin compilar).
// Algunos posts usan componentes JSX (<BlogCallout ...>) dentro del cuerpo:
// se emiten tal cual en vez de reescribir el contenido, para no perder texto.
//
// CRÍTICO: este handler NO llama cookies() ni headers() — eso lo volvería SSR
// por request y quemaría presupuesto de Fluid CPU en Vercel. `force-static`
// lo genera una sola vez en build.

export const dynamic = "force-static"

const BASE_URL = "https://resurte.me"

const CACHE_CONTROL =
  "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800"

/**
 * Presupuesto de bytes para el bloque de documentos (cabecera, índices y
 * ciudades son overhead acotado y no cuentan aquí).
 *
 * El corpus completo ronda los 4.4 MB de markdown, que ya está por encima del
 * presupuesto cómodo de una sola respuesta para la mayoría de los agentes.
 * Con MAX_BYTES = 4_000_000 se incluyen los posts más recientes —el corpus
 * viene ordenado de más nuevo a más viejo— y se corta SIEMPRE en un límite de
 * post completo, nunca a mitad de uno. El resto sigue disponible vía
 * /sitemap.xml, /rss.xml y /llms.txt.
 */
const MAX_BYTES = 4_000_000

const encoder = new TextEncoder()

function byteLength(value: string): number {
  return encoder.encode(value).length
}

function megabytes(bytes: number): string {
  return `${(bytes / 1_000_000).toFixed(1)} MB`
}

/** URL de la entidad que firma el post. */
function authorUrl(meta: BlogPostMeta): string {
  return meta.authorSlug ? `${SITE_URL}/autor/${meta.authorSlug}` : PRIMARY_AUTHOR.url
}

function buildCoverageLine(): string {
  const cities = MEXICO_CITIES.map((c) => `${c.name} (${c.state})`).join(", ")
  return `- Cobertura de entrega: ${MEXICO_CITIES.length} ciudades — ${cities}`
}

function buildHeader(
  totalPosts: number,
  includedPosts: number,
  truncated: boolean,
  usedBytes: number
): string {
  const generatedAt = new Date().toISOString()
  // El presupuesto aplica a los cuerpos de los documentos (sin cabecera ni índices).
  const truncation = truncated
    ? `\n- Truncado: sí — ${includedPosts} de ${totalPosts} documentos, los más recientes primero. Presupuesto de cuerpos: ${MAX_BYTES.toLocaleString("en-US")} bytes, usados ${usedBytes.toLocaleString("en-US")} (${megabytes(usedBytes)}, ${Math.round((usedBytes / MAX_BYTES) * 100)}%). El resto del blog está listado en ${BASE_URL}/sitemap.xml y ${BASE_URL}/rss.xml.`
    : `\n- Truncado: no — ${totalPosts} documentos publicados. Presupuesto de cuerpos: ${MAX_BYTES.toLocaleString("en-US")} bytes, usados ${usedBytes.toLocaleString("en-US")} (${megabytes(usedBytes)}).`

  return `# Resurte.me — Corpus completo para modelos de lenguaje

> Central de abastos digital para restaurantes, fondas y negocios de comida en México. Venta por mayoreo de abarrotes, frutas, verduras, carnes, lácteos, bebidas, desechables y más, con entrega a domicilio. Sin membresía. Pedido mínimo ${formatMxn(MIN_ORDER_MXN)}. Envío gratis desde ${formatMxn(FREE_SHIPPING_MXN)}. Facturación ${INVOICING} automática. Crédito a ${CREDIT_DAYS_PROSE} días para clientes frecuentes.

## Entidad y cobertura

- Entidad: Resurte.me — ${BASE_URL}
- Qué es: marketplace B2B de proveeduría para la industria restaurantera mexicana, con catálogo por ciudad y suite gratuita de gestión ("Mi Restaurante"): costeo de menú, control de mermas, inventario, planificador de pedidos y analítica.
- Autor de todo el contenido editorial: ${PRIMARY_AUTHOR.name} — ${PRIMARY_AUTHOR.jobTitle} (${PRIMARY_AUTHOR.url})
- Blog: ${totalPosts} documentos publicados
- Documentos incluidos en este archivo: ${includedPosts}${truncation}
${buildCoverageLine()}
- Envío: gratis desde ${formatMxn(FREE_SHIPPING_MXN)} de compra; por debajo de ese monto la tarifa de entrega es de ${formatMxn(DELIVERY_FEE_FLAT)}
- Generado: ${generatedAt}
- Mapa del sitio para agentes: ${BASE_URL}/llms.txt

## Metodología

Este archivo se genera automáticamente en el build del sitio a partir de la misma fuente de verdad que el blog en vivo: cada documento lleva su título, URL canónica, fecha de publicación, fecha de última actualización, autoría, categoría y descripción, seguidos del cuerpo markdown completo del artículo.

- El contenido es la versión íntegra del post, no un resumen: se puede citar textualmente indicando la URL canónica del documento.
- Las fechas son de publicación y de última revisión editorial; el campo \`Publicado\` es la fecha original y \`Actualizado\` aparece solo cuando el artículo se revisó después.
- Los datos de precio, merma y costo citados en las guías provienen del trabajo de compra de Resurte.me y de fuentes públicas del sector restaurantero mexicano; cada guía indica su propio alcance.
- El cuerpo conserva los marcadores JSX de los componentes de aviso del blog (\`<BlogCallout variant="tip" title="...">\`); el texto dentro de ellos es contenido normal del artículo.
- Los precios de insumos por ciudad se publican además como datos estructurados en ${BASE_URL}/api/feed/precios.json y el catálogo público en ${BASE_URL}/api/feed/catalogo.json.`
}

function buildCityIndex(): string {
  const items = MEXICO_CITIES.map(
    (city) => `- ${city.name} (${city.state}) — ${BASE_URL}/${city.slug}`
  )
  return `## Índice de ciudades

${items.join("\n")}`
}

function buildDocumentIndex(metas: BlogPostMeta[]): string {
  if (metas.length === 0) return ""
  const items = metas.map(
    (meta) => `- [${meta.title}](${getPostUrl(meta.slug)}) — ${meta.date}`
  )
  return `## Índice de documentos

${items.join("\n")}`
}

function buildDocument(meta: BlogPostMeta, body: string): string {
  const category = getCategory(meta.category)
  const contentType = getContentType(meta.contentType)
  const faq = meta.faq ?? []

  const lines: string[] = [
    `## ${meta.title}`,
    "",
    `- URL: ${getPostUrl(meta.slug)}`,
    `- Publicado: ${meta.date}${meta.updatedAt && meta.updatedAt !== meta.date ? ` · Actualizado: ${meta.updatedAt}` : ""}`,
    `- Autor: ${meta.author}${meta.authorRole ? ` — ${meta.authorRole}` : ""} (${authorUrl(meta)})`,
    `- Categoría: ${category.label} (${meta.category})`,
  ]

  if (contentType) lines.push(`- Tipo de contenido: ${contentType.label} (${contentType.slug})`)
  if (meta.description) lines.push(`- Descripción: ${meta.description}`)
  if (meta.tags.length > 0) lines.push(`- Temas: ${meta.tags.join(", ")}`)

  if (faq.length > 0) {
    lines.push("", "### Preguntas frecuentes")
    for (const item of faq) {
      lines.push("", `**${item.question}**`, "", item.answer)
    }
  }

  lines.push("", "### Contenido", "", body.trim())
  return lines.join("\n")
}

export async function GET() {
  let posts: BlogPostMeta[] = []
  try {
    posts = getAllPosts()
  } catch {
    // Sin acceso al filesystem el corpus se degrada a la cabecera + ciudades.
  }

  const documents: string[] = []
  const includedMetas: BlogPostMeta[] = []
  let used = 0
  let truncated = false

  for (const meta of posts) {
    let body = ""
    try {
      body = getPostBySlug(meta.slug)?.content ?? ""
    } catch {
      body = ""
    }

    const block = buildDocument(meta, body)
    const size = byteLength(block)

    // Corte determinista: se descarta el post completo si no cabe. El primer
    // post se incluye siempre, aunque exceda el presupuesto, para no entregar
    // un corpus vacío.
    if (used + size > MAX_BYTES && includedMetas.length > 0) {
      truncated = true
      break
    }

    documents.push(block)
    includedMetas.push(meta)
    used += size
  }

  const header = buildHeader(posts.length, includedMetas.length, truncated, used)
  const sections = [
    header,
    buildCityIndex(),
    buildDocumentIndex(includedMetas),
    documents.join("\n\n---\n\n"),
  ].filter((section) => section.trim().length > 0)

  const body = `${sections.join("\n\n")}\n`

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": CACHE_CONTROL,
      "X-Corpus-Bytes": String(byteLength(body)),
      "X-Corpus-Documents": String(includedMetas.length),
      "X-Corpus-Max-Bytes": String(MAX_BYTES),
    },
  })
}
