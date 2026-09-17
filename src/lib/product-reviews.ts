import { DEFAULT_TIMEZONE, localDateParts, type LocalDateParts } from "@/lib/local-date"

/**
 * Reseñas de pedido proyectadas al catálogo (migración 00158).
 *
 * Contexto: `order_reviews` se escribe desde 00087 (automatización de
 * WhatsApp post_delivery_rating → /calificar) y su RLS declara lectura
 * pública "para social proof futuro en el catálogo". Ese social proof no
 * existía: la tabla era de escritura sin consumidor.
 *
 * Modelo real (y por qué este módulo existe): una reseña es de PEDIDO, no de
 * producto. `order_reviews.order_id` es UNIQUE. El puente hacia el catálogo
 * es `order_items`, y esa expansión la hace el RPC `product_review_feed` en la
 * base de datos. Aquí solo se indexa su resultado para que una página pueda
 * resolver un producto en O(1) sin una consulta por producto.
 *
 * Todo lo de este módulo es puro: sin Supabase, sin fechas implícitas, sin
 * `toISOString()` (ver local-date.contract.test.ts).
 */

/** Fila cruda devuelta por el RPC `product_review_feed`. */
export interface ProductReviewFeedRow {
  product_id: number
  review_count: number
  average_rating: number
  rating: number
  comment: string | null
  reviewed_at: string
}

/** Una reseña individual ya lista para pintar. */
export interface ProductReviewItem {
  rating: number
  comment: string | null
  reviewedAt: string
}

/** Agregado por producto: el total/promedio son de TODAS las reseñas; `recent` es una muestra. */
export interface ProductReviewStats {
  productId: number
  count: number
  average: number
  recent: ProductReviewItem[]
}

/** Cuántas reseñas recientes se muestran por producto. */
export const REVIEW_FEED_LIMIT_PER_PRODUCT = 5

export const MIN_RATING = 1
export const MAX_RATING = 5

/**
 * Aclaración obligatoria junto a cualquier promedio. La calificación mide el
 * PEDIDO COMPLETO (producto + entrega + atención), así que presentarla como
 * "calificación del producto" sería una promesa que los datos no sostienen.
 */
export const REVIEW_SCOPE_NOTE =
  "Calificación del pedido completo: incluye entrega y atención, no solo el producto."

/** Qué mide el promedio, para el `title`/`aria-label` de la insignia. */
export const REVIEW_BADGE_HELP =
  "Promedio de las calificaciones que los clientes dieron a pedidos que incluyeron este producto."

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

/**
 * PostgREST puede entregar columnas `int8`/`numeric` como número o como
 * cadena según la configuración. Se aceptan ambas y se rechaza lo demás.
 */
function toNumber(value: unknown): number | null {
  if (isFiniteNumber(value)) return value
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function clampRating(value: number): number {
  return Math.min(MAX_RATING, Math.max(MIN_RATING, value))
}

/**
 * Valida una fila del RPC. Devuelve null si no es utilizable, para que una
 * fila corrupta no ensucie un promedio ni rompa el render de la página.
 *
 * No se recortan comentarios aquí: el RPC ya los entrega tal cual los escribió
 * el cliente (la ruta POST los normaliza a 500 caracteres).
 */
export function normalizeFeedRow(raw: unknown): ProductReviewFeedRow | null {
  if (!raw || typeof raw !== "object") return null
  const row = raw as Record<string, unknown>

  const productId = toNumber(row.product_id)
  const count = toNumber(row.review_count)
  const average = toNumber(row.average_rating)
  const rating = toNumber(row.rating)

  if (productId === null) return null
  if (count === null || count < 1) return null
  if (average === null || average < MIN_RATING || average > MAX_RATING) return null
  if (rating === null || rating < MIN_RATING || rating > MAX_RATING) return null

  const comment = row.comment
  const reviewedAt = row.reviewed_at
  if (typeof reviewedAt !== "string" || reviewedAt.length === 0) return null

  return {
    product_id: productId,
    review_count: Math.trunc(count),
    average_rating: average,
    rating: Math.trunc(rating),
    comment: typeof comment === "string" ? comment : null,
    reviewed_at: reviewedAt,
  }
}

/**
 * Indexa las filas del RPC por producto. Las filas vienen ordenadas por el RPC
 * (más reciente primero), así que `recent` respeta ese orden y no se reordena:
 * reordenar aquí duplicaría la regla de desempate que ya vive en SQL.
 *
 * Si un producto aparece con distintos `review_count`/`average_rating` entre
 * filas (no debería: son window functions sobre la misma partición), gana el
 * primero y se ignora el resto, para que el resultado sea determinista.
 */
export function buildProductReviewIndex(
  rawRows: readonly unknown[]
): Map<number, ProductReviewStats> {
  const index = new Map<number, ProductReviewStats>()

  for (const raw of rawRows) {
    const row = normalizeFeedRow(raw)
    if (!row) continue

    const existing = index.get(row.product_id)
    if (existing) {
      existing.recent.push({
        rating: row.rating,
        comment: row.comment,
        reviewedAt: row.reviewed_at,
      })
      continue
    }

    index.set(row.product_id, {
      productId: row.product_id,
      count: row.review_count,
      average: row.average_rating,
      recent: [
        {
          rating: row.rating,
          comment: row.comment,
          reviewedAt: row.reviewed_at,
        },
      ],
    })
  }

  return index
}

/** Reseñas de un producto, o undefined si no tiene ninguna. */
export function reviewStatsFor(
  index: ReadonlyMap<number, ProductReviewStats>,
  productId: number
): ProductReviewStats | undefined {
  return index.get(productId)
}

/** "4.5" / "5.0". Siempre un decimal: "5" y "5.0" se leen distinto. */
export function formatRatingAverage(average: number): string {
  // Sin recorte por abajo: devolver "1.0" ante un dato corrupto sería afirmar
  // una calificación que nadie dio. El rango real lo garantiza el CHECK de
  // `order_reviews.rating` (1..5).
  if (!isFiniteNumber(average) || average < 0) return "0.0"
  return Math.min(MAX_RATING, average).toFixed(1)
}

/** "★★★★☆" — relleno por redondeo al entero más cercano. */
export function ratingStars(average: number): string {
  const filled = isFiniteNumber(average)
    ? Math.min(MAX_RATING, Math.max(0, Math.round(average)))
    : 0
  return "★".repeat(filled) + "☆".repeat(MAX_RATING - filled)
}

/** "3 reseñas" / "1 reseña" / "Sin reseñas". */
export function reviewCountLabel(count: number): string {
  if (!isFiniteNumber(count) || count <= 0) return "Sin reseñas"
  return count === 1 ? "1 reseña" : `${Math.trunc(count)} reseñas`
}

/** "4.5 · 3 reseñas" — la etiqueta corta de la insignia. */
export function reviewSummaryLabel(count: number, average: number): string {
  if (!isFiniteNumber(count) || count <= 0) return "Sin reseñas"
  return `${formatRatingAverage(average)} · ${reviewCountLabel(count)}`
}

/**
 * El texto que acompaña a un comentario: "5 estrellas · 12 mar 2026".
 * `dayLabel` lo calcula el llamador con `dayKeyOf` (autoridad única de fecha
 * local) para que este módulo siga siendo puro.
 */
const MONTHS_ES = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
] as const

/**
 * Día legible a partir de las partes locales. Devuelve "" si faltan datos, para
 * que quien componga el texto no deje un separador colgando.
 */
export function formatReviewDay(parts: LocalDateParts): string {
  const month = MONTHS_ES[parts.month - 1]
  if (!month || !Number.isFinite(parts.day) || !Number.isFinite(parts.year)) return ""
  if (parts.day < 1 || parts.year < 1) return ""
  return `${parts.day} ${month} ${parts.year}`
}

/**
 * Fecha de una reseña en el día local del negocio (no en UTC: una reseña de las
 * 20:00 en México es del mismo día, no del siguiente).
 *
 * `""` cuando la fecha es inválida.
 */
export function reviewDayLabel(reviewedAt: string): string {
  const date = new Date(reviewedAt)
  if (Number.isNaN(date.getTime())) return ""
  return formatReviewDay(localDateParts(DEFAULT_TIMEZONE, date))
}

export function reviewItemLabel(rating: number, dayLabel: string): string {
  const safe = isFiniteNumber(rating) ? clampRating(Math.trunc(rating)) : MIN_RATING
  const stars = safe === 1 ? "estrella" : "estrellas"
  return dayLabel ? `${safe} ${stars} · ${dayLabel}` : `${safe} ${stars}`
}
