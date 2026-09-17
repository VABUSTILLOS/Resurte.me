import { describe, it, expect } from "vitest"
import {
  conflictFromResponse,
  conflictPayload,
  describeConflict,
  isStaleWrite,
  parseExpectedMap,
  staleIds,
} from "./product-conflict"

const T1 = "2026-01-01T10:00:00.000Z"
const T2 = "2026-01-01T10:05:00.000Z"

describe("isStaleWrite", () => {
  it("sin precondición del cliente nunca hay conflicto", () => {
    expect(isStaleWrite(T2, null)).toBe(false)
    expect(isStaleWrite(T2, undefined)).toBe(false)
    expect(isStaleWrite(T2, "")).toBe(false)
  })

  it("no bloquea si la fila no expone updated_at (esquema anterior)", () => {
    expect(isStaleWrite(null, T1)).toBe(false)
    expect(isStaleWrite(undefined, T1)).toBe(false)
  })

  it("ignora fechas inválidas en lugar de inventar un conflicto", () => {
    expect(isStaleWrite("no-es-fecha", T1)).toBe(false)
    expect(isStaleWrite(T1, "no-es-fecha")).toBe(false)
  })

  it("detecta la edición ajena posterior al snapshot", () => {
    expect(isStaleWrite(T2, T1)).toBe(true)
  })

  it("permite escribir cuando la versión coincide o es más antigua", () => {
    expect(isStaleWrite(T1, T1)).toBe(false)
    expect(isStaleWrite(T1, T2)).toBe(false)
  })
})

describe("describeConflict", () => {
  it("incluye la antigüedad de la edición ajena", () => {
    const now = Date.parse(T1) + 3 * 60_000
    expect(describeConflict(T1, now)).toContain("hace 3 min")
    expect(describeConflict(T1, now)).toContain("Recarga")
  })

  it("cae a un mensaje genérico sin fecha", () => {
    expect(describeConflict(null)).toContain("Recarga")
    expect(describeConflict(null)).not.toContain("hace")
  })
})

describe("conflictPayload", () => {
  it("devuelve código estable, fecha vigente y la fila actual", () => {
    const payload = conflictPayload({ id: 7, name: "Agua", updated_at: T2 }, Date.parse(T2))
    expect(payload.code).toBe("stale_write")
    expect(payload.field).toBeNull()
    expect(payload.conflict.currentUpdatedAt).toBe(T2)
    expect(payload.conflict.current).toMatchObject({ id: 7, name: "Agua" })
    expect(payload.error).toContain("Recarga")
  })

  it("tolera que la fila no exista", () => {
    const payload = conflictPayload(null)
    expect(payload.conflict.currentUpdatedAt).toBeNull()
    expect(payload.conflict.current).toBeNull()
  })
})

describe("conflictFromResponse", () => {
  it("lee el 409 y descarta formas inválidas", () => {
    expect(
      conflictFromResponse({ conflict: { currentUpdatedAt: T2, current: { id: 3 } } })
    ).toEqual({ currentUpdatedAt: T2, current: { id: 3 } })

    expect(conflictFromResponse({ conflict: { currentUpdatedAt: 42 } })).toEqual({
      currentUpdatedAt: null,
      current: null,
    })
    expect(conflictFromResponse({})).toBeNull()
    expect(conflictFromResponse(null)).toBeNull()
    expect(conflictFromResponse("409")).toBeNull()
  })
})

describe("parseExpectedMap", () => {
  it("acepta solo ids y fechas válidas", () => {
    const map = parseExpectedMap({ 12: T1, "-3": T1, abc: T1, 15: "", 16: T2 })
    expect([...map.entries()]).toEqual([
      [12, T1],
      [16, T2],
    ])
  })

  it("devuelve un mapa vacío con entradas no-objeto", () => {
    expect(parseExpectedMap(null).size).toBe(0)
    expect(parseExpectedMap([T1]).size).toBe(0)
    expect(parseExpectedMap("12").size).toBe(0)
  })
})

describe("staleIds", () => {
  it("marca solo los ids con versión superada", () => {
    const stale = staleIds(new Map([[1, T1], [2, T1], [3, T1]]), [
      { id: 1, updated_at: T1 },
      { id: 2, updated_at: T2 },
      { id: 3, updated_at: null },
    ])
    expect(stale).toEqual([2])
  })

  it("ignora ids ausentes en la lectura y sale ordenado", () => {
    const stale = staleIds(new Map([[9, T1], [4, T1], [8, T1]]), [
      { id: 9, updated_at: T2 },
      { id: 4, updated_at: T2 },
    ])
    expect(stale).toEqual([4, 9])
  })

  it("sin precondiciones no hay nada que comparar", () => {
    expect(staleIds(new Map(), [{ id: 1, updated_at: T2 }])).toEqual([])
  })
})
