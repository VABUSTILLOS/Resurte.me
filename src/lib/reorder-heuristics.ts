// ============================================================
// HEURÍSTICAS DE RECOMPRA
// ============================================================
// Funciones puras compartidas por:
//  - El home post-login ("Se te están acabando").
//  - El cron diario (recordatorios de recompra y reactivación).
//
// Sin dependencias de Supabase/React para poder probarlas en unit tests.

export interface PurchasePoint {
  product_id: number
  /** ISO date de la orden que incluyó el producto. */
  purchased_at: string
}

export interface RunningOutProduct {
  product_id: number
  /** Días desde la última compra del producto. */
  daysSinceLast: number
  /** Intervalo promedio entre compras del producto (días). */
  avgIntervalDays: number
}

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Detecta productos que "se le están acabando" al cliente:
 * comprados al menos `minPurchases` veces y cuyo tiempo desde la última
 * compra ya alcanzó `triggerRatio` × su intervalo promedio de recompra.
 *
 * Retorna hasta `limit` productos ordenados por urgencia (más atrasado
 * respecto a su cadencia primero).
 */
export function computeRunningOutProducts(
  purchases: PurchasePoint[],
  opts?: {
    now?: Date
    minPurchases?: number
    triggerRatio?: number
    limit?: number
  }
): RunningOutProduct[] {
  const now = opts?.now ?? new Date()
  const minPurchases = opts?.minPurchases ?? 2
  const triggerRatio = opts?.triggerRatio ?? 0.85
  const limit = opts?.limit ?? 6

  const byProduct = new Map<number, number[]>()
  for (const p of purchases) {
    const t = new Date(p.purchased_at).getTime()
    if (Number.isNaN(t)) continue
    const list = byProduct.get(p.product_id)
    if (list) {
      // Una orden puede repetir el producto; deduplicar por timestamp.
      if (!list.includes(t)) list.push(t)
    } else {
      byProduct.set(p.product_id, [t])
    }
  }

  const results: RunningOutProduct[] = []
  for (const [product_id, times] of byProduct) {
    if (times.length < minPurchases) continue
    times.sort((a, b) => a - b)
    const first = times[0]!
    const last = times[times.length - 1]!
    const avgIntervalDays = (last - first) / (times.length - 1) / DAY_MS
    if (avgIntervalDays < 1) continue // compras el mismo día: sin cadencia útil
    const daysSinceLast = (now.getTime() - last) / DAY_MS
    if (daysSinceLast >= avgIntervalDays * triggerRatio) {
      results.push({
        product_id,
        daysSinceLast: Math.floor(daysSinceLast),
        avgIntervalDays: Math.round(avgIntervalDays * 10) / 10,
      })
    }
  }

  // Más urgente = mayor atraso relativo a su propia cadencia.
  results.sort(
    (a, b) => b.daysSinceLast / b.avgIntervalDays - a.daysSinceLast / a.avgIntervalDays
  )
  return results.slice(0, limit)
}

/**
 * Intervalo promedio (días) entre pedidos del cliente, o null si tiene
 * menos de 2 pedidos. Lo usa el cron para decidir cuándo recordar.
 */
export function computeReorderIntervalDays(orderDates: string[]): number | null {
  const times = orderDates
    .map((d) => new Date(d).getTime())
    .filter((t) => !Number.isNaN(t))
    .sort((a, b) => a - b)
  if (times.length < 2) return null
  return (times[times.length - 1]! - times[0]!) / (times.length - 1) / DAY_MS
}
