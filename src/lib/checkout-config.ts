/**
 * Configuración compartida del checkout (cliente y servidor).
 *
 * Fuente única de verdad para las constantes de conversión del checkout
 * drawer: umbral de envío gratis y límites de bumps. El umbral y la tarifa
 * son configurables vía env (`NEXT_PUBLIC_FREE_SHIPPING_THRESHOLD` y
 * `NEXT_PUBLIC_DELIVERY_FEE_FLAT`) para ajustarlos sin deploy de código;
 * al cambiarlos, alinear también `bump_rules.subtotal_min` en Supabase.
 */

/** Lee un número positivo desde env con fallback (inválido → fallback). */
function envNumber(name: string, fallback: number): number {
  const raw = process.env[name]
  if (!raw) return fallback
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

/** Subtotal mínimo (MXN) para que el envío sea gratis. */
export const FREE_SHIPPING_THRESHOLD = envNumber("NEXT_PUBLIC_FREE_SHIPPING_THRESHOLD", 500)

/** Tarifa fija de envío a domicilio cuando NO aplica envío gratis. */
export const DELIVERY_FEE_FLAT = envNumber("NEXT_PUBLIC_DELIVERY_FEE_FLAT", 35)

/** Máximo de order bumps mostrados simultáneamente en el drawer. */
export const MAX_BUMPS = 3

/**
 * Calcula el envío válido para un pedido con `itemCount` artículos.
 *
 * - Sin artículos → 0.
 * - Con envío gratis (subtotal con descuento >= umbral) → 0.
 * - Si no, acepta solo 0 o la tarifa fija (whitelist retrocompatible).
 */
export function validDeliveryFee(
  itemCount: number,
  payableSubtotal: number,
  deliveryFeeInput: number
): number {
  if (itemCount <= 0) return 0
  if (payableSubtotal >= FREE_SHIPPING_THRESHOLD) return 0
  return deliveryFeeInput === 0 || deliveryFeeInput === DELIVERY_FEE_FLAT
    ? deliveryFeeInput
    : DELIVERY_FEE_FLAT
}

/**
 * Descuento de cupón sobre un subtotal dado. Misma fórmula que POST /api/orders
 * (server-side), de modo que el total del cliente coincida exactamente con el
 * total recalculado en la BD — incluye order bumps en `subtotal`.
 */
export function calcCouponDiscount(subtotal: number, coupon: { discount_type: string; discount_value: number; min_order: number } | null): number {
  if (!coupon) return 0
  if (subtotal < coupon.min_order) return 0
  if (coupon.discount_type === "percentage") {
    return Math.round((subtotal * coupon.discount_value) / 100 * 100) / 100
  }
  return Math.min(coupon.discount_value, subtotal)
}

/** Tipo de cupón compatible con el cálculo de totales (cliente y servidor). */
export type CouponLike = {
  discount_type: string
  discount_value: number
  min_order: number
}

/** Resultado completo del cálculo de totales del carrito/checkout. */
export interface CheckoutTotals {
  bumpsSubtotal: number
  effectiveSubtotal: number
  discountAmount: number
  payableSubtotal: number
  allItemsCount: number
  deliveryFee: number
  total: number
}

/**
 * Calcula los totales completos de un pedido con order bumps y cupón.
 *
 * Fuente única para TODAS las superficies (drawer, /carrito, /cart, drawer de
 * checkout y checkout full-page) de modo que el total mostrado coincida siempre
 * con el recalculado por POST /api/orders:
 * - El descuento de cupón se aplica sobre `subtotal + bumpsSubtotal` (igual que
 *   el servidor en realSubtotal).
 * - El envío usa validDeliveryFee (gratis desde el umbral, contando bumps).
 */
export function calcCheckoutTotals(
  subtotal: number,
  bumpsSubtotal: number,
  coupon: CouponLike | null,
  itemCount: number,
  bumpCount: number,
  deliveryFeeInput: number = DELIVERY_FEE_FLAT
): CheckoutTotals {
  const effectiveSubtotal = subtotal + bumpsSubtotal
  const discountAmount = calcCouponDiscount(effectiveSubtotal, coupon)
  const payableSubtotal = effectiveSubtotal - discountAmount
  const allItemsCount = itemCount + bumpCount
  const deliveryFee = validDeliveryFee(allItemsCount, payableSubtotal, deliveryFeeInput)
  return {
    bumpsSubtotal,
    effectiveSubtotal,
    discountAmount,
    payableSubtotal,
    allItemsCount,
    deliveryFee,
    total: payableSubtotal + deliveryFee,
  }
}

/**
 * Estado de la barra de envío gratis para un subtotal pagable.
 * Devuelve el texto exacto y el porcentaje de progreso (0–100).
 */
export function freeShippingProgress(payableSubtotal: number): {
  remaining: number
  percent: number
  isFree: boolean
  message: string
} {
  const remaining = Math.max(0, FREE_SHIPPING_THRESHOLD - payableSubtotal)
  const percent = Math.min(100, (payableSubtotal / FREE_SHIPPING_THRESHOLD) * 100)
  const isFree = remaining <= 0
  return {
    remaining,
    percent,
    isFree,
    message: isFree
      ? "🎉 Tienes envío gratis"
      : `Agrega $${remaining.toFixed(2)} más para envío gratis`,
  }
}
