import { describe, it, expect } from "vitest"
import {
  periodBounds,
  compareMetric,
  splitNewVsRecurring,
  metricsComparisonToCsv,
  isPeriodDays,
} from "./analytics-periods"

describe("periodBounds", () => {
  it("el periodo anterior termina donde empieza el actual", () => {
    const now = new Date("2026-09-12T00:00:00Z")
    const { since, prevSince, prevUntil } = periodBounds(7, now)
    expect(since.toISOString()).toBe("2026-09-05T00:00:00.000Z")
    expect(prevUntil.toISOString()).toBe(since.toISOString())
    expect(prevSince.toISOString()).toBe("2026-08-29T00:00:00.000Z")
  })

  it("isPeriodDays valida las opciones", () => {
    expect(isPeriodDays(7)).toBe(true)
    expect(isPeriodDays(30)).toBe(true)
    expect(isPeriodDays(90)).toBe(true)
    expect(isPeriodDays(15)).toBe(false)
  })
})

describe("compareMetric", () => {
  it("calcula delta porcentual y dirección", () => {
    const r = compareMetric(150, 100)
    expect(r.deltaPct).toBe(50)
    expect(r.direction).toBe("up")
  })

  it("sin base (previous=0) devuelve deltaPct null", () => {
    const r = compareMetric(10, 0)
    expect(r.deltaPct).toBeNull()
    expect(r.direction).toBe("up")
  })

  it("detecta bajadas y empates", () => {
    expect(compareMetric(50, 100).direction).toBe("down")
    expect(compareMetric(100, 100).direction).toBe("flat")
    expect(compareMetric(50, 100).deltaPct).toBe(-50)
  })
})

describe("splitNewVsRecurring", () => {
  it("cuenta clientes únicos nuevos vs recurrentes", () => {
    const r = splitNewVsRecurring(
      [{ user_id: "a" }, { user_id: "a" }, { user_id: "b" }, { user_id: null }],
      new Set(["a"])
    )
    expect(r).toEqual({ newCustomers: 1, recurringCustomers: 1 })
  })

  it("todos nuevos cuando no hay historial", () => {
    const r = splitNewVsRecurring([{ user_id: "a" }, { user_id: "b" }], new Set())
    expect(r).toEqual({ newCustomers: 2, recurringCustomers: 0 })
  })
})

describe("metricsComparisonToCsv", () => {
  it("genera CSV con BOM, header y separador ;", () => {
    const csv = metricsComparisonToCsv([["Pedidos", "10", "8", "+25.0%"]])
    expect(csv.startsWith("﻿")).toBe(true)
    expect(csv).toContain("Métrica;Periodo actual;Periodo anterior;Cambio %")
    expect(csv).toContain("Pedidos;10;8;+25.0%")
  })

  it("escapa valores con separador o comillas", () => {
    const csv = metricsComparisonToCsv([["Ingresos; MXN", '1 "mil"', "0", "—"]])
    expect(csv).toContain('"Ingresos; MXN";"1 ""mil""";0;—')
  })
})
