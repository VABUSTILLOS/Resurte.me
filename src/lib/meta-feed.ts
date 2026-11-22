// ============================================================
// Feed permanente del catálogo para Meta (/api/feed/meta.csv)
// ============================================================
// Genera el CSV que alimenta el catálogo "Resurte.me" en Meta
// (WhatsApp Business). Es la versión viva del archivo temporal
// que se subió el 2026-11-20: lee de la MISMA capa cacheada que
// usan las páginas del sitio, así que precios, visibilidad e
// imágenes nunca se desincronizan del sitio y el feed deja de
// depender de un enlace temporal que vence el 2026-11-22.
//
// Reglas que deben mantenerse:
// - id, título y descripción estables por producto: vienen de
//   `meta-feed-map.json`, copiados tal cual del feed temporal del
//   2026-11-20 (268 filas). NO se derivan del nombre actual: los
//   nombres cambian (p. ej. "Ala 1-2 IQF Pilgrim's" pasó a
//   "Ala 1-2 IQF Pilgrim's (caja 12 kg)") y si el id cambiara,
//   Meta crearía productos nuevos en vez de actualizar los que
//   ya se ven en WhatsApp. Verificado: 150 ids coinciden con el
//   slug del producto y 118 con el nombre viejo, ninguno con el
//   nombre actual en todos los casos.
// - Producto nuevo (sin entrada en el mapa): id =
//   slugify(nombre de categoría) + "-" + slug del producto, y
//   título = nombre actual. El slug es estable frente a cambios
//   de nombre, así que el id no se mueve después.
// - image_link SIEMPRE directo (https://resurte.me/images/... o
//   URL absoluta de almacenamiento). Nunca la URL del optimizador
//   _next/image: Meta no la puede descargar (HTTP 400) y WhatsApp
//   no muestra productos sin imagen. Si llegara una URL _next, se
//   desenvuelve a la ruta original.
// - price = precio efectivo (sale_price dentro de su ventana, o
//   price). getProducts() ya resuelve la ventana (00107), así que
//   sale_price ?? price es lo que paga el cliente.
// - Solo productos visibles: los 7 sin página (aguacate hass,
//   chile chilaca, chile poblano, naranja valencia, papaya
//   maradol, sandía, tomate verde) no entran; en WhatsApp ya son
//   invisibles hoy por la misma razón (imagen rota en el feed
//   temporal), así que no se pierde nada visible.
// - description nunca lleva costo ni SKU del proveedor (00020).
// - google_product_category y custom_label_0 llevan la categoría de
//   la tienda (nombre y slug): son los campos con los que Meta arma
//   los conjuntos/colecciones del catálogo por categoría, para que
//   WhatsApp agrupe igual que la tienda en línea. Se agregan al
//   final para no mover ninguna columna existente.
//
// Sin cookies() ni headers() — solo lecturas cacheadas (catálogo).

import { slugify } from "@/lib/foodos"
import metaFeedMap from "@/lib/meta-feed-map.json"
import type { Category, Product } from "@/types"

const BASE_URL = "https://resurte.me"
const CIRCLE_ORIGIN = "{latitude: 28.63581, longitude: -106.07645}"
const CIRCLE_RADIUS_KM = 20

export const META_FEED_COLUMNS = [
  "id",
  "title",
  "description",
  "link",
  "image_link",
  "brand",
  "price",
  "availability",
  "condition",
  "availability_circle_origin",
  "availability_circle_radius",
  "availability_circle_radius_unit",
  "google_product_category",
  "custom_label_0",
] as const

interface MetaFeedMapEntry {
  slug: string
  id: string
  title: string
  description: string
}

const MAP_BY_SLUG = new Map<string, MetaFeedMapEntry>(
  (metaFeedMap as MetaFeedMapEntry[]).map((entry) => [entry.slug, entry]),
)

/** Entrada fija del mapa para un slug, si existe. */
export function metaFeedMapEntry(slug: string): MetaFeedMapEntry | undefined {
  return MAP_BY_SLUG.get(slug)
}

/**
 * id para un producto nuevo (sin entrada en el mapa): prefijo de
 * categoría + slug del producto. Estable frente a cambios de nombre.
 */
export function metaFeedIdForNew(categoryName: string, productSlug: string): string {
  return `${slugify(categoryName)}-${productSlug}`
}

/** URL de imagen directa, apta para que Meta la descargue. */
export function toAbsoluteImageUrl(imageUrl: string | null | undefined): string | null {
  if (!imageUrl) return null
  const raw = imageUrl.trim()
  if (raw.length === 0) return null
  // Defensa: si alguna vez llega una URL del optimizador _next/image,
  // desenvolverla a la ruta original en vez de publicarla rota.
  const nextMatch = raw.match(/\/_next\/image\?url=([^&]+)/)
  const unwrapped = nextMatch?.[1] ? decodeURIComponent(nextMatch[1]) : raw
  if (/^https?:\/\//.test(unwrapped)) return unwrapped
  return `${BASE_URL}${unwrapped.startsWith("/") ? "" : "/"}${unwrapped}`
}

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

function capitalizePresentation(unit: string | null | undefined, fallback: string): string {
  const text = (unit ?? "").trim()
  if (text.length > 0) return text.charAt(0).toUpperCase() + text.slice(1)
  return fallback.replace(/[\n\r]+/g, " ").trim().slice(0, 500)
}

export interface MetaFeedResult {
  csv: string
  included: number
  mapped: number
  unmapped: number
  skippedNoImage: number
  skippedNoCategory: number
}

export function buildMetaFeedCsv(products: Product[], categories: Category[]): MetaFeedResult {
  const categoryById = new Map(categories.map((c) => [c.id, c.name]))
  const categorySlugById = new Map(categories.map((c) => [c.id, c.slug]))
  const rows: string[] = [META_FEED_COLUMNS.join(",")]
  let included = 0
  let mapped = 0
  let unmapped = 0
  let skippedNoImage = 0
  let skippedNoCategory = 0

  for (const product of products) {
    const categoryName = categoryById.get(product.category_id)
    if (!categoryName) {
      skippedNoCategory += 1
      continue
    }
    const imageLink = toAbsoluteImageUrl(product.image_url)
    if (!imageLink) {
      skippedNoImage += 1
      continue
    }
    const entry = MAP_BY_SLUG.get(product.slug)
    const id = entry?.id ?? metaFeedIdForNew(categoryName, product.slug)
    const title = entry?.title ?? product.name
    const description =
      entry?.description ?? capitalizePresentation(product.unit, product.description)
    if (entry) mapped += 1
    else unmapped += 1
    const effectivePrice = product.sale_price ?? product.price
    const fields = [
      id,
      title,
      description,
      `${BASE_URL}/chihuahua/producto/${product.slug}`,
      imageLink,
      "Resurte.me",
      `${effectivePrice.toFixed(2)} MXN`,
      product.stock_status === "out_of_stock" ? "out of stock" : "in stock",
      "new",
      CIRCLE_ORIGIN,
      String(CIRCLE_RADIUS_KM),
      "km",
      categoryName,
      categorySlugById.get(product.category_id) ?? slugify(categoryName),
    ]
    rows.push(fields.map(csvEscape).join(","))
    included += 1
  }

  return { csv: `${rows.join("\n")}\n`, included, mapped, unmapped, skippedNoImage, skippedNoCategory }
}
