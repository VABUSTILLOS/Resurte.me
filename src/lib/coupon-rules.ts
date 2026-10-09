/**
 * Reglas de elegibilidad de un cupón, puras y compartidas.
 *
 * Antes vivían duplicadas en `POST /api/coupons/validate` (carrito) y en
 * `POST /api/orders` (creación del pedido): dos copias de la misma regla de
 * dinero divergen en el primer arreglo, y la que se queda atrás rechaza un
 * pedido que el cliente ya vio como válido. Aquí hay una sola implementación.
 *
 * **Las tres reglas aplican a todos los tipos, `free_shipping` incluido.** Lo
 * único especial del cupón de envío gratis es su *efecto* (pone la tarifa de
 * envío en 0 en vez de descontar subtotal): su pedido mínimo, su tope de usos y
 * su expiración se evalúan igual que los de un cupón porcentual. El guardián de
 * propiedad (`user_id`) no vive aquí porque es una regla de seguridad, y lo
 * aplican las rutas.
 */

/** Valor de `coupons.discount_type` que regala el envío a domicilio. */
export const FREE_SHIPPING_TYPE = "free_shipping"

/** Tipos de descuento que un cupón puede tener hoy. */
export const COUPON_DISCOUNT_TYPES = ["percentage", "fixed_amount", FREE_SHIPPING_TYPE] as const

export type CouponDiscountType = (typeof COUPON_DISCOUNT_TYPES)[number]

/** ¿Este cupón regala el envío? Acepta cualquier forma con `discount_type`. */
export function isFreeShippingCoupon(coupon: { discount_type: string } | null | undefined): boolean {
  return coupon?.discount_type === FREE_SHIPPING_TYPE
}

/** Subconjunto de columnas de `coupons` que necesitan las reglas de elegibilidad. */
export interface CouponEligibilityRow {
  discount_type: string
  min_order: number
  max_uses: number
  used_count: number
  expires_at: string | null
}

export type CouponEligibility =
  | { ok: true }
  | { ok: false; error: string }

/**
 * ¿Puede usarse este cupón con este subtotal?
 *
 * Los textos de error son los que ya publicaban las dos rutas: cambiarlos es un
 * cambio de producto, no un detalle de implementación. El tipo del cupón no
 * cambia la evaluación: `free_shipping` respeta las mismas reglas.
 */
export function validateCouponEligibility(
  coupon: CouponEligibilityRow,
  subtotal: number,
  now: Date = new Date()
): CouponEligibility {
  if (coupon.expires_at && new Date(coupon.expires_at) < now) {
    return { ok: false, error: "El cupón ha expirado" }
  }
  if (subtotal < Number(coupon.min_order)) {
    return {
      ok: false,
      error: `Este cupón requiere un pedido mínimo de $${Number(coupon.min_order).toFixed(2)}`,
    }
  }
  if (coupon.max_uses > 0 && coupon.used_count >= coupon.max_uses) {
    return { ok: false, error: "El cupón ya fue utilizado el máximo de veces" }
  }
  return { ok: true }
}
