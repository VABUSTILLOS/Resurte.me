import { describe, expect, it } from "vitest"
import {
  DEFAULT_LOW_STOCK_THRESHOLD,
  deriveStockStatus,
  isStockStatus,
  resolveLowStockThreshold,
  resolveSubmittedStockStatus,
} from "./stock"

describe("resolveLowStockThreshold", () => {
  it("acepta enteros ≥ 0", () => {
    expect(resolveLowStockThreshold(0)).toBe(0)
    expect(resolveLowStockThreshold(12)).toBe(12)
  })

  it("cae al valor por defecto con cualquier otra cosa", () => {
    expect(resolveLowStockThreshold(null)).toBe(DEFAULT_LOW_STOCK_THRESHOLD)
    expect(resolveLowStockThreshold(undefined)).toBe(DEFAULT_LOW_STOCK_THRESHOLD)
    expect(resolveLowStockThreshold(-1)).toBe(DEFAULT_LOW_STOCK_THRESHOLD)
    expect(resolveLowStockThreshold(2.5)).toBe(DEFAULT_LOW_STOCK_THRESHOLD)
    expect(resolveLowStockThreshold("7")).toBe(DEFAULT_LOW_STOCK_THRESHOLD)
    expect(resolveLowStockThreshold(Number.NaN)).toBe(DEFAULT_LOW_STOCK_THRESHOLD)
  })
})

describe("deriveStockStatus", () => {
  it("sin control de inventario el producto queda disponible", () => {
    expect(deriveStockStatus(null)).toBe("in_stock")
    expect(deriveStockStatus(undefined)).toBe("in_stock")
  })

  it("cero o menos unidades es agotado", () => {
    expect(deriveStockStatus(0)).toBe("out_of_stock")
    expect(deriveStockStatus(-3)).toBe("out_of_stock")
  })

  it("hasta el umbral es stock bajo y por encima es disponible", () => {
    expect(deriveStockStatus(1, 5)).toBe("low_stock")
    expect(deriveStockStatus(5, 5)).toBe("low_stock")
    expect(deriveStockStatus(6, 5)).toBe("in_stock")
  })

  it("usa el umbral por defecto cuando no hay uno válido", () => {
    expect(deriveStockStatus(5, null)).toBe("low_stock")
    expect(deriveStockStatus(6, null)).toBe("in_stock")
  })
})

describe("resolveSubmittedStockStatus", () => {
  it("sin unidades manda la selección manual y no se marca como derivada", () => {
    expect(resolveSubmittedStockStatus(null, 5, "out_of_stock")).toEqual({
      status: "out_of_stock",
      derived: false,
    })
  })

  it("con unidades el estado se deriva del umbral e ignora la selección manual", () => {
    expect(resolveSubmittedStockStatus(50, 5, "out_of_stock")).toEqual({
      status: "in_stock",
      derived: true,
    })
    expect(resolveSubmittedStockStatus(3, 5, "in_stock")).toEqual({
      status: "low_stock",
      derived: true,
    })
    expect(resolveSubmittedStockStatus(0, 5, "in_stock")).toEqual({
      status: "out_of_stock",
      derived: true,
    })
  })

  it("respeta el umbral capturado al derivar", () => {
    expect(resolveSubmittedStockStatus(10, 10, "in_stock")).toEqual({
      status: "low_stock",
      derived: true,
    })
    expect(resolveSubmittedStockStatus(10, 20, "out_of_stock")).toEqual({
      status: "low_stock",
      derived: true,
    })
  })

  it("unidades inválidas no cuentan como control de inventario", () => {
    expect(resolveSubmittedStockStatus(2.5, 5, "low_stock")).toEqual({
      status: "low_stock",
      derived: false,
    })
    expect(resolveSubmittedStockStatus(-3, 5, "in_stock")).toEqual({
      status: "in_stock",
      derived: false,
    })
    expect(resolveSubmittedStockStatus(Number.NaN, 5, "out_of_stock")).toEqual({
      status: "out_of_stock",
      derived: false,
    })
  })
})

describe("isStockStatus", () => {
  it("reconoce solo los tres estados guardables", () => {
    expect(isStockStatus("in_stock")).toBe(true)
    expect(isStockStatus("low_stock")).toBe(true)
    expect(isStockStatus("out_of_stock")).toBe(true)
    expect(isStockStatus("agotado")).toBe(false)
    expect(isStockStatus(null)).toBe(false)
    expect(isStockStatus(3)).toBe(false)
  })
})
