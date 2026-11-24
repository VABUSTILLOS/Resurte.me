import { describe, expect, it } from "vitest"
import {
  COUPON_DISCOUNT_TYPES,
  FREE_SHIPPING_TYPE,
  evaluateAutomaticDiscounts,
  isFreeShippingCoupon,
  parseBundleRuleConfig,
  parseBuyXGetYRuleConfig,
  validateCouponEligibility,
  type AutomaticDiscountRuleRow,
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

  describe("descuentos automáticos (evaluateAutomaticDiscounts)", () => {
    const rule = (
      partial: Partial<AutomaticDiscountRuleRow>
    ): AutomaticDiscountRuleRow => ({
      id: "r1",
      name: "Regla",
      rule_type: "bundle",
      is_active: true,
      config: {},
      ...partial,
    })

    const bundlePct = rule({
      name: "Paquete parrillero -10%",
      config: {
        items: [
          { product_id: 1, qty: 1 },
          { product_id: 2, qty: 2 },
        ],
        discount_type: "percentage",
        discount_value: 10,
      },
    })

    it("bundle porcentual: aplica sobre el valor del paquete cuando está completo", () => {
      // Paquete: 1×$200 + 2×$50 = $300 → 10% = $30.
      const quote = evaluateAutomaticDiscounts([bundlePct], [
        { product_id: 1, quantity: 1, unit_price: 200 },
        { product_id: 2, quantity: 2, unit_price: 50 },
        { product_id: 3, quantity: 1, unit_price: 999 },
      ])
      expect(quote.discountAmount).toBe(30)
      expect(quote.applied).toEqual([
        { rule_id: "r1", name: "Paquete parrillero -10%", amount: 30 },
      ])
    })

    it("bundle: no aplica si falta un producto o cantidad", () => {
      const quote = evaluateAutomaticDiscounts([bundlePct], [
        { product_id: 1, quantity: 1, unit_price: 200 },
        { product_id: 2, quantity: 1, unit_price: 50 },
      ])
      expect(quote.discountAmount).toBe(0)
      expect(quote.applied).toEqual([])
    })

    it("bundle de monto fijo: se topa al valor del paquete", () => {
      const fixed = rule({
        config: {
          items: [{ product_id: 1, qty: 1 }],
          discount_type: "fixed_amount",
          discount_value: 500,
        },
      })
      const quote = evaluateAutomaticDiscounts([fixed], [
        { product_id: 1, quantity: 1, unit_price: 120 },
      ])
      expect(quote.discountAmount).toBe(120)
    })

    it("buy_x_get_y entre productos: por cada X de A, Y de B gratis", () => {
      const bxgy = rule({
        rule_type: "buy_x_get_y",
        name: "Compra 2 salsas, llévate 1 totopos",
        config: {
          buy_product_id: 1,
          buy_qty: 2,
          get_product_id: 2,
          get_qty: 1,
          discount_pct: 100,
        },
      })
      // 5 salsas → 2 juegos → 2 totopos gratis, pero solo hay 1 en el carrito.
      const quote = evaluateAutomaticDiscounts([bxgy], [
        { product_id: 1, quantity: 5, unit_price: 40 },
        { product_id: 2, quantity: 1, unit_price: 25 },
      ])
      expect(quote.discountAmount).toBe(25)
    })

    it("buy_x_get_y mismo producto: grupos de X+Y, las regaladas salen del pool", () => {
      const bxgy = rule({
        rule_type: "buy_x_get_y",
        config: {
          buy_product_id: 1,
          buy_qty: 2,
          get_product_id: 1,
          get_qty: 1,
          discount_pct: 100,
        },
      })
      // 7 unidades → 2 grupos de 3 → 2 gratis.
      const quote = evaluateAutomaticDiscounts([bxgy], [
        { product_id: 1, quantity: 7, unit_price: 30 },
      ])
      expect(quote.discountAmount).toBe(60)
    })

    it("buy_x_get_y con descuento parcial (50%)", () => {
      const bxgy = rule({
        rule_type: "buy_x_get_y",
        config: {
          buy_product_id: 1,
          buy_qty: 1,
          get_product_id: 2,
          get_qty: 1,
          discount_pct: 50,
        },
      })
      const quote = evaluateAutomaticDiscounts([bxgy], [
        { product_id: 1, quantity: 1, unit_price: 10 },
        { product_id: 2, quantity: 1, unit_price: 80 },
      ])
      expect(quote.discountAmount).toBe(40)
    })

    it("reglas inactivas o con config inválida se ignoran", () => {
      const inactive = rule({ is_active: false, config: bundlePct.config })
      const broken = rule({ id: "r2", config: { items: "nope" } })
      const quote = evaluateAutomaticDiscounts([inactive, broken], [
        { product_id: 1, quantity: 1, unit_price: 200 },
        { product_id: 2, quantity: 2, unit_price: 50 },
      ])
      expect(quote.discountAmount).toBe(0)
    })

    it("varias reglas se suman y el total se topa al subtotal", () => {
      const big = rule({
        id: "r9",
        config: {
          items: [{ product_id: 1, qty: 1 }],
          discount_type: "fixed_amount",
          discount_value: 10_000,
        },
      })
      const quote = evaluateAutomaticDiscounts([bundlePct, big], [
        { product_id: 1, quantity: 1, unit_price: 200 },
        { product_id: 2, quantity: 2, unit_price: 50 },
      ])
      // bundle $30 + fijo topado al paquete $200 = $230 ≤ subtotal $300.
      expect(quote.discountAmount).toBe(230)
    })

    it("parseo de configs: rechaza formas inválidas", () => {
      expect(parseBundleRuleConfig(null)).toBeNull()
      expect(parseBundleRuleConfig({ items: [] })).toBeNull()
      expect(
        parseBundleRuleConfig({
          items: [{ product_id: 1, qty: 1 }],
          discount_type: "percentage",
          discount_value: 150,
        })
      ).toBeNull()
      expect(
        parseBuyXGetYRuleConfig({ buy_product_id: 1, buy_qty: 0, get_product_id: 2, get_qty: 1, discount_pct: 100 })
      ).toBeNull()
      expect(
        parseBuyXGetYRuleConfig({ buy_product_id: 1, buy_qty: 2, get_product_id: 1, get_qty: 1, discount_pct: 100 })
      ).toEqual({ buy_product_id: 1, buy_qty: 2, get_product_id: 1, get_qty: 1, discount_pct: 100 })
    })
  })
})
