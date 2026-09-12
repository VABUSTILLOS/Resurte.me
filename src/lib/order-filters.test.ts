import { describe, it, expect } from "vitest"
import {
  normalizeDateRange,
  parseSavedFilters,
  serializeSavedFilters,
  makeSavedFilter,
} from "./order-filters"

describe("normalizeDateRange", () => {
  it("devuelve vacío cuando no hay fechas", () => {
    expect(normalizeDateRange({})).toEqual({})
    expect(normalizeDateRange({ from: "", to: "" })).toEqual({})
  })

  it("from se interpreta como inicio del día", () => {
    const { fromIso, toExclusiveIso } = normalizeDateRange({ from: "2026-09-10" })
    expect(fromIso).toBeDefined()
    expect(new Date(fromIso!).getHours()).toBeDefined()
    expect(toExclusiveIso).toBeUndefined()
  })

  it("to es inclusivo: el límite devuelto es el inicio del día siguiente", () => {
    const { toExclusiveIso } = normalizeDateRange({ to: "2026-09-10" })
    const expected = new Date("2026-09-10T00:00:00")
    expected.setDate(expected.getDate() + 1)
    expect(toExclusiveIso).toBe(expected.toISOString())
  })

  it("ignora fechas inválidas", () => {
    expect(normalizeDateRange({ from: "2026-13-40", to: "no-es-fecha" })).toEqual({})
  })

  it("ignora formatos que no son YYYY-MM-DD", () => {
    expect(normalizeDateRange({ from: "10/09/2026" })).toEqual({})
  })
})

describe("saved filters", () => {
  const sample = { status: "pending", search: "juan", from: "2026-09-01", to: "2026-09-12" }

  it("parseSavedFilters devuelve [] ante JSON inválido o tipos incorrectos", () => {
    expect(parseSavedFilters(null)).toEqual([])
    expect(parseSavedFilters("no json")).toEqual([])
    expect(parseSavedFilters("{}")).toEqual([])
    expect(parseSavedFilters('[{"name":1}]')).toEqual([])
  })

  it("roundtrip serialize/parse conserva los filtros", () => {
    const filters = [makeSavedFilter("Pendientes de Juan", sample)!]
    expect(parseSavedFilters(serializeSavedFilters(filters))).toEqual(filters)
  })

  it("makeSavedFilter recorta y valida el nombre", () => {
    expect(makeSavedFilter("   ", sample)).toBeNull()
    expect(makeSavedFilter("", sample)).toBeNull()
    const long = makeSavedFilter("x".repeat(100), sample)
    expect(long!.name).toHaveLength(40)
  })

  it("limita a 10 filtros guardados", () => {
    const many = Array.from({ length: 15 }, (_, i) =>
      makeSavedFilter(`f${i}`, sample)!
    )
    expect(parseSavedFilters(serializeSavedFilters(many))).toHaveLength(10)
  })
})
