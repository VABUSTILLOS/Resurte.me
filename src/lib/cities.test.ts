import { describe, expect, it } from "vitest"

import {
  ACTIVE_CITIES,
  CITIES_BY_STATE,
  COMING_SOON_CITIES,
  DEFAULT_CITY_SLUG,
  MEXICO_CITIES,
  isCityActive,
  resolveActiveCitySlug,
} from "./cities"

describe("cobertura de ciudades", () => {
  it("hoy solo Chihuahua tiene operación activa", () => {
    expect(ACTIVE_CITIES).toHaveLength(1)
    expect(ACTIVE_CITIES[0]?.slug).toBe("chihuahua")
    expect(ACTIVE_CITIES[0]?.state).toBe("Chihuahua")
  })

  it("las demás ciudades quedan como próximamente", () => {
    expect(COMING_SOON_CITIES).toHaveLength(MEXICO_CITIES.length - 1)
    expect(COMING_SOON_CITIES.every((city) => !city.is_active)).toBe(true)
    expect(COMING_SOON_CITIES.some((city) => city.slug === "cdmx")).toBe(true)
  })

  it("mantiene el catálogo completo para el selector", () => {
    expect(MEXICO_CITIES).toHaveLength(20)
    expect(Object.keys(CITIES_BY_STATE).length).toBeGreaterThan(1)
  })

  it("resuelve cobertura por slug", () => {
    expect(isCityActive(DEFAULT_CITY_SLUG)).toBe(true)
    expect(isCityActive("cdmx")).toBe(false)
    expect(isCityActive("no-existe")).toBe(false)
  })

  it("normaliza slugs sin cobertura a Chihuahua", () => {
    expect(resolveActiveCitySlug("cdmx")).toBe(DEFAULT_CITY_SLUG)
    expect(resolveActiveCitySlug(null)).toBe(DEFAULT_CITY_SLUG)
    expect(resolveActiveCitySlug("chihuahua")).toBe("chihuahua")
  })
})
