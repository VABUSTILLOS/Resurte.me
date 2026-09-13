import { describe, it, expect } from "vitest"
import { buildCohorts, monthKey, monthDiff } from "./admin-cohorts"

describe("monthKey", () => {
  it("extrae YYYY-MM", () => {
    expect(monthKey("2026-06-15T10:00:00Z")).toBe("2026-06")
  })
})

describe("monthDiff", () => {
  it("calcula meses entre claves", () => {
    expect(monthDiff("2026-01", "2026-04")).toBe(3)
    expect(monthDiff("2025-12", "2026-02")).toBe(2)
    expect(monthDiff("2026-05", "2026-05")).toBe(0)
  })
})

describe("buildCohorts", () => {
  const nowMonth = monthKey(new Date().toISOString())

  it("agrupa por mes de primer pedido y calcula recompra", () => {
    // Cohorte antigua (hace 3 meses) para que haya períodos transcurridos.
    const cohortMonth = (() => {
      const d = new Date()
      d.setMonth(d.getMonth() - 3)
      return monthKey(d.toISOString())
    })()
    const m1 = (() => {
      const d = new Date()
      d.setMonth(d.getMonth() - 2)
      return monthKey(d.toISOString())
    })()

    const orders = [
      // u1 compra en cohorte y recompra al mes siguiente
      { user_id: "u1", created_at: `${cohortMonth}-05T10:00:00Z` },
      { user_id: "u1", created_at: `${m1}-10T10:00:00Z` },
      // u2 compra en cohorte y NO recompra
      { user_id: "u2", created_at: `${cohortMonth}-20T10:00:00Z` },
    ]

    const rows = buildCohorts(orders)
    const cohort = rows.find((r) => r.month === cohortMonth)
    expect(cohort?.size).toBe(2)
    // Período 1: 1 de 2 recompró = 50%
    expect(cohort?.retentions[0]).toBe(50)
  })

  it("ignora pedidos sin user_id", () => {
    const rows = buildCohorts([{ user_id: null, created_at: "2026-01-05T00:00:00Z" }])
    expect(rows).toEqual([])
  })

  it("marca null los períodos aún no transcurridos", () => {
    // Cohorte del mes actual: todos los períodos futuros son null.
    const rows = buildCohorts([{ user_id: "u1", created_at: `${nowMonth}-01T00:00:00Z` }])
    expect(rows[0]?.retentions.every((r) => r === null)).toBe(true)
  })

  it("ordena cohortes más recientes primero", () => {
    const orders = [
      { user_id: "u1", created_at: "2025-01-05T00:00:00Z" },
      { user_id: "u2", created_at: "2025-06-05T00:00:00Z" },
    ]
    const rows = buildCohorts(orders)
    const first = rows[0]
    const last = rows[rows.length - 1]
    expect(first && last && first.month > last.month).toBe(true)
  })
})
