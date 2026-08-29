import { describe, it, expect } from "vitest"
import { parseCsv } from "./csv-import"

describe("parseCsv", () => {
  it("parsea filas válidas con encabezado", () => {
    const text = `nombre,restaurante,telefono,whatsapp,email,ciudad,notas
Ana López,Tacos El Norte,5512345678,5512345678,ana@tacos.mx,Ciudad de México,Interesada en tortillas`
    const rows = parseCsv(text)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      rowNumber: 1,
      name: "Ana López",
      restaurant_name: "Tacos El Norte",
      phone: "5512345678",
      whatsapp: "5512345678",
      email: "ana@tacos.mx",
      city_name: "Ciudad de México",
      notes: "Interesada en tortillas",
      errors: [],
    })
  })

  it("funciona sin encabezado y con campos opcionales vacíos", () => {
    const rows = parseCsv("Luis Pérez,,,,,,")
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      name: "Luis Pérez",
      restaurant_name: null,
      phone: null,
      whatsapp: null,
      email: null,
      city_name: null,
      notes: null,
      errors: [],
    })
  })

  it("marca filas sin nombre", () => {
    const rows = parseCsv(",Tacos El Norte,5512345678")
    expect(rows[0]?.errors).toContain("Falta el nombre")
  })

  it("valida longitud de teléfono y whatsapp", () => {
    const rows = parseCsv("Ana,Rest,123,55123456789012345678")
    expect(rows[0]?.errors).toContain("Teléfono inválido")
    expect(rows[0]?.errors).toContain("WhatsApp inválido")
  })

  it("acepta teléfonos con formato (espacios, guiones, paréntesis)", () => {
    const rows = parseCsv("Ana,Rest,+52 55 1234 5678,(55) 1234-5678")
    expect(rows[0]?.errors).toHaveLength(0)
  })

  it("marca emails inválidos", () => {
    expect(parseCsv("Ana,,,,correo-malo")[0]?.errors).toContain("Email inválido")
    expect(parseCsv("Ana,,,,ana@ok.mx")[0]?.errors).toHaveLength(0)
  })

  it("junta columnas extra en notas y preserva comas", () => {
    const rows = parseCsv("Ana,Rest,,,,,le gusta el mole, pedir los lunes")
    expect(rows[0]?.notes).toBe("le gusta el mole, pedir los lunes")
  })

  it("ignora líneas vacías y enumera correctamente", () => {
    const rows = parseCsv("Ana\n\n\nLuis")
    expect(rows.map((r) => r.rowNumber)).toEqual([1, 2])
  })

  it("retorna arreglo vacío para texto vacío", () => {
    expect(parseCsv("")).toEqual([])
    expect(parseCsv("   \n  \n")).toEqual([])
  })
})
