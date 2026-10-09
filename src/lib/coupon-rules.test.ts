import { describe, expect, it } from "vitest"
import {
  COUPON_DISCOUNT_TYPES,
  FREE_SHIPPING_TYPE,
  isFreeShippingCoupon,
  validateCouponEligibility,
  type CouponEligibilityRow,
} from "./coupon-rules"

const base: CouponEligibilityRow = {
  discount_type: "percentage",
  min_order: 0,
  max_uses: 0,
  used_count: 0,
  expires_at: null,
}

describe("coupon-rules", () => {
  it("free_shipping es un tipo de descuento reconocido", () => {
    expect(COUPON_DISCOUNT_TYPES).toContain(FREE_SHIPPING_TYPE)
  })

  describe("isFreeShippingCoupon", () => {
    it("solo es true para el tipo free_shipping", () => {
      expect(isFreeShippingCoupon({ discount_type: FREE_SHIPPING_TYPE })).toBe(true)
      expect(isFreeShippingCoupon({ discount_type: "percentage" })).toBe(false)
      expect(isFreeShippingCoupon({ discount_type: "fixed_amount" })).toBe(false)
      expect(isFreeShippingCoupon(null)).toBe(false)
      expect(isFreeShippingCoupon(undefined)).toBe(false)
    })
  })

  describe("validateCouponEligibility", () => {
    it("acepta un cupón cuyas reglas no restringen", () => {
      expect(validateCouponEligibility(base, 100)).toEqual({ ok: true })
    })

    it("rechaza un cupón expirado", () => {
      const r = validateCouponEligibility(
        { ...base, expires_at: "2020-01-01T00:00:00.000Z" },
        100
      )
      expect(r).toEqual({ ok: false, error: "El cupón ha expirado" })
    })

    it("rechaza por debajo del pedido mínimo con el texto del checkout", () => {
      const r = validateCouponEligibility({ ...base, min_order: 300 }, 299.99)
      expect(r).toEqual({ ok: false, error: "Este cupón requiere un pedido mínimo de $300.00" })
    })

    it("rechaza cuando se agotaron los usos", () => {
      const r = validateCouponEligibility({ ...base, max_uses: 5, used_count: 5 }, 100)
      expect(r).toEqual({ ok: false, error: "El cupón ya fue utilizado el máximo de veces" })
    })

    it("un cupón de envío gratis respeta las mismas reglas que cualquier otro", () => {
      const freeShip = { ...base, discount_type: FREE_SHIPPING_TYPE }
      expect(validateCouponEligibility(freeShip, 100)).toEqual({ ok: true })

      expect(
        validateCouponEligibility({ ...freeShip, expires_at: "2000-01-01T00:00:00.000Z" }, 100)
      ).toEqual({ ok: false, error: "El cupón ha expirado" })

      expect(validateCouponEligibility({ ...freeShip, min_order: 9999 }, 1)).toEqual({
        ok: false,
        error: "Este cupón requiere un pedido mínimo de $9999.00",
      })

      expect(
        validateCouponEligibility({ ...freeShip, max_uses: 10, used_count: 10 }, 100)
      ).toEqual({ ok: false, error: "El cupón ya fue utilizado el máximo de veces" })
    })

    it("el tope de usos solo bloquea cuando es finito y ya se alcanzó", () => {
      expect(validateCouponEligibility({ ...base, max_uses: 0, used_count: 999 }, 100)).toEqual({
        ok: true,
      })
      expect(validateCouponEligibility({ ...base, max_uses: 5, used_count: 4 }, 100)).toEqual({
        ok: true,
      })
      expect(validateCouponEligibility({ ...base, max_uses: 5, used_count: 5 }, 100)).toEqual({
        ok: false,
        error: "El cupón ya fue utilizado el máximo de veces",
      })
    })
  })
})
