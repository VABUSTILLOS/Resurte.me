/**
 * Fase 12 — lógica pura de sugerencias de reabasto.
 * Combina la velocidad de venta de los últimos 30 días con el estado de
 * stock actual para priorizar qué reabastecer primero.
 */

type StockStatus = "in_stock" | "low_stock" | "out_of_stock"

export interface RestockCandidate {
  productId: number
  name: string
  stockStatus: StockStatus
  /** Piezas vendidas en los últimos 30 días */
  units30d: number
}

export interface RestockSuggestion extends RestockCandidate {
  /** Puntos de prioridad: mayor = más urgente */
  priority: number
  reason: string
}

const STATUS_WEIGHT: Record<StockStatus, number> = {
  out_of_stock: 100,
  low_stock: 50,
  in_stock: 0,
}

/**
 * Prioridad = peso del estado + piezas vendidas en 30 d.
 * Un agotado con ventas altas encabeza la lista; un in_stock nunca se
 * sugiere (peso 0 y no aplica reabasto).
 */
function restockPriority(stockStatus: StockStatus, units30d: number): number {
  return STATUS_WEIGHT[stockStatus] + Math.max(0, units30d)
}

function reason(stockStatus: StockStatus, units30d: number): string {
  const ventas = `${units30d} vendidas en 30 d`
  if (stockStatus === "out_of_stock") return `Agotado · ${ventas}`
  if (stockStatus === "low_stock") return `Stock bajo · ${ventas}`
  return ventas
}

/**
 * Genera sugerencias ordenadas por prioridad descendente. Solo incluye
 * productos con stock bajo o agotado Y al menos 1 venta en 30 d (sin
 * ventas no hay evidencia de demanda que justifique reabasto).
 */
export function buildRestockSuggestions(
  candidates: RestockCandidate[],
  limit = 10
): RestockSuggestion[] {
  return candidates
    .filter((c) => c.stockStatus !== "in_stock" && c.units30d > 0)
    .map((c) => ({ ...c, priority: restockPriority(c.stockStatus, c.units30d), reason: reason(c.stockStatus, c.units30d) }))
    .sort((a, b) => b.priority - a.priority || a.name.localeCompare(b.name))
    .slice(0, limit)
}
