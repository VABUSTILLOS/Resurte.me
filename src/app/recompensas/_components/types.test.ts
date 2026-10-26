import { describe, expect, it } from "vitest"
import { TIER_BENEFITS, TIER_ORDER } from "./types"
import { FREE_SHIPPING_MXN, formatMxn } from "@/lib/commercial-facts"

/**
 * El envío gratis es universal desde `FREE_SHIPPING_MXN`. Un beneficio de nivel
 * que prometa un umbral más alto es una regresión: el cliente pagaría por un
 * nivel para recibir menos de lo que ya tiene. Este contrato lo impide.
 */
describe("beneficios de nivel", () => {
  const envioGratis = TIER_ORDER.flatMap((tier) =>
    TIER_BENEFITS[tier]
      .filter((benefit) => /env[ií]o gratis/i.test(benefit))
      .map((benefit) => ({ tier, benefit })),
  )

  it("ningún nivel promete envío gratis con un umbral mayor al universal", () => {
    const umbralUniversal = formatMxn(FREE_SHIPPING_MXN)
    for (const { tier, benefit } of envioGratis) {
      const umbral = benefit.match(/\$[\d,]+/)
      if (!umbral) continue
      const monto = Number(umbral[0].replace(/[$,]/g, ""))
      expect(
        monto,
        `${tier} promete "${benefit}" pero el envío ya es gratis desde ${umbralUniversal}`,
      ).toBeLessThanOrEqual(FREE_SHIPPING_MXN)
    }
  })

  it("el envío gratis aparece una sola vez por nivel", () => {
    for (const tier of TIER_ORDER) {
      const menciones = TIER_BENEFITS[tier].filter((b) => /env[ií]o gratis/i.test(b))
      expect(menciones.length, `${tier} repite el beneficio de envío`).toBeLessThanOrEqual(1)
    }
  })

  it("cada nivel declara al menos un beneficio y no repite cadenas", () => {
    for (const tier of TIER_ORDER) {
      const beneficios = TIER_BENEFITS[tier]
      expect(beneficios.length, `${tier} no declara beneficios`).toBeGreaterThan(0)
      expect(new Set(beneficios).size, `${tier} repite un beneficio`).toBe(beneficios.length)
    }
  })
})
