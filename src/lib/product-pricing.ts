/**
 * Ronda 11 — aritmética de precios del formulario de producto.
 *
 * Regla B5: es una regla pura, así que vive en `src/lib/` y se prueba sin React
 * ni Supabase. Reutiliza `resolveEffectivePrice` (vigencia de la oferta) y
 * `round2`/`formatMoney` en vez de recalcular nada por su cuenta.
 *
 * Responde a dos preguntas que el formulario no contestaba:
 * 1. ¿Qué margen deja este precio? (margen y markup en vivo, con la misma
 *    banda de color que usa la tabla del catálogo).
 * 2. ¿Hay algo incoherente en estos precios? Los avisos son **no bloqueantes**:
 *    informan de un precio que la tienda cobraría mal, pero el admin puede
 *    guardar igual.
 */

import { formatMoney, round2 } from "./money"
import {
  resolveEffectivePrice as resolveWindowEffectivePrice,
  saleState,
  type SaleState,
} from "./sale-window"

/** Margen a partir del cual el precio se considera sano. */
export const MARGIN_GOOD_PCT = 30
/** Margen por debajo del cual conviene revisar el precio. */
export const MARGIN_WARN_PCT = 10

export type MarginBand = "good" | "warn" | "bad"

export type PricingWarningKey = "sale_not_a_discount" | "below_cost"

export interface PricingWarning {
  key: PricingWarningKey
  /** Texto listo para pintar; ya trae los montos formateados. */
  message: string
}

export interface PricingInput {
  price: number | null
  salePrice?: number | null
  cost?: number | null
  /** Ventana de la oferta tal como está en el formulario (ISO o `datetime-local`). */
  saleStartsAt?: string | null
  saleEndsAt?: string | null
}

export interface PricingAnalysis {
  /** Precio que cobra la tienda hoy: la oferta solo si está vigente. */
  effectivePrice: number | null
  /** Estado de la ventana de la oferta; el formulario lo usa para explicar el margen. */
  saleState: SaleState
  /** Margen bruto unitario sobre el precio efectivo. `null` sin costo o sin precio. */
  marginPct: number | null
  /** Cuánto se le suma al costo, en porcentaje del costo. `null` sin costo. */
  markupPct: number | null
  /** Avisos no bloqueantes, en orden de gravedad. */
  warnings: PricingWarning[]
}

/** Monto válido (finito y ≥ 0) o `null`: los campos llegan como texto libre. */
function money(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null
}

/**
 * Margen bruto unitario sobre el precio efectivo. `null` cuando falta el costo
 * o el precio: sin dato no se inventa un porcentaje.
 */
export function marginPct(
  effectivePrice: number | null | undefined,
  cost: number | null | undefined
): number | null {
  const price = money(effectivePrice)
  const unitCost = money(cost)
  if (price === null || price <= 0 || unitCost === null) return null
  return round2(((price - unitCost) / price) * 100)
}

/** Markup sobre el costo. `null` sin costo capturado o si el costo es 0. */
export function markupPct(
  effectivePrice: number | null | undefined,
  cost: number | null | undefined
): number | null {
  const price = money(effectivePrice)
  const unitCost = money(cost)
  if (price === null || unitCost === null || unitCost <= 0) return null
  return round2(((price - unitCost) / unitCost) * 100)
}

/** Banda de color del margen: los mismos cortes que la tabla del catálogo. */
export function marginBand(pct: number | null): MarginBand | null {
  if (pct === null) return null
  if (pct >= MARGIN_GOOD_PCT) return "good"
  if (pct >= MARGIN_WARN_PCT) return "warn"
  return "bad"
}

/** Analiza los precios del formulario: precio efectivo, margen y avisos. */
export function analyzePricing(input: PricingInput): PricingAnalysis {
  const base = money(input.price)
  const sale = money(input.salePrice)
  const cost = money(input.cost)

  const window = {
    sale_price: sale,
    sale_starts_at: input.saleStartsAt ?? null,
    sale_ends_at: input.saleEndsAt ?? null,
  }
  const state = saleState(window)
  const effectivePrice = resolveWindowEffectivePrice({ ...window, price: base })

  const margin = marginPct(effectivePrice, cost)
  const markup = markupPct(effectivePrice, cost)

  const warnings: PricingWarning[] = []
  // Vender por debajo del costo va primero: es el aviso que cuesta dinero.
  if (effectivePrice !== null && cost !== null && effectivePrice < cost) {
    warnings.push({
      key: "below_cost",
      message: `El precio que cobraría la tienda (${formatMoney(
        effectivePrice
      )}) queda por debajo del costo (${formatMoney(cost)}): cada venta pierde dinero.`,
    })
  }
  if (base !== null && sale !== null && sale >= base) {
    warnings.push({
      key: "sale_not_a_discount",
      message:
        sale > base
          ? `El precio de oferta (${formatMoney(sale)}) es mayor que el precio normal (${formatMoney(
              base
            )}): la tienda cobraría ${formatMoney(sale)}.`
          : `El precio de oferta (${formatMoney(
              sale
            )}) es igual al precio normal: la tienda no mostrará descuento.`,
    })
  }

  return {
    effectivePrice,
    saleState: state,
    marginPct: margin,
    markupPct: markup,
    warnings,
  }
}
