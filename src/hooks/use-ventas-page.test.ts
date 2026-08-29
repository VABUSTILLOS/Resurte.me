import { describe, expect, it } from "vitest"
import { computeDeductions, type InventoryItemLike } from "./use-ventas-page"

const inventario: InventoryItemLike[] = [
  { id: "i1", name: "Tortilla", stock: 100, minStock: 20, unit: "pza", pricePerUnit: 2 },
  { id: "i2", name: "Carne de res", stock: 5, minStock: 1, unit: "kg", pricePerUnit: 180 },
  { id: "i3", name: "Queso", stock: 3000, minStock: 500, unit: "g", pricePerUnit: 0.2 },
]

describe("computeDeductions", () => {
  it("matches ingredients to inventory items by normalized name", () => {
    const d = computeDeductions(
      [{ ingredientName: "Tortilla", quantity: 3, unit: "pza" }],
      2,
      inventario,
    )
    expect(d.get("i1")?.neededQty).toBe(6)
  })

  it("normalizes case and whitespace when matching names", () => {
    const d = computeDeductions(
      [{ ingredientName: "  CARNE DE RES ", quantity: 0.2, unit: "kg" }],
      1,
      inventario,
    )
    expect(d.get("i2")?.neededQty).toBeCloseTo(0.2)
  })

  it("converts recipe units to the inventory item unit", () => {
    const d = computeDeductions(
      [{ ingredientName: "Queso", quantity: 50, unit: "g" }],
      4,
      inventario,
    )
    expect(d.get("i3")?.neededQty).toBe(200)
  })

  it("ignores ingredients with no matching inventory item", () => {
    const d = computeDeductions(
      [{ ingredientName: "Ingrediente inexistente", quantity: 1, unit: "kg" }],
      1,
      inventario,
    )
    expect(d.size).toBe(0)
  })

  it("ignores zero or negative quantities and empty names", () => {
    const d = computeDeductions(
      [
        { ingredientName: "Tortilla", quantity: 0, unit: "pza" },
        { ingredientName: "", quantity: 5, unit: "pza" },
      ],
      3,
      inventario,
    )
    expect(d.size).toBe(0)
  })

  it("accumulates when two recipe entries map to the same item", () => {
    const d = computeDeductions(
      [
        { ingredientName: "Tortilla", quantity: 2, unit: "pza" },
        { ingredientName: "tortilla", quantity: 1, unit: "pza" },
      ],
      1,
      inventario,
    )
    expect(d.size).toBe(1)
    expect(d.get("i1")?.neededQty).toBe(3)
  })
})
