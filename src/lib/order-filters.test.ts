import { describe, it, expect } from "vitest"
import {
  normalizeDateRange,
  parseSavedFilters,
  serializeSavedFilters,
  makeSavedFilter,
  parseOrderFilterParams,
  orderFilterQuery,
  EMPTY_ORDER_FILTER,
  ORDER_STATUS_VALUES,
} from "./order-filters"
import { STATUS_LABEL } from "./order-labels"

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

describe("ORDER_STATUS_VALUES", () => {
  it("coincide con el catálogo de etiquetas de estado", () => {
    expect([...ORDER_STATUS_VALUES].sort()).toEqual(Object.keys(STATUS_LABEL).sort())
  })
})

describe("parseOrderFilterParams", () => {
  const parse = (qs: string) => parseOrderFilterParams(new URLSearchParams(qs))

  it("devuelve el estado por defecto sin parámetros", () => {
    expect(parse("")).toEqual({ status: "all", search: "", from: "", to: "" })
  })

  it("lee el estado que envía el deep-link de pedidos atorados", () => {
    expect(parse("status=pending").status).toBe("pending")
  })

  it("descarta un estado fuera de la allowlist", () => {
    expect(parse("status=enviado").status).toBe("all")
    expect(parse("status=").status).toBe("all")
    expect(parse("status=PENDING").status).toBe("all")
  })

  it("lee búsqueda y fechas válidas", () => {
    expect(parse("q=juan&from=2026-09-01&to=2026-09-12")).toEqual({
      status: "all",
      search: "juan",
      from: "2026-09-01",
      to: "2026-09-12",
    })
  })

  it("recorta la búsqueda y descarta fechas inválidas", () => {
    expect(parse("q=%20juan%20").search).toBe("juan")
    expect(parse("from=10/09/2026&to=2026-13-40")).toEqual({
      status: "all",
      search: "",
      from: "",
      to: "",
    })
  })
})

describe("orderFilterQuery", () => {
  it("omite los valores por defecto", () => {
    expect(orderFilterQuery(EMPTY_ORDER_FILTER)).toBe("")
  })

  it("serializa solo los filtros activos", () => {
    expect(orderFilterQuery({ status: "pending", search: "", from: "", to: "" })).toBe(
      "status=pending"
    )
  })

  it("escapa la búsqueda", () => {
    const qs = orderFilterQuery({ status: "all", search: "juan pérez", from: "", to: "" })
    expect(new URLSearchParams(qs).get("q")).toBe("juan pérez")
  })

  it("ignora fechas inválidas", () => {
    expect(orderFilterQuery({ status: "all", search: "", from: "ayer", to: "" })).toBe("")
  })

  it("roundtrip: parse(query(state)) === state", () => {
    const state = { status: "out_for_delivery" as const, search: "ana", from: "2026-09-01", to: "2026-09-12" }
    expect(parseOrderFilterParams(new URLSearchParams(orderFilterQuery(state)))).toEqual(state)
  })

  it("roundtrip con el deep-link del dashboard", () => {
    const state = parseOrderFilterParams(new URLSearchParams("status=pending"))
    expect(orderFilterQuery(state)).toBe("status=pending")
  })
})
