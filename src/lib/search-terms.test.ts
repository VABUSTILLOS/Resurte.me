import { describe, expect, it } from "vitest"
import { expandSearchTerms, normalizeSearchTerm, escapeIlike } from "./search-terms"

describe("normalizeSearchTerm", () => {
  it("minúsculas y sin acentos", () => {
    expect(normalizeSearchTerm("  Café Molido ")).toBe("cafe molido")
    expect(normalizeSearchTerm("CAMARÓN")).toBe("camaron")
  })
})

describe("expandSearchTerms", () => {
  it("término vacío → []", () => {
    expect(expandSearchTerms("   ")).toEqual([])
  })

  it("incluye el término base", () => {
    expect(expandSearchTerms("aguacate")).toContain("aguacate")
  })

  it("expande sinónimos regionales", () => {
    expect(expandSearchTerms("palta")).toContain("aguacate")
    expect(expandSearchTerms("soda")).toEqual(expect.arrayContaining(["soda", "refresco", "gaseosa"]))
    expect(expandSearchTerms("jitomate saladette")).toContain("tomate saladette")
  })

  it("acentos del usuario no impiden el sinónimo", () => {
    expect(expandSearchTerms("plátano")).toContain("platano")
  })

  it("sin sinónimo conocido → solo el término base", () => {
    expect(expandSearchTerms("detergente")).toEqual(["detergente"])
  })

  it("limita la expansión a 6 términos", () => {
    expect(expandSearchTerms("soda").length).toBeLessThanOrEqual(6)
  })
})

describe("escapeIlike", () => {
  it("neutraliza comodines y separadores de PostgREST", () => {
    expect(escapeIlike("50% (oferta)")).toBe("50   oferta ")
  })
})
