/**
 * Formato y resumen textual de la tendencia diaria del embudo.
 *
 * Vive aparte del componente de gráfica a propósito: aquí no se importa
 * recharts, así que estas funciones —que son el texto que lee un lector de
 * pantalla— se pueden probar en el entorno `node` de vitest.
 */

import { formatMoney, formatNumber } from "@/lib/money"
import { formatRate } from "@/lib/funnel-metrics"
import type { TrendPoint } from "@/lib/conversion-funnel"

/**
 * `date` es un día local (`YYYY-MM-DD`). Se ancla a mediodía UTC y se formatea
 * en UTC a propósito: interpretarlo en la zona del navegador correría la
 * etiqueta un día para quien esté al este de México.
 */
export function shortDay(date: string): string {
  const d = new Date(`${date}T12:00:00Z`)
  return Number.isNaN(d.getTime())
    ? date
    : d.toLocaleDateString("es-MX", { day: "numeric", month: "short", timeZone: "UTC" })
}

/**
 * Resumen textual de la serie. Las gráficas de recharts son SVG sin semántica,
 * así que sin esto la tendencia es muda para un lector de pantalla.
 */
export function describeTrend(points: TrendPoint[]): string {
  if (points.length === 0) return "Tendencia diaria: sin datos en el período"

  const first = points.at(0)
  const last = points.at(-1)
  const created = points.reduce((sum, p) => sum + p.created, 0)
  const paid = points.reduce((sum, p) => sum + p.paid, 0)
  const revenue = points.reduce((sum, p) => sum + p.revenue, 0)
  const direction =
    !first || !last || last.created === first.created
      ? "estable"
      : last.created > first.created
        ? "al alza"
        : "a la baja"
  const partial = points.some((p) => p.partial)
    ? " El primer y/o el último día están incompletos por el corte de la ventana."
    : ""

  return (
    `Tendencia diaria: ${points.length} días, ${formatNumber(created)} pedidos creados y ` +
    `${formatNumber(paid)} pagados (${formatRate(created > 0 ? Math.round((paid / created) * 100) : null)}), ` +
    `${formatMoney(revenue)} cobrados. Del ${shortDay(first?.date ?? "")} al ${shortDay(last?.date ?? "")}, ` +
    `tendencia de pedidos ${direction}.${partial}`
  )
}
