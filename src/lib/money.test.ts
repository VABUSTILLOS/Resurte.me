import { describe, expect, it } from "vitest"
import { applyDiscount, formatMoney, formatNumber, round2 } from "@/lib/money"

describe("round2", () => {
  it("redondea a 2 decimales", () => {
    expect(round2(10.005)).toBe(10.01)
    expect(round2(100.5)).toBe(100.5)
    expect(round2(1.004)).toBe(1)
    expect(round2(0)).toBe(0)
  })
})

describe("applyDiscount", () => {
  it("aplica descuento porcentual y redondea", () => {
    expect(applyDiscount(100, 0.1)).toBe(90)
    expect(applyDiscount(99.99, 0.15)).toBe(84.99)
    expect(applyDiscount(50, 0)).toBe(50)
    expect(applyDiscount(100, 1)).toBe(0)
  })
})

describe("formatMoney", () => {
  it("formatea montos enteros sin decimales (estilo foodos)", () => {
    expect(formatMoney(100)).toBe("$100")
    expect(formatMoney(0)).toBe("$0")
    expect(formatMoney(5)).toBe("$5")
  })

  it("formatea montos fraccionarios con 2 decimales", () => {
    expect(formatMoney(100.5)).toBe("$100.50")
    expect(formatMoney(0.05)).toBe("$0.05")
  })

  it("respeta currency", () => {
    const usd = formatMoney(100, "USD")
    expect(usd).not.toBe("$100") // no confunde el símbolo MXN
    expect(usd).toMatch(/100/) // monto siempre presente
  })

  it("soporta decimales fijos (estilo commissions)", () => {
    expect(formatMoney(100, "MXN", { minDecimals: 2, maxDecimals: 2 })).toBe("$100.00")
  })
})

describe("formatNumber", () => {
  it("aplica separadores de miles es-MX", () => {
    expect(formatNumber(1234567)).toBe("1,234,567")
    expect(formatNumber(0)).toBe("0")
  })
})
