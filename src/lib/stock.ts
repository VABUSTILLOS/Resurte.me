/**
 * Estado de stock (migración 00108).
 *
 * `stock_status` sigue siendo la columna que lee la tienda (badges, carrito,
 * JSON-LD), pero se deriva de `stock_quantity` contra un umbral por producto
 * (`low_stock_threshold`, por defecto 5). Antes el 5 estaba escrito a mano en
 * tres sitios (panel, API de update, API de create); ahora la fuente única es
 * `deriveStockStatus`.
 *
 * `stock_quantity = null` significa "sin control de inventario" y se mantiene
 * como `in_stock` para no marcar como agotados los productos que no se
 * cuentan pieza por pieza.
 */

export type StockStatus = "in_stock" | "low_stock" | "out_of_stock"

const STOCK_STATUSES: readonly StockStatus[] = [
  "in_stock",
  "low_stock",
  "out_of_stock",
]

export const DEFAULT_LOW_STOCK_THRESHOLD = 5

export function isStockStatus(value: unknown): value is StockStatus {
  return typeof value === "string" && (STOCK_STATUSES as readonly string[]).includes(value)
}

/** Umbral efectivo: entero ≥ 0 válido o el valor por defecto. */
export function resolveLowStockThreshold(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : DEFAULT_LOW_STOCK_THRESHOLD
}

export function deriveStockStatus(
  quantity: number | null | undefined,
  threshold?: number | null
): StockStatus {
  if (quantity === null || quantity === undefined) return "in_stock"
  if (quantity <= 0) return "out_of_stock"
  return quantity <= resolveLowStockThreshold(threshold) ? "low_stock" : "in_stock"
}

/**
 * Estado que se guardará y si lo impuso la derivación (ronda 11).
 *
 * Con unidades capturadas el estado se deriva del umbral y la selección manual
 * no aplica; sin unidades manda la selección. Antes esta regla vivía solo en el
 * `submitForm` del formulario, así que el select seguía habilitado y el admin
 * podía elegir "Agotado" con 50 unidades: se guardaba "En stock" sin avisar. El
 * formulario usa `derived` para bloquear el select y mostrar el valor real.
 */
export function resolveSubmittedStockStatus(
  quantity: number | null,
  threshold: number | null,
  manual: StockStatus
): { status: StockStatus; derived: boolean } {
  // Unidades inválidas (texto a medio escribir, decimales, negativos) no
  // cuentan como control de inventario: el formulario ya las marca en rojo.
  if (quantity === null || !Number.isInteger(quantity) || quantity < 0) {
    return { status: manual, derived: false }
  }
  return { status: deriveStockStatus(quantity, threshold), derived: true }
}
