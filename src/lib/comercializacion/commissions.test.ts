import { describe, it, expect, afterEach } from "vitest"
import { getCommissionRate, formatMoney } from "./commissions"

afterEach(() => {
  delete process.env.SELLER_COMMISSION_RATE
})

describe("getCommissionRate", () => {
  it("devuelve 0.05 por defecto cuando no hay env var", () => {
    expect(getCommissionRate()).toBe(0.05)
  })

  it("usa la tasa configurada en SELLER_COMMISSION_RATE", () => {
    process.env.SELLER_COMMISSION_RATE = "0.08"
    expect(getCommissionRate()).toBe(0.08)
  })

  it("cae al default con valores inválidos", () => {
    process.env.SELLER_COMMISSION_RATE = "abc"
    expect(getCommissionRate()).toBe(0.05)
    process.env.SELLER_COMMISSION_RATE = "-0.5"
    expect(getCommissionRate()).toBe(0.05)
    process.env.SELLER_COMMISSION_RATE = ""
    expect(getCommissionRate()).toBe(0.05)
  })
})

describe("formatMoney", () => {
  it("formatea MXN con 2 decimales fijos", () => {
    expect(formatMoney(100)).toBe("$100.00")
    expect(formatMoney(1234.5)).toBe("$1,234.50")
    expect(formatMoney(0)).toBe("$0.00")
  })
})
