/**
 * Ronda 7 — reporte de ventas con margen y clasificación ABC.
 *
 * Los cálculos viven aquí (puros y testeables) y la ruta
 * `/api/admin/products/sales-report` solo se encarga de leer pedidos,
 * productos y serializar. El margen usa `products.cost` como costo unitario;
 * si el producto no tiene costo capturado el margen queda en `null` y se
 * reporta aparte para que el admin sepa qué le falta capturar.
 */

/** Umbrales Pareto de la clasificación ABC sobre el ingreso acumulado. */
export const ABC_A_SHARE = 0.8
export const ABC_B_SHARE = 0.95

export type AbcClass = "A" | "B" | "C"

export interface SalesInput {
  productId: number
  name: string
  units: number
  revenue: number
  /** Costo unitario vigente; `null` cuando el producto no lo tiene capturado. */
  unitCost: number | null
}

export interface SalesRow extends SalesInput {
  /** Ingreso − costo de lo vendido. `null` si falta el costo unitario. */
  margin: number | null
  /** Margen sobre ingreso en porcentaje (0-100). `null` si falta el costo. */
  marginPct: number | null
  abc: AbcClass
  /** Participación del producto en el ingreso total (0-1). */
  share: number
}

export interface AbcSummary {
  A: number
  B: number
  C: number
}

export interface SalesReportInsights {
  /** Productos con ventas en el rango. */
  products: number
  units: number
  revenue: number
  /** Margen total, solo de los productos con costo capturado. */
  margin: number | null
  marginPct: number | null
  /** Cuántos productos vendidos no tienen costo capturado. */
  missingCost: number
  abc: AbcSummary
  /** Ingreso de la clase A sobre el total (0-1). */
  aShare: number
  topRevenue: { name: string; revenue: number } | null
  topUnits: { name: string; units: number } | null
  /** Mejor margen % entre productos con costo y al menos una venta. */
  bestMargin: { name: string; marginPct: number } | null
  /** Producto con margen % más bajo (candidato a revisar precio). */
  worstMargin: { name: string; marginPct: number } | null
}

/** Redondeo monetario a 2 decimales sin arrastrar error binario. */
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/** Tolerancia para que un acumulado "exacto" (p. ej. 0.8) no caiga en A por error binario. */
const SHARE_EPSILON = 1e-9

/**
 * Clasifica por Pareto usando el **punto medio** de la participación
 * acumulada del producto, es decir la clase donde cae la mayor parte de su
 * ingreso. A cubre el primer 80 % del ingreso, B hasta el 95 % y C el resto.
 * Así un producto que por sí solo concentra todo el ingreso es A, y uno que
 * arranca en 90 % y termina en 100 % es C.
 */
export function abcClassOf(priorShare: number, share: number): AbcClass {
  const mid = priorShare + share / 2
  if (mid < ABC_A_SHARE - SHARE_EPSILON) return "A"
  if (mid < ABC_B_SHARE - SHARE_EPSILON) return "B"
  return "C"
}

/**
 * Arma las filas del reporte: agrega, calcula margen y asigna clase ABC.
 * Ordena por ingreso descendente (mismo orden que el CSV).
 */
export function buildSalesRows(items: SalesInput[]): SalesRow[] {
  const revenue = items.reduce((sum, i) => sum + i.revenue, 0)
  const sorted = [...items].sort((a, b) => b.revenue - a.revenue)

  let cumulative = 0
  return sorted.map((item) => {
    const share = revenue > 0 ? item.revenue / revenue : 0
    const prior = cumulative
    cumulative += share
    const cost = item.unitCost === null ? null : item.unitCost * item.units
    const margin = cost === null ? null : round2(item.revenue - cost)
    return {
      ...item,
      revenue: round2(item.revenue),
      margin,
      marginPct: margin === null || item.revenue <= 0 ? null : round2((margin / item.revenue) * 100),
      abc: item.revenue <= 0 ? "C" : abcClassOf(prior, share),
      share,
    }
  })
}

export function abcSummary(rows: SalesRow[]): AbcSummary {
  const summary: AbcSummary = { A: 0, B: 0, C: 0 }
  for (const row of rows) summary[row.abc] += 1
  return summary
}

/** Tarjeta de insights del panel: totales, ABC y extremos de margen. */
export function salesReportInsights(rows: SalesRow[]): SalesReportInsights {
  const revenue = rows.reduce((sum, r) => sum + r.revenue, 0)
  const units = rows.reduce((sum, r) => sum + r.units, 0)
  const withCost = rows.filter((r) => r.margin !== null)
  const margin = withCost.length
    ? round2(withCost.reduce((sum, r) => sum + (r.margin ?? 0), 0))
    : null
  const marginRevenue = withCost.reduce((sum, r) => sum + r.revenue, 0)
  const abc = abcSummary(rows)
  const aRevenue = rows.filter((r) => r.abc === "A").reduce((sum, r) => sum + r.revenue, 0)

  const byUnits = [...rows].sort((a, b) => b.units - a.units)
  const byMargin = withCost
    .filter((r) => r.marginPct !== null)
    .sort((a, b) => (b.marginPct ?? 0) - (a.marginPct ?? 0))

  const top = rows[0]
  const topByUnits = byUnits[0]
  const best = byMargin[0]
  const worst = byMargin[byMargin.length - 1]

  return {
    products: rows.length,
    units,
    revenue: round2(revenue),
    margin,
    marginPct:
      margin === null || marginRevenue <= 0 ? null : round2((margin / marginRevenue) * 100),
    missingCost: rows.length - withCost.length,
    abc,
    aShare: revenue > 0 ? aRevenue / revenue : 0,
    topRevenue: top ? { name: top.name, revenue: top.revenue } : null,
    topUnits: topByUnits ? { name: topByUnits.name, units: topByUnits.units } : null,
    bestMargin: best ? { name: best.name, marginPct: best.marginPct ?? 0 } : null,
    worstMargin: worst ? { name: worst.name, marginPct: worst.marginPct ?? 0 } : null,
  }
}

function escCsv(value: string): string {
  return /[",;\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

/** Celda numérica: vacía cuando el dato no existe (producto sin costo). */
function csvNumber(value: number | null, digits = 2): string {
  return value === null ? "" : value.toFixed(digits)
}

/**
 * CSV del reporte. Columnas: producto, unidades, monto, costo, margen,
 * margen_pct, clase_abc, participacion_pct. El BOM mantiene los acentos en Excel.
 */
export function salesReportCsv(rows: SalesRow[]): string {
  const header = [
    "producto",
    "unidades",
    "monto",
    "costo",
    "margen",
    "margen_pct",
    "clase_abc",
    "participacion_pct",
  ].join(",")
  const lines = rows.map((r) =>
    [
      escCsv(r.name),
      String(r.units),
      r.revenue.toFixed(2),
      csvNumber(r.unitCost === null ? null : round2(r.unitCost * r.units)),
      csvNumber(r.margin),
      csvNumber(r.marginPct, 1),
      r.abc,
      (r.share * 100).toFixed(2),
    ].join(",")
  )
  return "\ufeff" + [header, ...lines].join("\n")
}
