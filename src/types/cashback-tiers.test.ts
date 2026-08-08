import { describe, expect, it } from "vitest"
import { CASHBACK_TIERS } from "@/types"

const TIER_KEYS = Object.keys(CASHBACK_TIERS)
const TIER_VALUES = Object.values(CASHBACK_TIERS)

describe("CASHBACK_TIERS", () => {
  it("define exactamente 4 niveles (1-4)", () => {
    expect(TIER_KEYS).toEqual(["1", "2", "3", "4"])
  })

  it("nombres en orden esperado", () => {
    expect(TIER_VALUES.map((t) => t.name)).toEqual([
      "Verde",
      "Plata",
      "Oro",
      "Diamante",
    ])
  })

  it("pct es un porcentaje en rango (0, 100]", () => {
    for (const tier of TIER_VALUES) {
      expect(tier.pct).toBeGreaterThan(0)
      expect(tier.pct).toBeLessThanOrEqual(100)
    }
  })

  it("pct es estrictamente creciente con el nivel", () => {
    for (let i = 1; i < TIER_VALUES.length; i++) {
      expect(TIER_VALUES[i]!.pct).toBeGreaterThan(TIER_VALUES[i - 1]!.pct)
    }
  })

  it("los nombres son únicos", () => {
    expect(new Set(TIER_VALUES.map((t) => t.name)).size).toBe(4)
  })
})
