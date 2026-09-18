import { describe, expect, it } from "vitest"
import { paginaCapada, resumenDeCorte } from "./bitacora"

describe("paginaCapada", () => {
  it("no marca corte cuando la sonda no llegó", () => {
    const p = paginaCapada([1, 2, 3], 5)
    expect(p.truncated).toBe(false)
    expect(p.shown).toBe(3)
    expect(p.cap).toBe(5)
    expect(p.entries).toEqual([1, 2, 3])
  })

  it("marca corte cuando llegó la fila de más y la descarta", () => {
    // 6 filas para un cap de 5: la sexta es la sonda, no contenido.
    const p = paginaCapada([1, 2, 3, 4, 5, 6], 5)
    expect(p.truncated).toBe(true)
    expect(p.shown).toBe(5)
    expect(p.entries).toEqual([1, 2, 3, 4, 5])
  })

  it("no confunde lleno con cortado", () => {
    // Exactamente cap filas: la lista está completa, no truncada. Es la
    // distinción que un `LIMIT` a secas no puede hacer.
    expect(paginaCapada([1, 2, 3, 4, 5], 5).truncated).toBe(false)
  })

  it("deja total en null cuando no se preguntó", () => {
    expect(paginaCapada([1, 2], 5).total).toBeNull()
  })

  it("propaga el total cuando sí se preguntó", () => {
    const p = paginaCapada([1, 2], 5, 4321)
    expect(p.total).toBe(4321)
    expect(p.shown).toBe(2)
  })

  it("no muta el array de entrada", () => {
    const filas = [1, 2, 3]
    paginaCapada(filas, 2)
    expect(filas).toEqual([1, 2, 3])
  })

  it("con cap 0 devuelve vacío y declara el corte", () => {
    const p = paginaCapada([1], 0)
    expect(p.entries).toEqual([])
    expect(p.shown).toBe(0)
    expect(p.truncated).toBe(true)
  })
})

describe("resumenDeCorte", () => {
  it("dice de cuántas cuando conoce el total", () => {
    expect(resumenDeCorte({ shown: 100, cap: 100, truncated: true, total: 4312 })).toBe(
      "Mostrando 100 de 4312 registros"
    )
  })

  it("no dice 'de N' cuando el total es el que se ve", () => {
    expect(resumenDeCorte({ shown: 12, cap: 100, truncated: false, total: 12 })).toBe("12 registros")
  })

  it("avisa que hay más aunque no conozca el total", () => {
    expect(resumenDeCorte({ shown: 100, cap: 100, truncated: true, total: null })).toBe(
      "Mostrando las 100 más recientes · hay más"
    )
  })

  it("sin corte y sin total no insinúa que haya más", () => {
    expect(resumenDeCorte({ shown: 7, cap: 100, truncated: false, total: null })).toBe("7 registros")
  })

  it("concuerda en singular", () => {
    expect(resumenDeCorte({ shown: 1, cap: 100, truncated: false, total: null })).toBe("1 registro")
    expect(resumenDeCorte({ shown: 1, cap: 100, truncated: false, total: 1 })).toBe("1 registro")
  })

  it("nunca presenta una lista cortada como completa", () => {
    const cortada = resumenDeCorte({ shown: 100, cap: 100, truncated: true, total: null })
    expect(cortada).not.toMatch(/^100 registros$/)
  })
})
