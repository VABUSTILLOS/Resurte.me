import { describe, it, expect } from "vitest"
import {
  normalizeSku,
  validateSku,
  validateBarcode,
  SKU_MAX_LENGTH,
} from "./sku"
import {
  deriveStockStatus,
  resolveLowStockThreshold,
  isStockStatus,
  DEFAULT_LOW_STOCK_THRESHOLD,
} from "./stock"

describe("normalizeSku / validateSku", () => {
  it("recorta y convierte espacios internos en guiones", () => {
    expect(normalizeSku("  agua 600 ")).toBe("agua-600")
    expect(normalizeSku("   ")).toBeNull()
    expect(normalizeSku(42)).toBeNull()
  })

  it("acepta SKU válidos y null", () => {
    expect(validateSku("AGUA-600")).toEqual({ ok: true, value: "AGUA-600" })
    expect(validateSku("")).toEqual({ ok: true, value: null })
    expect(validateSku(null)).toEqual({ ok: true, value: null })
    expect(validateSku("a/b_c.d-1")).toEqual({ ok: true, value: "a/b_c.d-1" })
  })

  it("rechaza SKU inválidos", () => {
    expect(validateSku(12).ok).toBe(false)
    expect(validateSku("-inicio").ok).toBe(false)
    expect(validateSku("con espacio!" ).ok).toBe(false)
    expect(validateSku("x".repeat(SKU_MAX_LENGTH + 1)).ok).toBe(false)
  })
})

describe("validateBarcode", () => {
  it("acepta longitudes EAN/UPC y limpia separadores", () => {
    expect(validateBarcode("7501234567890")).toEqual({
      ok: true,
      value: "7501234567890",
    })
    expect(validateBarcode("750 1234 567890")).toEqual({
      ok: true,
      value: "7501234567890",
    })
    expect(validateBarcode("  ")).toEqual({ ok: true, value: null })
    expect(validateBarcode(null)).toEqual({ ok: true, value: null })
  })

  it("rechaza no numéricos y longitudes raras", () => {
    expect(validateBarcode("750ABC").ok).toBe(false)
    expect(validateBarcode("12345").ok).toBe(false)
  })
})

describe("stock derivado del umbral", () => {
  it("usa 5 por defecto", () => {
    expect(DEFAULT_LOW_STOCK_THRESHOLD).toBe(5)
    expect(resolveLowStockThreshold(null)).toBe(5)
    expect(resolveLowStockThreshold(-1)).toBe(5)
    expect(resolveLowStockThreshold(2.5)).toBe(5)
    expect(resolveLowStockThreshold(0)).toBe(0)
    expect(resolveLowStockThreshold(12)).toBe(12)
  })

  it("deriva in/low/out según cantidad y umbral", () => {
    expect(deriveStockStatus(0)).toBe("out_of_stock")
    expect(deriveStockStatus(3)).toBe("low_stock")
    expect(deriveStockStatus(6)).toBe("in_stock")
    expect(deriveStockStatus(6, 10)).toBe("low_stock")
    expect(deriveStockStatus(3, 0)).toBe("in_stock")
  })

  it("null = sin control de inventario", () => {
    expect(deriveStockStatus(null)).toBe("in_stock")
    expect(deriveStockStatus(undefined, 10)).toBe("in_stock")
  })

  it("isStockStatus valida el literal", () => {
    expect(isStockStatus("low_stock")).toBe(true)
    expect(isStockStatus("agotado")).toBe(false)
    expect(isStockStatus(3)).toBe(false)
  })
})
