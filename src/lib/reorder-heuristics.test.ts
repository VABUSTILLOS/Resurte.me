import { describe, it, expect } from "vitest"
import {
  computeRunningOutProducts,
  computeReorderIntervalDays,
} from "./reorder-heuristics"

const NOW = new Date("2026-05-20T12:00:00Z")

function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString()
}

describe("computeRunningOutProducts", () => {
  it("sugiere un producto cuya cadencia típica ya se cumplió", () => {
    // Jitomate cada 7 días: comprado hace 14, 7 y 6 días → intervalo 4? no:
    // (last-first)/(n-1) = (14-6)/1... mejor caso claro: hace 14 y hace 7.
    const result = computeRunningOutProducts(
      [
        { product_id: 1, purchased_at: daysAgo(14) },
        { product_id: 1, purchased_at: daysAgo(7) },
      ],
      { now: NOW }
    )
    // Intervalo promedio = 7 días; última compra hace 7 ≥ 7 × 0.85 → sugiere.
    expect(result).toHaveLength(1)
    expect(result[0]!.product_id).toBe(1)
    expect(result[0]!.avgIntervalDays).toBe(7)
    expect(result[0]!.daysSinceLast).toBe(7)
  })

  it("no sugiere productos comprados una sola vez", () => {
    const result = computeRunningOutProducts(
      [{ product_id: 1, purchased_at: daysAgo(30) }],
      { now: NOW }
    )
    expect(result).toHaveLength(0)
  })

  it("no sugiere si aún no se cumple el intervalo típico", () => {
    const result = computeRunningOutProducts(
      [
        { product_id: 1, purchased_at: daysAgo(20) },
        { product_id: 1, purchased_at: daysAgo(2) },
      ],
      { now: NOW }
    )
    // Intervalo = 18 días; solo 2 días desde la última compra.
    expect(result).toHaveLength(0)
  })

  it("ignora cadencias de compras el mismo día", () => {
    const result = computeRunningOutProducts(
      [
        { product_id: 1, purchased_at: daysAgo(5) },
        { product_id: 1, purchased_at: daysAgo(5) },
      ],
      { now: NOW }
    )
    expect(result).toHaveLength(0)
  })

  it("ordena por urgencia relativa y respeta el límite", () => {
    const purchases = [
      // producto 1: intervalo 10, 10 días sin comprar (ratio 1.0)
      { product_id: 1, purchased_at: daysAgo(20) },
      { product_id: 1, purchased_at: daysAgo(10) },
      // producto 2: intervalo 5, 10 días sin comprar (ratio 2.0 → más urgente)
      { product_id: 2, purchased_at: daysAgo(15) },
      { product_id: 2, purchased_at: daysAgo(10) },
    ]
    const result = computeRunningOutProducts(purchases, { now: NOW, limit: 1 })
    expect(result).toHaveLength(1)
    expect(result[0]!.product_id).toBe(2)
  })

  it("deduplica el mismo producto dentro de una misma orden", () => {
    const result = computeRunningOutProducts(
      [
        { product_id: 1, purchased_at: daysAgo(14) },
        { product_id: 1, purchased_at: daysAgo(14) }, // mismo pedido
        { product_id: 1, purchased_at: daysAgo(7) },
      ],
      { now: NOW }
    )
    expect(result).toHaveLength(1)
    expect(result[0]!.avgIntervalDays).toBe(7)
  })
})

describe("computeReorderIntervalDays", () => {
  it("retorna null con menos de 2 pedidos", () => {
    expect(computeReorderIntervalDays([])).toBeNull()
    expect(computeReorderIntervalDays([daysAgo(3)])).toBeNull()
  })

  it("calcula el intervalo promedio entre pedidos", () => {
    // Pedidos hace 21, 14, 7 y 0 días → intervalo promedio 7 días.
    expect(
      computeReorderIntervalDays([daysAgo(0), daysAgo(7), daysAgo(14), daysAgo(21)])
    ).toBeCloseTo(7)
  })
})
