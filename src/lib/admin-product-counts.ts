/**
 * Lectura del payload de `admin_product_filter_counts` (00118).
 *
 * La v2 del RPC devuelve, en una sola consulta, los 11 contadores de chips, la
 * lista de marcas y el recuento por etiqueta que antes resolvía el listado con
 * 11 consultas `count: "exact"` y dos descargas de 1000 filas. El orden final
 * de marcas y etiquetas se fija aquí (no en SQL) para conservar exactamente el
 * comportamiento anterior, que ordenaba con `localeCompare("es")`.
 *
 * Todo se sanea: un payload incompleto o con tipos raros devuelve `null` y el
 * llamador cae al camino antiguo, en vez de pintar chips en `NaN`.
 */

export interface ProductChipCounts {
  catalogTotal: number
  published: number
  unpublished: number
  noImage: number
  lowStock: number
  outStock: number
  noCities: number
  noPrice: number
  noCategory: number
  waMismatch: number
  onSale: number
  staleSale: number
  dupNames: number
  underThreshold: number
  trash: number
}

/** Conteos en cero: estado inicial del panel y valor por defecto al degradar. */
export const EMPTY_PRODUCT_CHIP_COUNTS: ProductChipCounts = {
  catalogTotal: 0,
  published: 0,
  unpublished: 0,
  noImage: 0,
  lowStock: 0,
  outStock: 0,
  noCities: 0,
  noPrice: 0,
  noCategory: 0,
  waMismatch: 0,
  onSale: 0,
  staleSale: 0,
  dupNames: 0,
  underThreshold: 0,
  trash: 0,
}

export interface ProductCountsPayload {
  counts: ProductChipCounts
  brands: string[]
  tags: string[]
  noCitiesIds: number[]
  dupNameIds: number[]
  underThresholdIds: number[]
  categoryCounts: Record<string, number>
}

/** Tope de etiquetas devueltas al panel (mismo que la versión en JS). */
export const PRODUCT_TAG_LIMIT = 50

function toCount(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return 0
  return Math.trunc(value)
}

/**
 * "Objeto plano" para el contrato del RPC. Un array cumple `typeof === "object"`
 * y `!value`, así que sin este guard un `tagCounts: []` (o `categoryCounts: []`)
 * pasaría la validación de la v2 y el panel pintaría cero etiquetas creyendo
 * que el RPC funcionó, en vez de caer al camino antiguo.
 */
function isPlainObject(value: unknown): boolean {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

function toIdList(value: unknown): number[] {
  if (!Array.isArray(value)) return []
  return value.filter((v): v is number => typeof v === "number" && Number.isInteger(v) && v > 0)
}

function toCategoryCounts(value: unknown): Record<string, number> {
  if (!isPlainObject(value)) return {}
  const out: Record<string, number> = {}
  for (const [key, count] of Object.entries(value as Record<string, unknown>)) {
    if (typeof count === "number" && Number.isFinite(count)) out[key] = count
  }
  return out
}

/** Marcas distintas no vacías, ordenadas igual que antes (`localeCompare("es")`). */
export function sortProductBrands(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return [
    ...new Set(
      value
        .map((b) => (typeof b === "string" ? b.trim() : ""))
        .filter((b) => b.length > 0)
    ),
  ].sort((a, b) => a.localeCompare(b, "es"))
}

/** Etiquetas más usadas (por frecuencia y, a igualdad, alfabéticas en `es`). */
export function rankProductTags(value: unknown, limit = PRODUCT_TAG_LIMIT): string[] {
  if (!isPlainObject(value)) return []
  const entries: [string, number][] = []
  for (const [rawTag, rawCount] of Object.entries(value as Record<string, unknown>)) {
    const tag = rawTag.trim().toLowerCase()
    if (!tag) continue
    const count = typeof rawCount === "number" && Number.isFinite(rawCount) ? rawCount : 0
    entries.push([tag, count])
  }
  return entries
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "es"))
    .slice(0, Math.max(0, limit))
    .map(([tag]) => tag)
}

/**
 * Payload completo del RPC v2, o `null` si la migración 00118 no está aplicada
 * (el listado detecta la ausencia por `brands`/`tagCounts`) o el JSON no tiene
 * la forma esperada.
 */
export function parseProductCountsPayload(payload: unknown): ProductCountsPayload | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null
  const raw = payload as Record<string, unknown>
  // Marcadores de la v2: sin ellos el listado debe usar el camino antiguo.
  if (!Array.isArray(raw.brands) || !isPlainObject(raw.tagCounts)) {
    return null
  }
  const noCitiesIds = toIdList(raw.noCitiesIds)
  const dupNameIds = toIdList(raw.dupNameIds)
  const underThresholdIds = toIdList(raw.underThresholdIds)
  const catalogTotal = toCount(raw.catalogTotal)
  const published = toCount(raw.published)
  return {
    counts: {
      catalogTotal,
      published,
      // Derivado, como en la versión en JS (una consulta menos).
      unpublished: Math.max(0, catalogTotal - published),
      noImage: toCount(raw.noImage),
      lowStock: toCount(raw.lowStock),
      outStock: toCount(raw.outStock),
      noCities: noCitiesIds.length,
      noPrice: toCount(raw.noPrice),
      noCategory: toCount(raw.noCategory),
      waMismatch: toCount(raw.waMismatch),
      onSale: toCount(raw.onSale),
      staleSale: toCount(raw.staleSale),
      dupNames: dupNameIds.length,
      underThreshold: underThresholdIds.length,
      trash: toCount(raw.trash),
    },
    brands: sortProductBrands(raw.brands),
    tags: rankProductTags(raw.tagCounts),
    noCitiesIds,
    dupNameIds,
    underThresholdIds,
    categoryCounts: toCategoryCounts(raw.categoryCounts),
  }
}
