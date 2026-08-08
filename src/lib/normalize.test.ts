import { describe, expect, it } from "vitest"
import { normalizeName } from "@/lib/normalize"

describe("normalizeName", () => {
  it("quita emojis y símbolos decorativos", () => {
    expect(normalizeName("🥬 Cilantro")).toBe("cilantro")
    expect(normalizeName("🌶️ Chile Rojo")).toBe("chile rojo")
  })

  it("convierte a minúsculas y hace trim", () => {
    expect(normalizeName("  POLLO  ")).toBe("pollo")
    expect(normalizeName("CARNE DE RES")).toBe("carne de res")
  })

  it("colapsa espacios múltiples", () => {
    expect(normalizeName("cebolla    morada")).toBe("cebolla morada")
    expect(normalizeName("  jitomate   bola  ")).toBe("jitomate bola")
  })

  it("mantiene nombres ya normalizados", () => {
    expect(normalizeName("pollo")).toBe("pollo")
  })

  it("string vacío devuelve vacío", () => {
    expect(normalizeName("")).toBe("")
    expect(normalizeName("  ")).toBe("")
  })

  it("normaliza el mismo nombre independiente del emoji (dedupe)", () => {
    expect(normalizeName("🧀 Queso Manchego")).toBe(normalizeName("queso manchego"))
  })
})
