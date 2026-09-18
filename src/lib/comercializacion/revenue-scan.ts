/**
 * Escaneo de las ventas pagadas de un cliente del CRM.
 *
 * POR QUÉ EXISTE: `getProspectClientOrders` calculaba el ingreso —y con él la
 * comisión— sumando **las mismas 50 filas** que la lista de la ficha. A partir
 * del pedido 51 el número que el vendedor leía bajo "Ventas pagadas (histórico)"
 * quedaba corto **sin avisar**: la etiqueta prometía el histórico y el código
 * entregaba una ventana. La lista de 50 es razonable para *mostrar*; el total no.
 *
 * CÓMO: se pide solo la columna `total` con una ventana alta y **una fila de
 * más**, que es la que delata el corte. Es el mismo patrón —y el mismo motivo—
 * que `readCrmPipelineValue` en `crm-prospects.ts`: el lector de listas devuelve
 * una página, y sumar una página da un total que *parece* completo y no lo es.
 * Un techo silencioso sería peor que no tener total.
 *
 * Este módulo es puro a propósito: vive fuera de `actions/vinculos.ts` porque
 * ese archivo es `"use server"` y ahí todo lo exportado tiene que ser `async`,
 * así que ni la constante ni la aritmética podrían exportarse desde allí — ni,
 * por tanto, probarse.
 */

/**
 * Techo de filas que se escanean para sumar las ventas de un cliente.
 *
 * Alto a propósito: un restaurante con miles de pedidos históricos cabe de
 * sobra. Si algún día no cupiera, el resultado se marca `truncated` y la
 * superficie lo presenta como mínimo (`≥`), nunca como el total.
 */
export const CRM_REVENUE_SCAN_LIMIT = 5000

/** Pedidos que se listan en la ficha (los más recientes). */
export const REVENUE_LIST_LIMIT = 50

/** Importe de una fila. `total` es `DECIMAL` pero PostgREST lo entrega como texto. */
export function toAmount(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value)
  return Number.isFinite(n) ? n : 0
}

export interface PaidRevenue {
  revenue: number
  /** Cuántos pedidos pagados sostienen el importe. */
  paidOrders: number
  /** `true` si la ventana de escaneo se quedó corta y `revenue` es un mínimo. */
  truncated: boolean
}

/**
 * Suma una ventana de filas ya filtradas por `payment_status = 'paid'`.
 *
 * La fila extra se descarta al sumar: solo sirve para saber que había más. El
 * filtro y el orden viven en SQL, porque lo que se pide aquí es la columna de
 * una consulta que ya eligió las filas.
 */
export function foldPaidRevenueWindow(
  rows: ReadonlyArray<{ total: unknown }>,
  limit: number = CRM_REVENUE_SCAN_LIMIT
): PaidRevenue {
  const truncated = rows.length > limit
  const counted = truncated ? rows.slice(0, limit) : rows
  return {
    revenue: counted.reduce((sum, row) => sum + toAmount(row.total), 0),
    paidOrders: counted.length,
    truncated,
  }
}
