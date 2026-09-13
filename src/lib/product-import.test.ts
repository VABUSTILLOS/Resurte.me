import { describe, it, expect } from "vitest"
import {
  parseProductImportCsv,
  generateProductImportTemplate,
} from "./product-import"

// Espejo del encabezado interno (no exportado): mismo orden de columnas.
const PRODUCT_IMPORT_HEADER = [
  "nombre", "slug", "precio", "precio_oferta", "marca", "categoria", "stock", "visible",
] as const

const HEADER = PRODUCT_IMPORT_HEADER.join(";")

describe("generateProductImportTemplate", () => {
  it("incluye BOM, encabezado y fila de ejemplo", () => {
    const t = generateProductImportTemplate()
    expect(t.startsWith("﻿")).toBe(true)
    expect(t).toContain(HEADER)
    expect(t).toContain("Agua mineral 600ml")
  })
})

describe("parseProductImportCsv", () => {
  it("rechaza CSV vacío o sin columna nombre", () => {
    expect(parseProductImportCsv("").errors[0]!.message).toContain("vacío")
    expect(parseProductImportCsv("a;b\n1;2").errors[0]!.message).toContain("nombre")
  })

  it("parsea filas válidas y deriva slug del nombre", () => {
    const { rows, errors } = parseProductImportCsv(
      `${HEADER}\nAgua Mineral 600ml;;18.50;;Topo Chico;bebidas;in_stock;si`
    )
    expect(errors).toEqual([])
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      name: "Agua Mineral 600ml",
      slug: "agua-mineral-600ml",
      price: 18.5,
      sale_price: null,
      brand: "Topo Chico",
      category_slug: "bebidas",
      stock_status: "in_stock",
      is_visible: true,
    })
  })

  it("acepta separador coma y valores entre comillas", () => {
    const { rows, errors } = parseProductImportCsv(
      "nombre,precio\n\"Sal, yodada\",12.5"
    )
    expect(errors).toEqual([])
    expect(rows[0]).toMatchObject({ name: "Sal, yodada", price: 12.5 })
  })

  it("rechaza filas con precio inválido pero conserva las válidas", () => {
    const { rows, errors } = parseProductImportCsv(
      `${HEADER}\nBueno;;10;;;;;;\nMalo;;-5;;;;;;`
    )
    expect(rows).toHaveLength(1)
    expect(errors).toHaveLength(1)
    expect(errors[0]!.line).toBe(3)
  })

  it("interpreta visible=no como oculto y valida stock", () => {
    const { rows, errors } = parseProductImportCsv(
      `${HEADER}\nOculto;;10;;;;;no\nMalo;;10;;;;agotado;si`
    )
    expect(rows[0]!.is_visible).toBe(false)
    expect(errors[0]!.message).toContain("stock inválido")
  })

  it("respeta slug explícito y sanea precio_oferta", () => {
    const { rows, errors } = parseProductImportCsv(
      `${HEADER}\nProd;mi-slug;10;abc;;;;;`
    )
    expect(rows).toHaveLength(0)
    expect(errors[0]!.message).toContain("precio_oferta")
  })
})
