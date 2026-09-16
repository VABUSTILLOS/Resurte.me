import { describe, it, expect } from "vitest"
import { buildRestockSuggestions, suggestRestockQuantity } from "./restock"

// Espejo de la función interna (no exportada): peso por estado + piezas vendidas.
// Si la implementación cambia, este test debe actualizarse.
const STATUS_WEIGHT: Record<string, number> = { out_of_stock: 100, low_stock: 50, in_stock: 0 }
const restockPriority = (stockStatus: string, units30d: number) =>
  (STATUS_WEIGHT[stockStatus] ?? 0) + Math.max(0, units30d)

describe("restockPriority", () => {
  it("agotado pesa más que stock bajo, in_stock no pesa", () => {
    expect(restockPriority("out_of_stock", 0)).toBeGreaterThan(restockPriority("low_stock", 0))
    expect(restockPriority("in_stock", 100)).toBe(100) // peso 0 + ventas
  })

  it("suma las ventas de 30 d", () => {
    expect(restockPriority("low_stock", 10)).toBe(60)
  })
})

describe("buildRestockSuggestions", () => {
  const candidates = [
    { productId: 1, name: "Agua 1L", stockStatus: "out_of_stock" as const, units30d: 50 },
    { productId: 2, name: "Pan", stockStatus: "low_stock" as const, units30d: 80 },
    { productId: 3, name: "Sal", stockStatus: "in_stock" as const, units30d: 500 },
    { productId: 4, name: "Charol", stockStatus: "out_of_stock" as const, units30d: 0 },
    { productId: 5, name: "Aceite", stockStatus: "low_stock" as const, units30d: 5 },
  ]

  it("excluye in_stock y productos sin ventas", () => {
    const ids = buildRestockSuggestions(candidates).map((s) => s.productId)
    expect(ids).not.toContain(3)
    expect(ids).not.toContain(4)
  })

  it("ordena por prioridad descendente", () => {
    const ids = buildRestockSuggestions(candidates).map((s) => s.productId)
    // agua: 100+50=150 · pan: 50+80=130 · aceite: 50+5=55
    expect(ids).toEqual([1, 2, 5])
  })

  it("respeta el límite", () => {
    expect(buildRestockSuggestions(candidates, 2)).toHaveLength(2)
  })

  it("incluye razón legible", () => {
    const [top] = buildRestockSuggestions(candidates)
    expect(top!.reason).toContain("Agotado")
    expect(top!.reason).toContain("50 vendidas en 30 d")
  })
})

describe("umbral por producto (00108)", () => {
  it("usa el umbral del producto, no el 5 fijo", () => {
    // 8 piezas es stock bajo si el umbral es 10, aunque el defecto sea 5.
    const [s] = buildRestockSuggestions([
      { productId: 1, name: "Café", stockStatus: "in_stock", units30d: 40, stockQuantity: 8, lowStockThreshold: 10 },
    ])
    expect(s!.effectiveStatus).toBe("low_stock")
    expect(s!.threshold).toBe(10)
  })

  it("reclasifica como in_stock y descarta si la existencia supera el umbral", () => {
    expect(
      buildRestockSuggestions([
        { productId: 1, name: "Café", stockStatus: "low_stock", units30d: 40, stockQuantity: 30, lowStockThreshold: 10 },
      ])
    ).toHaveLength(0)
  })

  it("cae al umbral por defecto si el producto no lo define", () => {
    const [s] = buildRestockSuggestions([
      { productId: 1, name: "Café", stockStatus: "low_stock", units30d: 40, stockQuantity: 4 },
    ])
    expect(s!.threshold).toBe(5)
  })

  it("respeta el estado guardado cuando no hay control de inventario", () => {
    const [s] = buildRestockSuggestions([
      { productId: 1, name: "Café", stockStatus: "out_of_stock", units30d: 12, stockQuantity: null },
    ])
    expect(s!.effectiveStatus).toBe("out_of_stock")
  })
})

describe("suggestRestockQuantity", () => {
  it("cubre 14 días de demanda al ritmo de 30 días, descontando existencia", () => {
    // 60/mes = 2/día → 28 en 14 días; con 10 en existencia, pedir 18.
    expect(suggestRestockQuantity(60, 10)).toBe(18)
  })

  it("no sugiere cantidades negativas", () => {
    expect(suggestRestockQuantity(10, 500)).toBe(0)
    expect(suggestRestockQuantity(0, 0)).toBe(0)
  })

  it("trata la existencia nula como 0", () => {
    expect(suggestRestockQuantity(30, null)).toBe(14)
  })

  it("acepta un horizonte de cobertura distinto", () => {
    expect(suggestRestockQuantity(60, 0, 30)).toBe(60)
  })

  it("aparece en la razón y en la sugerencia", () => {
    const [s] = buildRestockSuggestions([
      { productId: 1, name: "Agua", stockStatus: "out_of_stock", units30d: 60, stockQuantity: 0 },
    ])
    expect(s!.suggestedQuantity).toBe(28)
    expect(s!.reason).toContain("pedir 28")
  })
})
