import { describe, it, expect } from "vitest"
import { buildRestockSuggestions } from "./restock"

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
