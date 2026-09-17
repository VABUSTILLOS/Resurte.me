import { describe, expect, it } from "vitest"
import { describeTrend, shortDay } from "@/app/admin/conversion/trend-format"
import type { TrendPoint } from "@/lib/conversion-funnel"

function point(overrides: Partial<TrendPoint> = {}): TrendPoint {
  return {
    date: "2026-08-03",
    created: 0,
    paid: 0,
    failed: 0,
    pending: 0,
    cancelled: 0,
    other: 0,
    revenue: 0,
    partial: false,
    ...overrides,
  }
}

describe("shortDay", () => {
  it("formatea el día local sin correrse un día por la zona del navegador", () => {
    // La clave ya viene en la fecha local del restaurante; se formatea en UTC
    // para que el texto no cambie según dónde esté quien mira el panel.
    expect(shortDay("2026-08-03")).toMatch(/3/)
    expect(shortDay("2026-08-03")).toMatch(/ago/i)
    expect(shortDay("2026-08-03")).not.toMatch(/2\b/)
  })

  it("devuelve la clave tal cual si no es una fecha válida", () => {
    expect(shortDay("sin fecha")).toBe("sin fecha")
  })
})

describe("describeTrend", () => {
  it("resume la serie en texto para el lector de pantalla", () => {
    const summary = describeTrend([
      point({ date: "2026-08-03", created: 4, paid: 2, revenue: 800 }),
      point({ date: "2026-08-04", created: 8, paid: 4, revenue: 1600 }),
    ])
    expect(summary).toContain("2 días")
    expect(summary).toContain("12")
    expect(summary).toContain("6")
    expect(summary).toContain("50%")
    expect(summary).toContain("al alza")
  })

  it("declara la tendencia a la baja cuando el último día crea menos pedidos", () => {
    const summary = describeTrend([
      point({ created: 8, paid: 4 }),
      point({ date: "2026-08-04", created: 2, paid: 1 }),
    ])
    expect(summary).toContain("a la baja")
  })

  it("no afirma una tasa sin denominador", () => {
    // Cero pedidos creados: "No medido", nunca 0%.
    const summary = describeTrend([point(), point({ date: "2026-08-04" })])
    expect(summary).toContain("No medido")
    expect(summary).not.toContain("0%")
  })

  it("avisa en texto que los días del borde están cortados", () => {
    const summary = describeTrend([
      point({ created: 1, paid: 1, partial: true }),
      point({ date: "2026-08-04", created: 5, paid: 2 }),
    ])
    expect(summary).toContain("incompletos")
  })

  it("anuncia el vacío en vez de describir una serie inexistente", () => {
    expect(describeTrend([])).toBe("Tendencia diaria: sin datos en el período")
  })
})
