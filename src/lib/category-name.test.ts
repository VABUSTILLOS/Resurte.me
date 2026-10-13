import { describe, expect, it } from "vitest"
import { findCategoryByName, normalizeCategoryName } from "./category-name"

describe("normalizeCategoryName", () => {
  it("ignora mayúsculas", () => {
    expect(normalizeCategoryName("FRUTAS")).toBe(normalizeCategoryName("frutas"))
  })

  it("ignora acentos", () => {
    // El caso real: "Café e insumos" vs "Cafe e insumos" son el mismo nombre
    // para quien lo lee, aunque el slug los distinga.
    expect(normalizeCategoryName("Café e insumos")).toBe(normalizeCategoryName("Cafe e insumos"))
  })

  it("colapsa espacios de más y recorta", () => {
    expect(normalizeCategoryName("  Frutas   y  Verduras ")).toBe("frutas y verduras")
  })

  it("no convierte el nombre en slug", () => {
    // Se compara el nombre, no la URL: "Frutas y Verduras" conserva el " y ".
    expect(normalizeCategoryName("Frutas y Verduras")).toBe("frutas y verduras")
  })

  it("tolera vacío y nulo", () => {
    expect(normalizeCategoryName("")).toBe("")
    expect(normalizeCategoryName("   ")).toBe("")
  })
})

describe("findCategoryByName", () => {
  const existing = [
    { id: 15, name: "Frutas y Verduras" },
    { id: 14, name: "Limpieza institucional" },
  ]

  it("encuentra el duplicado aunque cambien mayúsculas y acentos", () => {
    expect(findCategoryByName(existing, "  frutas Y VERDURAS ")?.id).toBe(15)
  })

  it("devuelve null cuando el nombre es nuevo", () => {
    expect(findCategoryByName(existing, "Carnes")).toBeNull()
  })

  it("devuelve la categoría existente para poder nombrarla en el error", () => {
    // "ya existe «Frutas y Verduras»" es accionable; "nombre duplicado" no.
    expect(findCategoryByName(existing, "Frutas y Verduras")?.name).toBe("Frutas y Verduras")
  })

  it("un nombre vacío nunca coincide (no bloquea el alta sin nombre)", () => {
    // El endpoint ya rechaza el nombre vacío con un 400 propio; aquí no debe
    // colarse como "duplicado de la primera categoría".
    expect(findCategoryByName(existing, "")).toBeNull()
    expect(findCategoryByName(existing, "   ")).toBeNull()
  })

  it("sin categorías no hay duplicado", () => {
    expect(findCategoryByName([], "Frutas")).toBeNull()
  })

  it("el caso que lo motivó: el tercer intento ya no crea una cuarta", () => {
    // El estado real que dejó el bug: tres "Frutas y Verduras" con slugs
    // distintos. Cualquier intento posterior tiene que caer en la primera.
    const polluted = [
      { id: 15, name: "Frutas y Verduras" },
      { id: 16, name: "Frutas y Verduras" },
      { id: 17, name: "Frutas y Verduras" },
    ]
    expect(findCategoryByName(polluted, "Frutas y Verduras")?.id).toBe(15)
  })
})
