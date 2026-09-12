/**
 * Fase 14 — lógica pura de analítica comparativa por periodo.
 */

export const PERIOD_OPTIONS = [7, 30, 90] as const
export type PeriodDays = (typeof PERIOD_OPTIONS)[number]

export function isPeriodDays(value: number): value is PeriodDays {
  return (PERIOD_OPTIONS as readonly number[]).includes(value)
}

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Límites del periodo actual y del periodo anterior de igual duración.
 * El periodo actual termina en `now`; el anterior termina donde empieza
 * el actual.
 */
export function periodBounds(days: PeriodDays, now: Date = new Date()): {
  since: Date
  prevSince: Date
  prevUntil: Date
} {
  const since = new Date(now.getTime() - days * DAY_MS)
  const prevSince = new Date(now.getTime() - 2 * days * DAY_MS)
  return { since, prevSince, prevUntil: since }
}

export interface MetricComparison {
  current: number
  previous: number
  /** Punto porcentual de cambio; null cuando no hay base de comparación */
  deltaPct: number | null
  direction: "up" | "down" | "flat"
}

/** Compara una métrica del periodo actual contra el anterior. */
export function compareMetric(current: number, previous: number): MetricComparison {
  const direction = current > previous ? "up" : current < previous ? "down" : "flat"
  return {
    current,
    previous,
    deltaPct: previous > 0 ? Math.round(((current - previous) / previous) * 1000) / 10 : null,
    direction,
  }
}

/**
 * Clasifica clientes del periodo en nuevos vs recurrentes según si ya
 * tenían pedidos ANTES del periodo. `ordersInPeriod` y `priorUserIds`
 * llevan user_id (puede haber invitados sin user_id: se ignoran).
 */
export function splitNewVsRecurring(
  ordersInPeriod: { user_id: string | null }[],
  priorUserIds: ReadonlySet<string>
): { newCustomers: number; recurringCustomers: number } {
  const seen = new Set<string>()
  let newCustomers = 0
  let recurringCustomers = 0
  for (const o of ordersInPeriod) {
    if (!o.user_id || seen.has(o.user_id)) continue
    seen.add(o.user_id)
    if (priorUserIds.has(o.user_id)) recurringCustomers += 1
    else newCustomers += 1
  }
  return { newCustomers, recurringCustomers }
}

/** CSV es-MX (separador ;) con BOM para Excel, mismo patrón que pedidos. */
export function metricsComparisonToCsv(rows: [string, string, string, string][]): string {
  const header = "Métrica;Periodo actual;Periodo anterior;Cambio %"
  const escape = (v: string) => (/[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
  const lines = rows.map((r) => r.map(escape).join(";"))
  return "﻿" + [header, ...lines].join("\r\n")
}
