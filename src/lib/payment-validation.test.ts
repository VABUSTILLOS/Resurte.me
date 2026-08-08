import { describe, expect, it } from "vitest"
import {
  toCents,
  isAmountSufficient,
  getCashbackTier,
  calculateCashbackAmount,
} from "@/lib/payment-validation"

describe("toCents", () => {
  it("convierte pesos a centavos", () => {
    expect(toCents(100)).toBe(10000)
    expect(toCents(149.99)).toBe(14999)
  })

  it("convierte strings numéricos", () => {
    expect(toCents("250.5")).toBe(25050)
  })

  it("maneja null/undefined como 0", () => {
    expect(toCents(null)).toBe(0)
    expect(toCents(undefined)).toBe(0)
  })

  it("redondea correctamente (evita errores de punto flotante)", () => {
    expect(toCents(0.1 + 0.2)).toBe(30)
    expect(toCents(123.456)).toBe(12346)
  })
})

describe("isAmountSufficient", () => {
  it("acepta monto exacto", () => {
    expect(isAmountSufficient(10000, 100)).toBe(true)
  })

  it("acepta monto mayor (propina/ajuste)", () => {
    expect(isAmountSufficient(10500, 100)).toBe(true)
  })

  it("rechaza monto menor", () => {
    expect(isAmountSufficient(9999, 100)).toBe(false)
  })

  it("rechaza intentos manipulados (monto muy bajo)", () => {
    expect(isAmountSufficient(1, 5000)).toBe(false)
  })

  it("maneja total null (fail-closed)", () => {
    expect(isAmountSufficient(100, null)).toBe(false)
  })
})

describe("getCashbackTier", () => {
  it("0 y 1 semanas → Verde 5%", () => {
    expect(getCashbackTier(0)).toEqual({ name: "Verde", pct: 0.05 })
    expect(getCashbackTier(1)).toEqual({ name: "Verde", pct: 0.05 })
  })

  it("2 semanas → Plata 10%", () => {
    expect(getCashbackTier(2)).toEqual({ name: "Plata", pct: 0.1 })
  })

  it("3 semanas → Oro 15%", () => {
    expect(getCashbackTier(3)).toEqual({ name: "Oro", pct: 0.15 })
  })

  it("4+ semanas → Diamante 20%", () => {
    expect(getCashbackTier(4)).toEqual({ name: "Diamante", pct: 0.2 })
    expect(getCashbackTier(10)).toEqual({ name: "Diamante", pct: 0.2 })
  })

  it("no acepta semanas negativas (no puede bajar de Verde)", () => {
    expect(getCashbackTier(-3).name).toBe("Verde")
  })
})

describe("calculateCashbackAmount", () => {
  it("redondea a 2 decimales", () => {
    // 5% de 1234.56 = 61.728 → 61.73
    expect(calculateCashbackAmount(1234.56, 0)).toBe(61.73)
  })

  it("aplica el porcentaje del nivel correspondiente", () => {
    expect(calculateCashbackAmount(1000, 1)).toBe(50)   // Verde 5%
    expect(calculateCashbackAmount(1000, 2)).toBe(100)  // Plata 10%
    expect(calculateCashbackAmount(1000, 3)).toBe(150)  // Oro 15%
    expect(calculateCashbackAmount(1000, 4)).toBe(200)  // Diamante 20%
  })
})
