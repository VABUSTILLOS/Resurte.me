import { describe, expect, it } from "vitest"
import {
  describeQuantityViolation,
  normalizeQuantityLimit,
  quantityLimitsOf,
  validateQuantityLimits,
  type ProductQuantityLimits,
} from "./product-quantity-limits"

const limits = (
  entries: Array<[number, ProductQuantityLimits]>
) => new Map(entries)

describe("normalizeQuantityLimit", () => {
  it("acepta enteros ≥ 1 y rechaza todo lo demás", () => {
    expect(normalizeQuantityLimit(5)).toBe(5)
    expect(normalizeQuantityLimit(1)).toBe(1)
    expect(normalizeQuantityLimit(0)).toBeNull()
    expect(normalizeQuantityLimit(-3)).toBeNull()
    expect(normalizeQuantityLimit(2.5)).toBeNull()
    expect(normalizeQuantityLimit(null)).toBeNull()
    expect(normalizeQuantityLimit(undefined)).toBeNull()
    expect(normalizeQuantityLimit("5")).toBeNull()
  })
})

describe("quantityLimitsOf", () => {
  it("extrae y normaliza las columnas opcionales", () => {
    expect(quantityLimitsOf({ min_order_qty: 5, max_order_qty: 20 })).toEqual({
      min_order_qty: 5,
      max_order_qty: 20,
    })
    expect(quantityLimitsOf({})).toEqual({ min_order_qty: null, max_order_qty: null })
    expect(quantityLimitsOf({ min_order_qty: 0, max_order_qty: null })).toEqual({
      min_order_qty: null,
      max_order_qty: null,
    })
  })
})

describe("validateQuantityLimits", () => {
  const lines = [
    { product_id: 1, name: "Arroz 1 kg", quantity: 3 },
    { product_id: 2, name: "Aceite 1 L", quantity: 12 },
    { product_id: 3, name: "Huevo 30 pzas", quantity: 2 },
  ]

  it("sin límites configurados no viola nada", () => {
    expect(validateQuantityLimits(lines, new Map())).toEqual([])
    expect(
      validateQuantityLimits(
        lines,
        limits([[1, { min_order_qty: null, max_order_qty: null }]])
      )
    ).toEqual([])
  })

  it("detecta cantidad bajo el mínimo", () => {
    const violations = validateQuantityLimits(
      lines,
      limits([[1, { min_order_qty: 5, max_order_qty: null }]])
    )
    expect(violations).toEqual([
      { product_id: 1, name: "Arroz 1 kg", quantity: 3, kind: "below_min", limit: 5 },
    ])
  })

  it("detecta cantidad sobre el máximo", () => {
    const violations = validateQuantityLimits(
      lines,
      limits([[2, { min_order_qty: null, max_order_qty: 10 }]])
    )
    expect(violations).toEqual([
      { product_id: 2, name: "Aceite 1 L", quantity: 12, kind: "above_max", limit: 10 },
    ])
  })

  it("acepta cantidades exactamente en el límite", () => {
    expect(
      validateQuantityLimits(
        [
          { product_id: 1, name: "A", quantity: 5 },
          { product_id: 2, name: "B", quantity: 10 },
        ],
        limits([
          [1, { min_order_qty: 5, max_order_qty: null }],
          [2, { min_order_qty: null, max_order_qty: 10 }],
        ])
      )
    ).toEqual([])
  })

  it("reporta todas las violaciones de una vez", () => {
    const violations = validateQuantityLimits(
      lines,
      limits([
        [1, { min_order_qty: 5, max_order_qty: null }],
        [2, { min_order_qty: null, max_order_qty: 10 }],
        [3, { min_order_qty: 4, max_order_qty: null }],
      ])
    )
    expect(violations.map((v) => v.product_id)).toEqual([1, 2, 3])
  })
})

describe("describeQuantityViolation", () => {
  it("redacta mínimo y máximo en español", () => {
    expect(
      describeQuantityViolation({
        product_id: 1,
        name: "Arroz 1 kg",
        quantity: 3,
        kind: "below_min",
        limit: 5,
      })
    ).toBe("Arroz 1 kg: el mínimo por pedido es 5 y pediste 3")
    expect(
      describeQuantityViolation({
        product_id: 2,
        name: "Aceite 1 L",
        quantity: 12,
        kind: "above_max",
        limit: 10,
      })
    ).toBe("Aceite 1 L: el máximo por pedido es 10 y pediste 12")
  })
})
