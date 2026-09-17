"use client"

import { TrendingUp, TrendingDown, Minus } from "lucide-react"

export type DeltaDirection = "up" | "down" | "flat"

/**
 * Unidad del delta. Un conteo se compara en `%` relativo, pero una **tasa** se
 * compara en puntos porcentuales (`pp`): pasar de 20% a 24% son +4 pp, no +20%.
 */
export type DeltaUnit = "%" | "pp"

/**
 * Chip de variación contra el periodo anterior.
 *
 * `goodDirection` existe porque "subir" no siempre es bueno: un alza de pagos
 * fallidos o de carritos abandonados pintada en verde dice lo contrario de lo
 * que pasó. Esos indicadores pasan `goodDirection="down"`.
 */
export function DeltaChip({
  deltaPct,
  direction,
  unit = "%",
  goodDirection = "up",
}: {
  deltaPct: number | null
  direction: DeltaDirection
  unit?: DeltaUnit
  goodDirection?: "up" | "down"
}) {
  if (deltaPct === null) {
    return <span className="text-[11px] text-gray-400">sin base</span>
  }
  const Icon = direction === "up" ? TrendingUp : direction === "down" ? TrendingDown : Minus
  const good = direction !== "flat" && direction === goodDirection
  const bad = direction !== "flat" && direction !== goodDirection
  const color = good ? "text-green-600" : bad ? "text-red-600" : "text-gray-500"
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold ${color}`}>
      <Icon className="w-3 h-3" aria-hidden="true" />
      {deltaPct > 0 ? "+" : ""}
      {deltaPct}
      {unit}
    </span>
  )
}

/**
 * Métrica con su valor actual, el del periodo anterior y la variación.
 * `previous` puede omitirse para indicadores que solo existen en el periodo
 * actual (p. ej. clientes nuevos vs. recurrentes, que no se comparan).
 */
export function MetricWithDelta({
  label,
  current,
  previous,
  comp,
  unit,
  goodDirection,
}: {
  label: string
  current: string
  previous?: string
  comp?: { deltaPct: number | null; direction: DeltaDirection }
  unit?: DeltaUnit
  goodDirection?: "up" | "down"
}) {
  return (
    <div>
      <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">{label}</p>
      <p className="mt-0.5 text-lg font-bold text-gray-900">{current}</p>
      <p className="text-[11px] text-gray-400">
        {previous !== undefined && <>antes: {previous} </>}
        {comp && (
          <DeltaChip
            deltaPct={comp.deltaPct}
            direction={comp.direction}
            unit={unit}
            goodDirection={goodDirection}
          />
        )}
      </p>
    </div>
  )
}
