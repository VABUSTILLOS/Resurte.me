import { describe, it, expect } from "vitest"
import { toCsv } from "./csv"

describe("toCsv", () => {
  it("genera encabezados y filas separados por CRLF", () => {
    const csv = toCsv(["id", "nombre"], [[1, "Ana"], [2, "Luis"]])
    expect(csv).toBe("﻿id,nombre\r\n1,Ana\r\n2,Luis")
  })

  it("escapa comas, comillas y saltos de línea", () => {
    const csv = toCsv(["texto"], [["a,b"], ['dijo "hola"'], ["línea1\nlínea2"]])
    expect(csv).toBe('﻿texto\r\n"a,b"\r\n"dijo ""hola"""\r\n"línea1\nlínea2"')
  })

  it("null y undefined quedan como celda vacía", () => {
    const csv = toCsv(["a", "b", "c"], [[null, undefined, 0]])
    expect(csv).toBe("﻿a,b,c\r\n,,0")
  })

  it("incluye BOM UTF-8 al inicio", () => {
    expect(toCsv(["a"], [["b"]]).charCodeAt(0)).toBe(0xfeff)
  })
})
