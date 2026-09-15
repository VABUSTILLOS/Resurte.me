import { describe, expect, it } from "vitest"
import { FREE_SHIPPING_MXN } from "./commercial-facts"
import {
  FREE_SHIPPING_THRESHOLD,
  DELIVERY_FEE_FLAT,
  MAX_BUMPS,
  validDeliveryFee,
  calcCouponDiscount,
  freeShippingProgress,
  calcCheckoutTotals,
} from "./checkout-config"

describe("checkout-config", () => {
  it("el umbral por defecto sale de la fuente de verdad comercial", () => {
    // Sin override en env, el importe que se cobra debe ser el mismo que el
    // sitio publica (FREE_SHIPPING_MXN en commercial-facts.ts).
    const override = process.env.NEXT_PUBLIC_FREE_SHIPPING_THRESHOLD
    expect(FREE_SHIPPING_THRESHOLD).toBe(override ? Number(override) : FREE_SHIPPING_MXN)
    expect(DELIVERY_FEE_FLAT).toBe(125)
    expect(MAX_BUMPS).toBe(3)
  })

  describe("validDeliveryFee", () => {
    it("devuelve 0 sin artículos", () => {
      expect(validDeliveryFee(0, 100, 125)).toBe(0)
      expect(validDeliveryFee(0, FREE_SHIPPING_THRESHOLD + 100, 125)).toBe(0)
    })

    it("devuelve 0 al alcanzar el umbral de envío gratis", () => {
      expect(validDeliveryFee(1, FREE_SHIPPING_THRESHOLD, 125)).toBe(0)
      expect(validDeliveryFee(1, FREE_SHIPPING_THRESHOLD - 0.01, 125)).toBe(125)
    })

    it("acepta la tarifa fija o 0 (whitelist retrocompatible)", () => {
      expect(validDeliveryFee(2, 100, 125)).toBe(125)
      expect(validDeliveryFee(2, 100, 0)).toBe(0)
    })

    it("cae a la tarifa fija si recibe un valor inesperado", () => {
      expect(validDeliveryFee(2, 100, 12)).toBe(125)
    })
  })

  describe("calcCouponDiscount", () => {
    const pctCoupon = { discount_type: "percentage", discount_value: 10, min_order: 0 }
    const fixedCoupon = { discount_type: "fixed_amount", discount_value: 100, min_order: 0 }

    it("devuelve 0 sin cupón", () => {
      expect(calcCouponDiscount(250, null)).toBe(0)
    })

    it("aplica porcentaje con redondeo a 2 decimales", () => {
      expect(calcCouponDiscount(250.33, pctCoupon)).toBe(25.03)
    })

    it("aplica monto fijo acotado al subtotal", () => {
      expect(calcCouponDiscount(250, fixedCoupon)).toBe(100)
      expect(calcCouponDiscount(50, fixedCoupon)).toBe(50)
    })

    it("respeta el pedido mínimo", () => {
      const minCoupon = { discount_type: "percentage", discount_value: 10, min_order: 500 }
      expect(calcCouponDiscount(400, minCoupon)).toBe(0)
      expect(calcCouponDiscount(500, minCoupon)).toBe(50)
    })

    it("aplica el descuento sobre el subtotal con bumps incluido (fórmula del servidor)", () => {
      // Carrito $420 + bump $80 → subtotal efectivo $500 → 10% = $50
      expect(calcCouponDiscount(420 + 80, pctCoupon)).toBe(50)
    })
  })

  describe("freeShippingProgress (barra de envío gratis)", () => {
    it("un centavo por debajo del umbral → falta $0.01, no es gratis", () => {
      const p = freeShippingProgress(FREE_SHIPPING_THRESHOLD - 0.01)
      expect(p.isFree).toBe(false)
      expect(p.remaining).toBeCloseTo(0.01, 2)
      expect(p.message).toBe("Agrega $0.01 más para envío gratis")
      expect(p.percent).toBeLessThan(100)
    })

    it("alcanzar el umbral → envío gratis", () => {
      const p = freeShippingProgress(FREE_SHIPPING_THRESHOLD)
      expect(p.isFree).toBe(true)
      expect(p.remaining).toBe(0)
      expect(p.message).toBe("🎉 Tienes envío gratis")
      expect(p.percent).toBe(100)
    })

    it("subtotal muy alto se acota a 100%", () => {
      expect(freeShippingProgress(FREE_SHIPPING_THRESHOLD + 1000).percent).toBe(100)
      expect(freeShippingProgress(FREE_SHIPPING_THRESHOLD + 1000).isFree).toBe(true)
    })

    it("subtotal vacío muestra el umbral completo", () => {
      const p = freeShippingProgress(0)
      expect(p.remaining).toBe(FREE_SHIPPING_THRESHOLD)
      expect(p.percent).toBe(0)
      expect(p.message).toBe(`Agrega $${FREE_SHIPPING_THRESHOLD.toFixed(2)} más para envío gratis`)
    })
  })

  describe("calcCheckoutTotals (fuente única de totales con bumps + cupón)", () => {
    const pctCoupon = { discount_type: "percentage", discount_value: 10, min_order: 0 }

    it("sin bumps ni cupón: subtotal + tarifa fija", () => {
      const t = calcCheckoutTotals(420, 0, null, 3, 0)
      expect(t.bumpsSubtotal).toBe(0)
      expect(t.effectiveSubtotal).toBe(420)
      expect(t.discountAmount).toBe(0)
      expect(t.payableSubtotal).toBe(420)
      expect(t.allItemsCount).toBe(3)
      expect(t.deliveryFee).toBe(125)
      expect(t.total).toBe(545)
    })

    it("aplica el cupón sobre subtotal + bumps (fórmula del servidor)", () => {
      // Carrito $420 + bump $80 = $500 efectivo → 10% = $50 → pagable $450.
      const t = calcCheckoutTotals(420, 80, pctCoupon, 3, 1)
      expect(t.discountAmount).toBe(50)
      expect(t.payableSubtotal).toBe(450)
      expect(t.allItemsCount).toBe(4)
      // Con $450 pagable sigue pagando envío.
      expect(t.deliveryFee).toBe(125)
      expect(t.total).toBe(575)
    })

    it("alcanzar el umbral da envío gratis", () => {
      const free = calcCheckoutTotals(FREE_SHIPPING_THRESHOLD, 0, null, 4, 0)
      expect(free.deliveryFee).toBe(0)
      expect(free.total).toBe(FREE_SHIPPING_THRESHOLD)
    })

    it("un cupón puede dejar el pagable por debajo del umbral (y volver a cobrar envío)", () => {
      const t = calcCheckoutTotals(FREE_SHIPPING_THRESHOLD, 0, pctCoupon, 4, 0)
      expect(t.discountAmount).toBe(FREE_SHIPPING_THRESHOLD * 0.1)
      expect(t.payableSubtotal).toBe(FREE_SHIPPING_THRESHOLD * 0.9)
      expect(t.deliveryFee).toBe(125)
    })

    it("cuenta bumps en itemCount para el envío gratis", () => {
      // El umbral se evalúa sobre el pagable, que incluye bumps: sin el bump
      // falta envío, con el bump se alcanza el umbral.
      const base = FREE_SHIPPING_THRESHOLD - 40
      const sinBump = calcCheckoutTotals(base, 0, null, 3, 0)
      expect(sinBump.deliveryFee).toBe(125)

      const t = calcCheckoutTotals(base, 40, null, 3, 1)
      expect(t.payableSubtotal).toBe(FREE_SHIPPING_THRESHOLD)
      expect(t.deliveryFee).toBe(0)
      expect(t.total).toBe(FREE_SHIPPING_THRESHOLD)
    })

    it("envío a 0 explícito se respeta (retrocompatible)", () => {
      const t = calcCheckoutTotals(100, 0, null, 1, 0, 0)
      expect(t.deliveryFee).toBe(0)
      expect(t.total).toBe(100)
    })

    it("consistencia: descuento redondeado a 2 decimales", () => {
      const t = calcCheckoutTotals(250.33, 0, pctCoupon, 2, 0)
      expect(t.discountAmount).toBe(25.03)
      expect(t.payableSubtotal).toBeCloseTo(225.3, 2)
    })
  })
})
