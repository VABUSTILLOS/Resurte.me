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
