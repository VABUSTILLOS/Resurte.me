import { describe, expect, it } from "vitest"
import {
  FREE_SHIPPING_THRESHOLD,
  DELIVERY_FEE_FLAT,
  MAX_BUMPS,
  validDeliveryFee,
  calcCouponDiscount,
  freeShippingProgress,
} from "./checkout-config"

describe("checkout-config", () => {
  it("define constantes de envío gratis y bumps", () => {
    expect(FREE_SHIPPING_THRESHOLD).toBe(500)
    expect(DELIVERY_FEE_FLAT).toBe(35)
    expect(MAX_BUMPS).toBe(3)
  })

  describe("validDeliveryFee", () => {
    it("devuelve 0 sin artículos", () => {
      expect(validDeliveryFee(0, 100, 35)).toBe(0)
      expect(validDeliveryFee(0, 600, 35)).toBe(0)
    })

    it("devuelve 0 al alcanzar el umbral de envío gratis", () => {
      expect(validDeliveryFee(1, 500, 35)).toBe(0)
      expect(validDeliveryFee(1, 499.99, 35)).toBe(35)
    })

    it("acepta la tarifa fija o 0 (whitelist retrocompatible)", () => {
      expect(validDeliveryFee(2, 100, 35)).toBe(35)
      expect(validDeliveryFee(2, 100, 0)).toBe(0)
    })

    it("cae a la tarifa fija si recibe un valor inesperado", () => {
      expect(validDeliveryFee(2, 100, 12)).toBe(35)
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
    it("subtotal $499.99 → falta $0.01, no es gratis", () => {
      const p = freeShippingProgress(499.99)
      expect(p.isFree).toBe(false)
      expect(p.remaining).toBeCloseTo(0.01, 2)
      expect(p.message).toBe("Agrega $0.01 más para envío gratis")
      expect(p.percent).toBeLessThan(100)
    })

    it("subtotal $500 → envío gratis", () => {
      const p = freeShippingProgress(500)
      expect(p.isFree).toBe(true)
      expect(p.remaining).toBe(0)
      expect(p.message).toBe("🎉 Tienes envío gratis")
      expect(p.percent).toBe(100)
    })

    it("subtotal muy alto se acota a 100%", () => {
      expect(freeShippingProgress(900).percent).toBe(100)
      expect(freeShippingProgress(900).isFree).toBe(true)
    })

    it("subtotal vacío muestra el umbral completo", () => {
      const p = freeShippingProgress(0)
      expect(p.remaining).toBe(500)
      expect(p.percent).toBe(0)
      expect(p.message).toBe("Agrega $500.00 más para envío gratis")
    })
  })
})
