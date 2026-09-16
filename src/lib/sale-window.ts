/**
 * Vigencia de la oferta (migración 00107): fuente única para decidir si un
 * `sale_price` aplica. La oferta es válida solo si `now` cae dentro de la
 * ventana `sale_starts_at` … `sale_ends_at`; los extremos son opcionales
 * (NULL = sin límite). Fuera de la ventana el precio de oferta se ignora en
 * la tienda, en el detalle, en los totales del checkout y en el panel.
 */

/**
 * Postgres 42703 / PostgREST: la columna no existe (migración pendiente).
 * Las columnas de la ventana son `sale_starts_at` y `sale_ends_at` (00107):
 * los selects explícitos deben incluirlas junto a `sale_price` y reintentar
 * sin ellas si esta función devuelve true.
 */
export function isMissingColumnError(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null
  return (
    e?.code === "42703" ||
    (typeof e?.message === "string" && e.message.includes("does not exist"))
  )
}

export interface SaleWindow {
  sale_price?: number | null
  sale_starts_at?: string | null
  sale_ends_at?: string | null
}

export type SaleState = "none" | "scheduled" | "active" | "expired"

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Estado de la oferta respecto de `now`. */
export function saleState(p: SaleWindow, now: Date = new Date()): SaleState {
  if (p.sale_price == null) return "none"
  const starts = parseDate(p.sale_starts_at)
  const ends = parseDate(p.sale_ends_at)
  if (starts && now.getTime() < starts.getTime()) return "scheduled"
  if (ends && now.getTime() > ends.getTime()) return "expired"
  return "active"
}

export function isSaleActive(p: SaleWindow, now: Date = new Date()): boolean {
  return saleState(p, now) === "active"
}

/** Precio de oferta si la ventana está vigente; null en cualquier otro caso. */
export function resolveSalePrice(
  p: SaleWindow,
  now: Date = new Date()
): number | null {
  return isSaleActive(p, now) ? (p.sale_price ?? null) : null
}

/** Precio que paga el cliente: oferta vigente si la hay, si no el de lista. */
export function resolveEffectivePrice(
  p: SaleWindow & { price?: number | null },
  now: Date = new Date()
): number | null {
  return resolveSalePrice(p, now) ?? p.price ?? null
}

/**
 * Copia del producto con `sale_price` puesto a null cuando la oferta no está
 * vigente: así todos los consumidores existentes (tarjetas, detalle, JSON-LD,
 * order bumps) respetan la ventana sin cambiar su lógica de render.
 */
export function withResolvedSale<T extends SaleWindow>(
  p: T,
  now: Date = new Date()
): T {
  if (p.sale_price == null || isSaleActive(p, now)) return p
  return { ...p, sale_price: null }
}

export function normalizeSale<T extends SaleWindow>(
  rows: T[] | null | undefined,
  now: Date = new Date()
): T[] {
  if (!rows?.length) return []
  return rows.map((row) => withResolvedSale(row, now))
}
