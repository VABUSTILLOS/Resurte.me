import { describe, expect, it } from "vitest"
import {
  CRM_REVENUE_SCAN_LIMIT,
  foldPaidRevenueWindow,
  toAmount,
} from "./revenue-scan"

const row = (total: unknown) => ({ total })

describe("toAmount", () => {
  it("acepta el número que ya viene tipado", () => {
    expect(toAmount(250)).toBe(250)
  })

  it("acepta el texto con el que PostgREST entrega un DECIMAL", () => {
    expect(toAmount("250.50")).toBe(250.5)
  })

  it("trata nulo y no numérico como cero, no como NaN", () => {
    // `NaN` aguas abajo se formatea como «NaN» o se pierde en una comparación,
    // y en ambos casos miente.
    expect(toAmount(null)).toBe(0)
    expect(toAmount(undefined)).toBe(0)
    expect(toAmount("")).toBe(0)
    expect(toAmount("no es un número")).toBe(0)
    expect(toAmount(Number.NaN)).toBe(0)
    expect(toAmount(Number.POSITIVE_INFINITY)).toBe(0)
  })
})

describe("foldPaidRevenueWindow", () => {
  it("suma la ventana completa cuando no se quedó corta", () => {
    const result = foldPaidRevenueWindow([row("100.50"), row(200), row("99.50")])
    expect(result).toEqual({ revenue: 400, paidOrders: 3, truncated: false })
  })

  it("cuenta los pedidos sobre las filas sumadas, no sobre la lista de la ficha", () => {
    const rows = Array.from({ length: 120 }, () => row(10))
    expect(foldPaidRevenueWindow(rows).paidOrders).toBe(120)
  })

  it("con una fila de más marca el total como mínimo y descarta la extra", () => {
    const rows = [row(10), row(10), row(10)]
    const result = foldPaidRevenueWindow(rows, 2)
    // La tercera fila solo sirve para saber que había más: sumarla sería contar
    // un pedido que la ventana no cubre.
    expect(result).toEqual({ revenue: 20, paidOrders: 2, truncated: true })
  })

  it("una ventana vacía es un cero medido, no un truncamiento", () => {
    expect(foldPaidRevenueWindow([])).toEqual({
      revenue: 0,
      paidOrders: 0,
      truncated: false,
    })
  })

  it("justo en el tope no marca truncamiento", () => {
    const rows = Array.from({ length: CRM_REVENUE_SCAN_LIMIT }, () => row(1))
    const result = foldPaidRevenueWindow(rows)
    expect(result.truncated).toBe(false)
    expect(result.paidOrders).toBe(CRM_REVENUE_SCAN_LIMIT)
  })

  it("una fila sobre el tope sí lo marca", () => {
    const rows = Array.from({ length: CRM_REVENUE_SCAN_LIMIT + 1 }, () => row(1))
    const result = foldPaidRevenueWindow(rows)
    expect(result.truncated).toBe(true)
    expect(result.paidOrders).toBe(CRM_REVENUE_SCAN_LIMIT)
    expect(result.revenue).toBe(CRM_REVENUE_SCAN_LIMIT)
  })

  it("tolera filas con importe ilegible sin romper la suma", () => {
    const result = foldPaidRevenueWindow([row("100"), row(null), row("50")])
    expect(result.revenue).toBe(150)
    expect(result.paidOrders).toBe(3)
  })
})
