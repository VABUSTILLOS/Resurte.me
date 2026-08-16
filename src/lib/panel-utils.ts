/**
 * Shared pure helpers for the panel (POS) pages.
 * Kept dependency-free so they can be unit-tested.
 */

/** Current date as YYYY-MM-DD (local time). */
export function todayStr() {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${d.getFullYear()}-${m}-${day}`
}

/** Human label for a date: "Hoy", "Ayer", or "12 mar". */
export function dateLabel(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00")
  const today = new Date()
  const yesterday = new Date(today.getTime() - 86400000)
  const same = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  if (same(d, today)) return "Hoy"
  if (same(d, yesterday)) return "Ayer"
  const meses = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]
  return `${d.getDate()} ${meses[d.getMonth()]}`
}

/** Milliseconds elapsed since an ISO timestamp (or NaN if absent/invalid). */
export function entryTime(createdAt?: string | null): number {
  if (!createdAt) return NaN
  const ts = Date.parse(createdAt)
  return Number.isFinite(ts) ? ts : NaN
}

/** Parsea un string a número no negativo; `0` si es inválido o negativo. */
export function toNonNegativeNumber(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === "") return 0
  const parsed = typeof value === "number" ? value : parseFloat(value)
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0
}

/** Parsea a entero; `0` si es inválido. Equivale a `parseInt(x, 10) || 0`. */
export function toInt(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === "") return 0
  const parsed = typeof value === "number" ? value : parseInt(value, 10)
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0
}

/** True si la fecha (YYYY-MM-DD o ISO) cae en el mes actual (mismo mes que `new Date()`). */
export function isCurrentMonth(dateStr: string): boolean {
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return false
  return d.getMonth() === new Date().getMonth()
}

/** Stock bajo pero no agotado: `stock > 0 && stock <= minStock`. */
export function isLowStock(stock: number, minStock: number): boolean {
  return stock > 0 && stock <= minStock
}

/** Agotado: `stock === 0`. */
export function isOutOfStock(stock: number): boolean {
  return stock === 0
}
