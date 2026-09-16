/**
 * Fase 12 — lógica pura de sugerencias de reabasto.
 * Combina la velocidad de venta de los últimos 30 días con el estado de
 * stock actual para priorizar qué reabastecer primero.
 *
 * Ronda 7 (00108): el estado se recalcula contra el umbral por producto
 * (`low_stock_threshold`) en vez de confiar solo en `stock_status`, y la
 * sugerencia incluye la cantidad a pedir para cubrir la demanda del
 * horizonte de cobertura.
 */

import { deriveStockStatus, resolveLowStockThreshold, type StockStatus } from "./stock"

export interface RestockCandidate {
  productId: number
  name: string
  stockStatus: StockStatus
  /** Piezas vendidas en los últimos 30 días */
  units30d: number
  /** Existencia actual; `null` = sin control de inventario. */
  stockQuantity?: number | null
  /** Umbral de stock bajo del producto (00108). */
  lowStockThreshold?: number | null
}

export interface RestockSuggestion extends RestockCandidate {
  /** Puntos de prioridad: mayor = más urgente */
  priority: number
  reason: string
  /** Umbral efectivo usado para clasificar el estado. */
  threshold: number
  /** Piezas sugeridas para cubrir el horizonte de cobertura. */
  suggestedQuantity: number
  /** Estado recalculado contra el umbral (fuente de verdad del panel). */
  effectiveStatus: StockStatus
}

const STATUS_WEIGHT: Record<StockStatus, number> = {
  out_of_stock: 100,
  low_stock: 50,
  in_stock: 0,
}

/** Horizonte de cobertura de la sugerencia, en días. */
const RESTOCK_COVERAGE_DAYS = 14

/**
 * Piezas a pedir para cubrir `coverageDays` de demanda al ritmo de los
 * últimos 30 días, descontando la existencia actual. Nunca negativo.
 */
export function suggestRestockQuantity(
  units30d: number,
  stockQuantity: number | null | undefined,
  coverageDays = RESTOCK_COVERAGE_DAYS
): number {
  const dailyRate = Math.max(0, units30d) / 30
  const target = Math.ceil(dailyRate * Math.max(1, coverageDays))
  return Math.max(0, target - (stockQuantity ?? 0))
}

/**
 * Prioridad = peso del estado + piezas vendidas en 30 d.
 * Un agotado con ventas altas encabeza la lista; un in_stock nunca se
 * sugiere (peso 0 y no aplica reabasto).
 */
function restockPriority(stockStatus: StockStatus, units30d: number): number {
  return STATUS_WEIGHT[stockStatus] + Math.max(0, units30d)
}

function reason(stockStatus: StockStatus, units30d: number, suggestedQuantity: number): string {
  const ventas = `${units30d} vendidas en 30 d`
  const pedir = suggestedQuantity > 0 ? ` · pedir ${suggestedQuantity}` : ""
  if (stockStatus === "out_of_stock") return `Agotado · ${ventas}${pedir}`
  if (stockStatus === "low_stock") return `Stock bajo · ${ventas}${pedir}`
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
    .map((c) => {
      const threshold = resolveLowStockThreshold(c.lowStockThreshold)
      // Con existencia conocida el umbral manda; sin ella se respeta el
      // estado guardado (productos sin control de inventario).
      const effectiveStatus =
        c.stockQuantity === null || c.stockQuantity === undefined
          ? c.stockStatus
          : deriveStockStatus(c.stockQuantity, threshold)
      return {
        ...c,
        threshold,
        effectiveStatus,
        suggestedQuantity: suggestRestockQuantity(c.units30d, c.stockQuantity),
      }
    })
    .filter((c) => c.effectiveStatus !== "in_stock" && c.units30d > 0)
    .map((c) => ({
      ...c,
      priority: restockPriority(c.effectiveStatus, c.units30d),
      reason: reason(c.effectiveStatus, c.units30d, c.suggestedQuantity),
    }))
    .sort((a, b) => b.priority - a.priority || a.name.localeCompare(b.name))
    .slice(0, limit)
}
