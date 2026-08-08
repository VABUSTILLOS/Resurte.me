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
