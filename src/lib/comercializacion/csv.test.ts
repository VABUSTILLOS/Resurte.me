import { describe, it, expect } from "vitest"
import { toCsv } from "./csv"

describe("toCsv", () => {
  it("genera encabezados y filas", () => {
    const csv = toCsv(["nombre", "tel"], [["Ana", "5512"], ["Beto", null]])
    expect(csv).toBe("\uFEFFnombre,tel\r\nAna,5512\r\nBeto,")
  })

  it("escapa comas, comillas y saltos de línea", () => {
    const csv = toCsv(["nota"], [['dijo "hola", y\nse fue']])
    expect(csv).toBe('\uFEFFnota\r\n"dijo ""hola"", y\nse fue"')
  })

  it("incluye BOM UTF-8", () => {
    expect(toCsv(["a"], [["b"]]).charCodeAt(0)).toBe(0xfeff)
  })
})
