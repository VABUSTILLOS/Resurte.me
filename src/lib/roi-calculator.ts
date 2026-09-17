/**
 * Calculadora de comisiones: "¿cuánto le regalas a la app de delivery?".
 *
 * Módulo puro y determinista (no lee `Date.now()`, no toca red ni BD) para
 * poder testearlo y para poder renderizarlo en el navegador sin exponer nada:
 * el resultado es una estimación de marketing, no un precio.
 *
 * Qué modela y qué NO modela — a propósito:
 *   · SÍ modela la comisión que la app cobra sobre el GMV, que es el dinero
 *     que el restaurantero deja de ver.
 *   · SÍ modela el costo del reparto propio, porque es la objeción honesta:
 *     si tu reparto cuesta más que la comisión, no ahorras nada y el
 *     resultado lo dice con un aviso en vez de maquillarlo.
 *   · NO modela el costo de procesamiento de pago. Se paga en los dos
 *     caminos por igual, así que incluirlo solo inflaría la cifra sin cambiar
 *     la diferencia.
 *   · NO promete un nivel de FoodOS. El nivel se gana COMPRANDO en el
 *     marketplace (`src/lib/wallet-progress.ts`), no vendiendo, así que no se
 *     deriva de estos números.
 */

/** Valores iniciales del formulario: un restaurante mediano con app de delivery. */
export const ROI_DEFAULTS = {
  monthlyOrders: 600,
  averageTicket: 250,
  commissionPct: 30,
  deliveryCostPerOrder: 45,
  ownDeliveryShare: 0.5,
} as const

export const ROI_LIMITS = {
  monthlyOrders: { min: 0, max: 100_000 },
  averageTicket: { min: 0, max: 100_000 },
  commissionPct: { min: 0, max: 60 },
  deliveryCostPerOrder: { min: 0, max: 1_000 },
  ownDeliveryShare: { min: 0, max: 1 },
} as const

export interface RoiInput {
  /** Pedidos por mes, en todos los canales. */
  monthlyOrders: number
  /** Ticket promedio en MXN. */
  averageTicket: number
  /** Comisión que cobra la app de delivery, en porcentaje del GMV. */
  commissionPct: number
  /** Costo de repartir un pedido con medios propios, en MXN. */
  deliveryCostPerOrder: number
  /** Fracción 0..1 de pedidos que requieren reparto a domicilio. */
  ownDeliveryShare: number
}

export interface RoiResult {
  /** GMV mensual estimado. */
  gmvMonthly: number
  /** Comisión que se queda la app cada mes. */
  commissionMonthly: number
  /** Comisión anual (12 meses). */
  commissionYearly: number
  /** Comisión por pedido. */
  commissionPerOrder: number
  /** Lo que costaría repartir esos pedidos por cuenta propia. */
  ownDeliveryMonthly: number
  /** Comisión evitada menos costo de reparto propio. Puede ser negativo. */
  savingsMonthly: number
  savingsYearly: number
  savingsPerOrder: number
  /** Ahorro como porcentaje del GMV. 0 si no hay GMV. */
  savingsPctOfGmv: number
  /** Avisos honestos: cuando el reparto propio se come el ahorro. */
  warnings: string[]
}

/** Redondea a 2 decimales (misma regla que el resto del repo). */
function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** Acota un valor a un rango y descarta NaN/Infinity. */
function clamp(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(Math.max(n, min), max)
}

/** Normaliza una entrada parcial (formulario, querystring) a un `RoiInput` válido. */
export function normalizeRoiInput(input: Partial<RoiInput> | null | undefined): RoiInput {
  const raw = input ?? {}
  return {
    monthlyOrders: clamp(raw.monthlyOrders, 0, ROI_LIMITS.monthlyOrders.max, ROI_DEFAULTS.monthlyOrders),
    averageTicket: clamp(raw.averageTicket, 0, ROI_LIMITS.averageTicket.max, ROI_DEFAULTS.averageTicket),
    commissionPct: clamp(raw.commissionPct, 0, ROI_LIMITS.commissionPct.max, ROI_DEFAULTS.commissionPct),
    deliveryCostPerOrder: clamp(
      raw.deliveryCostPerOrder,
      0,
      ROI_LIMITS.deliveryCostPerOrder.max,
      ROI_DEFAULTS.deliveryCostPerOrder,
    ),
    ownDeliveryShare: clamp(raw.ownDeliveryShare, 0, 1, ROI_DEFAULTS.ownDeliveryShare),
  }
}

/**
 * Calcula el comparativo. Nunca lanza: una entrada basura se normaliza.
 * `savingsMonthly` puede salir negativo y entonces `warnings` lo explica.
 */
export function computeRoi(input: Partial<RoiInput> | null | undefined): RoiResult {
  const roi = normalizeRoiInput(input)

  const gmvMonthly = round2(roi.monthlyOrders * roi.averageTicket)
  const commissionMonthly = round2(gmvMonthly * (roi.commissionPct / 100))
  const commissionPerOrder = round2(roi.averageTicket * (roi.commissionPct / 100))
  const ownDeliveryMonthly = round2(
    roi.monthlyOrders * roi.ownDeliveryShare * roi.deliveryCostPerOrder,
  )

  const savingsMonthly = round2(commissionMonthly - ownDeliveryMonthly)
  const savingsPerOrder = roi.monthlyOrders > 0 ? round2(savingsMonthly / roi.monthlyOrders) : 0

  const warnings: string[] = []
  if (roi.monthlyOrders === 0) {
    warnings.push("Pon tus pedidos por mes para ver el comparativo.")
  } else if (savingsMonthly < 0) {
    warnings.push(
      "Con estos números tu reparto propio cuesta más que la comisión que pagas. No vendemos ahorro que no existe.",
    )
  } else if (savingsMonthly === 0) {
    warnings.push("Con estos números el ahorro es cero: tu reparto cuesta exactamente la comisión.")
  }
  if (roi.commissionPct === 0) {
    warnings.push("Con 0% de comisión no hay nada que ahorrar.")
  }

  return {
    gmvMonthly,
    commissionMonthly,
    commissionYearly: round2(commissionMonthly * 12),
    commissionPerOrder,
    ownDeliveryMonthly,
    savingsMonthly,
    savingsYearly: round2(savingsMonthly * 12),
    savingsPerOrder,
    savingsPctOfGmv: gmvMonthly > 0 ? round2((savingsMonthly / gmvMonthly) * 100) : 0,
    warnings,
  }
}

/** GMV mensual estimado desde pedidos por semana (4.33 semanas/mes). */
export function monthlyGmvFromWeeklyOrders(weeklyOrders: number, averageTicket: number): number {
  const weekly = clamp(weeklyOrders, 0, ROI_LIMITS.monthlyOrders.max, 0)
  const ticket = clamp(averageTicket, 0, ROI_LIMITS.averageTicket.max, 0)
  return round2(weekly * ticket * 4.33)
}
