import { describe, it, expect } from "vitest"
import {
  getWeekBounds,
  getMonthBounds,
  getTodayBounds,
  formatDateTime,
  formatDate,
} from "./dates"

describe("getWeekBounds", () => {
  it("devuelve lunes-domingo de la semana actual en CDMX (como UTC)", () => {
    // Miércoles 26 ago 2026, 09:00 CDMX
    const { startISO, endISO } = getWeekBounds(new Date("2026-08-26T15:00:00.000Z"))
    expect(startISO).toBe("2026-08-24T06:00:00.000Z") // lunes 00:00 CDMX
    expect(endISO).toBe("2026-08-31T05:59:59.000Z") // domingo 23:59:59 CDMX
  })

  it("el domingo pertenece a la semana que termina ese día", () => {
    const { startISO, endISO } = getWeekBounds(new Date("2026-08-30T15:00:00.000Z"))
    expect(startISO).toBe("2026-08-24T06:00:00.000Z")
    expect(endISO).toBe("2026-08-31T05:59:59.000Z")
  })

  it("el lunes inicia una semana nueva", () => {
    const { startISO } = getWeekBounds(new Date("2026-08-31T15:00:00.000Z"))
    expect(startISO).toBe("2026-08-31T06:00:00.000Z")
  })
})

describe("getMonthBounds", () => {
  it("cubre el mes completo en CDMX", () => {
    const { startISO, endISO } = getMonthBounds(new Date("2026-08-15T12:00:00.000Z"))
    expect(startISO).toBe("2026-08-01T06:00:00.000Z")
    expect(endISO).toBe("2026-09-01T05:59:59.999Z")
  })
})

describe("getTodayBounds", () => {
  it("cubre 24h del día actual en CDMX", () => {
    const { startISO, endISO } = getTodayBounds(new Date("2026-08-26T20:00:00.000Z"))
    expect(startISO).toBe("2026-08-26T06:00:00.000Z")
    expect(endISO).toBe("2026-08-27T05:59:59.999Z")
  })
})

describe("formatDateTime / formatDate", () => {
  it("devuelve — para null", () => {
    expect(formatDateTime(null)).toBe("—")
    expect(formatDate(null)).toBe("—")
  })

  it("formatea fechas válidas sin lanzar errores", () => {
    expect(formatDateTime("2026-08-26T15:00:00.000Z")).not.toBe("—")
    expect(formatDate("2026-08-26T15:00:00.000Z")).toContain("2026")
  })
})
