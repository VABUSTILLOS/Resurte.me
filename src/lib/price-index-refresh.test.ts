import { describe, expect, it } from "vitest"
import { PRICE_INDEX_POR_CIUDAD, isIsoDate, refreshPriceIndex } from "./price-index-refresh"

describe("isIsoDate", () => {
  it("acepta una fecha ISO válida", () => {
    expect(isIsoDate("2026-03-02")).toBe(true)
  })

  it("rechaza el formato equivocado", () => {
    expect(isIsoDate("02/03/2026")).toBe(false)
    expect(isIsoDate("2026-3-2")).toBe(false)
    expect(isIsoDate("2026-03-02T12:00:00Z")).toBe(false)
    expect(isIsoDate("")).toBe(false)
  })

  it("rechaza días y meses fuera de rango", () => {
    expect(isIsoDate("2026-13-01")).toBe(false)
    expect(isIsoDate("2026-02-30")).toBe(false)
    expect(isIsoDate("2026-00-10")).toBe(false)
  })

  it("acepta el 29 de febrero de un año bisiesto", () => {
    expect(isIsoDate("2024-02-29")).toBe(true)
    expect(isIsoDate("2026-02-29")).toBe(false)
  })
})

describe("refreshPriceIndex", () => {
  it("rechaza una fecha mal formada antes de tocar la base de datos", async () => {
    await expect(refreshPriceIndex({ fecha: "hoy" })).rejects.toThrow(/Fecha inválida/)
  })

  it("publica como máximo el tope de insumos por ciudad", () => {
    // El tope vive en el código (y la migración lo recibe como parámetro):
    // un cambio accidental publicaría un snapshot gigante.
    expect(PRICE_INDEX_POR_CIUDAD).toBe(300)
  })
})
