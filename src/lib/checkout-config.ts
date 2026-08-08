/**
 * Configuración compartida del checkout (cliente y servidor).
 *
 * Fuente única de verdad para las constantes de conversión del checkout
 * drawer: umbral de envío gratis y límites de bumps. Mantener sincronizada
 * con `bump_rules.subtotal_min` cuando se ajuste desde Supabase.
 */

/** Subtotal mínimo (MXN) para que el envío sea gratis. */
export const FREE_SHIPPING_THRESHOLD = 500

/** Tarifa fija de envío a domicilio cuando NO aplica envío gratis. */
export const DELIVERY_FEE_FLAT = 35

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
