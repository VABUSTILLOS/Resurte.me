import { describe, expect, it } from "vitest"
import { cartItemUnitPrice } from "./cart-prices"

describe("cartItemUnitPrice (Ola 5)", () => {
  it("el precio especial del cliente manda sobre la oferta y el público", () => {
    expect(cartItemUnitPrice({ price: 100, sale_price: 90, customer_price: 80 })).toBe(80)
  })

  it("sin especial, la oferta vigente manda", () => {
    expect(cartItemUnitPrice({ price: 100, sale_price: 90, customer_price: null })).toBe(90)
    expect(cartItemUnitPrice({ price: 100, sale_price: 90 })).toBe(90)
  })

  it("sin especial ni oferta, el precio público", () => {
    expect(cartItemUnitPrice({ price: 100, sale_price: null, customer_price: null })).toBe(100)
    expect(cartItemUnitPrice({ price: 100, sale_price: null, customer_price: undefined })).toBe(100)
  })

  it("un especial en 0 no es válido como precio: cae al siguiente (?? no lo salta, pero 0 nunca se guarda)", () => {
    // customer_price solo se fija desde la BD con price > 0; si un
    // 0 llegara, `??` lo respetaría — por eso la guarda vive en
    // la lectura (use-customer-prices y fetchCustomerPrices).
    expect(cartItemUnitPrice({ price: 100, sale_price: null, customer_price: 0 })).toBe(0)
  })
})
