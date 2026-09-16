import { describe, expect, it } from "vitest"

import { QUALIFYING_WEEK_MIN } from "@/lib/utils"
import { computeWeekProgress } from "@/lib/wallet-progress"

// 2026-01-05 es lunes y arranca la semana ISO 2026-W02
// (la W01 va del 29-dic-2025 al 04-ene-2026).
const MONDAY_NOON_MX = new Date("2026-01-05T18:00:00Z") // 12:00 en CDMX

function order(iso: string, total: number) {
  return { created_at: iso, total }
}

describe("computeWeekProgress", () => {
  it("suma solo la semana en curso y calcula lo que falta", () => {
    const result = computeWeekProgress(
      [
        order("2026-01-05T18:00:00Z", 1000),
        order("2026-01-06T18:00:00Z", 500),
        // Semana anterior: no debe contar para el gasto semanal.
        order("2026-01-01T18:00:00Z", 9000),
      ],
      MONDAY_NOON_MX
    )

    expect(result.weekKey).toBe("2026-W02")
    expect(result.weekSpend).toBe(1500)
    expect(result.remainingToQualify).toBe(QUALIFYING_WEEK_MIN - 1500)
    expect(result.qualifies).toBe(false)
  })

  it("marca la semana como calificada al llegar al mínimo", () => {
    const result = computeWeekProgress(
      [order("2026-01-06T18:00:00Z", QUALIFYING_WEEK_MIN)],
      MONDAY_NOON_MX
    )

    expect(result.qualifies).toBe(true)
    expect(result.remainingToQualify).toBe(0)
  })

  it("cuenta los días restantes de la semana ISO", () => {
    expect(computeWeekProgress([], MONDAY_NOON_MX).daysLeft).toBe(6)
    // Miércoles 07-ene-2026 12:00 CDMX
    expect(computeWeekProgress([], new Date("2026-01-07T18:00:00Z")).daysLeft).toBe(4)
    // Domingo 11-ene-2026 12:00 CDMX
    expect(computeWeekProgress([], new Date("2026-01-11T18:00:00Z")).daysLeft).toBe(0)
  })

  it("ubica las órdenes por hora de México, no por UTC", () => {
    // 05-ene-2026 02:00 UTC = 04-ene 20:00 en CDMX → domingo de la W01.
    const result = computeWeekProgress(
      [order("2026-01-05T02:00:00Z", 2500)],
      MONDAY_NOON_MX
    )

    expect(result.weekSpend).toBe(0)
    expect(result.qualifies).toBe(false)
  })

  it("sube de nivel según las semanas calificadas del mes", () => {
    const result = computeWeekProgress(
      [
        order("2026-01-01T18:00:00Z", 3000), // W01
        order("2026-01-05T18:00:00Z", 3000), // W02 (en curso)
      ],
      MONDAY_NOON_MX
    )

    expect(result.qualifyingWeeksThisMonth).toBe(2)
    expect(result.tier).toBe("Plata")
    expect(result.tierPct).toBe(10)
    expect(result.nextTier).toBe("Oro")
    expect(result.nextTierPct).toBe(15)
    expect(result.weeksToNextTier).toBe(1)
  })

  it("ignora semanas calificadas de meses anteriores", () => {
    const result = computeWeekProgress(
      [
        order("2025-12-01T18:00:00Z", 9000),
        order("2025-12-08T18:00:00Z", 9000),
        order("2025-12-15T18:00:00Z", 9000),
      ],
      MONDAY_NOON_MX
    )

    expect(result.qualifyingWeeksThisMonth).toBe(0)
    expect(result.tier).toBe("Verde")
    expect(result.weeksToNextTier).toBe(2)
  })

  it("no propone siguiente nivel en el tope", () => {
    const result = computeWeekProgress(
      [
        order("2026-01-01T18:00:00Z", 3000),
        order("2026-01-05T18:00:00Z", 3000),
        order("2026-01-12T18:00:00Z", 3000),
        order("2026-01-19T18:00:00Z", 3000),
      ],
      MONDAY_NOON_MX
    )

    expect(result.tier).toBe("Diamante")
    expect(result.nextTier).toBeNull()
    expect(result.nextTierPct).toBeNull()
    expect(result.weeksToNextTier).toBeNull()
  })

  it("tolera totales nulos, negativos y fechas inválidas", () => {
    const result = computeWeekProgress(
      [
        { created_at: "2026-01-06T18:00:00Z", total: null },
        order("2026-01-06T18:00:00Z", -500),
        order("no-es-fecha", 1000),
        order("2026-01-06T18:00:00Z", 2000),
      ],
      MONDAY_NOON_MX
    )

    expect(result.weekSpend).toBe(2000)
  })

  it("acepta totales como string (numeric de Postgres)", () => {
    const result = computeWeekProgress(
      [{ created_at: "2026-01-06T18:00:00Z", total: "2500.00" }],
      MONDAY_NOON_MX
    )

    expect(result.weekSpend).toBe(2500)
    expect(result.qualifies).toBe(true)
  })
})
