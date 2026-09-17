import { describe, it, expect } from "vitest"
import {
  parseProductImportCsv,
  generateProductImportTemplate,
  parseImportDate,
  parseImportTags,
  PRODUCT_IMPORT_HEADER,
  type ProductImportColumn,
} from "./product-import"

const HEADER = PRODUCT_IMPORT_HEADER.join(";")

/** Arma una línea CSV nombrando columnas (resto vacío). */
function csvRow(fields: Partial<Record<ProductImportColumn, string>>): string {
  return PRODUCT_IMPORT_HEADER.map((h) => fields[h as ProductImportColumn] ?? "").join(";")
}

describe("generateProductImportTemplate", () => {
  it("incluye BOM, encabezado y fila de ejemplo", () => {
    const t = generateProductImportTemplate()
    expect(t.startsWith("﻿")).toBe(true)
    expect(t).toContain(HEADER)
    expect(t).toContain("Agua mineral 600ml")
  })
})

describe("parseImportDate", () => {
  it("ancla las fechas sueltas a la zona del negocio", () => {
    expect(parseImportDate("2026-03-01", "start")).toBe("2026-03-01T00:00:00-06:00")
    expect(parseImportDate("2026-03-31", "end")).toBe("2026-03-31T23:59:59-06:00")
  })

  it("respeta ISO completo y descarta basura", () => {
    expect(parseImportDate("2026-03-01T10:00:00.000Z", "start")).toBe("2026-03-01T10:00:00.000Z")
    expect(parseImportDate("ayer", "end")).toBeNull()
    expect(parseImportDate("", "end")).toBeNull()
  })
})

describe("parseImportTags", () => {
  it("normaliza, separa por | y deduplica", () => {
    expect(parseImportTags(" Arranque | refrescos |arranque|")).toEqual(["arranque", "refrescos"])
    expect(parseImportTags("")).toEqual([])
  })
})

describe("parseProductImportCsv", () => {
  it("rechaza CSV vacío o sin columna nombre", () => {
    expect(parseProductImportCsv("").errors[0]!.message).toContain("vacío")
    expect(parseProductImportCsv("a;b\n1;2").errors[0]!.message).toContain("nombre")
  })

  it("parsea filas válidas y deriva slug del nombre", () => {
    const { rows, errors } = parseProductImportCsv(
      `${HEADER}\n${csvRow({
        nombre: "Agua Mineral 600ml",
        precio: "18.50",
        marca: "Topo Chico",
        categoria: "bebidas",
        unidad: "pieza",
        stock: "in_stock",
        visible: "si",
      })}`
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
      unit: "pieza",
      stock_status: "in_stock",
      stock_quantity: null,
      low_stock_threshold: null,
      sku: null,
      barcode: null,
      tags: [],
      sale_starts_at: null,
      sale_ends_at: null,
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
      `${HEADER}\n${csvRow({ nombre: "Bueno", precio: "10" })}\n${csvRow({ nombre: "Malo", precio: "-5" })}`
    )
    expect(rows).toHaveLength(1)
    expect(errors).toHaveLength(1)
    expect(errors[0]!.line).toBe(3)
  })

  it("interpreta visible=no como oculto y valida stock", () => {
    const { rows, errors } = parseProductImportCsv(
      `${HEADER}\n${csvRow({ nombre: "Oculto", precio: "10", visible: "no" })}\n${csvRow({
        nombre: "Malo",
        precio: "10",
        stock: "agotado",
      })}`
    )
    expect(rows[0]!.is_visible).toBe(false)
    expect(errors[0]!.message).toContain("stock inválido")
  })

  it("respeta slug explícito y sanea precio_oferta", () => {
    const { rows, errors } = parseProductImportCsv(
      `${HEADER}\n${csvRow({ nombre: "Prod", slug: "mi-slug", precio: "10", precio_oferta: "abc" })}`
    )
    expect(rows).toHaveLength(0)
    expect(errors[0]!.message).toContain("precio_oferta")
  })

  it("parsea sku, barcode, etiquetas y ventana de oferta", () => {
    const { rows, errors } = parseProductImportCsv(
      `${HEADER}\n${csvRow({
        nombre: "Prod",
        sku: "agua 600",
        barcode: "7501234567890",
        precio: "20",
        precio_oferta: "15",
        oferta_desde: "2026-03-01",
        oferta_hasta: "2026-03-31",
        etiquetas: "Arranque|refrescos",
      })}`
    )
    expect(errors).toEqual([])
    expect(rows[0]).toMatchObject({
      sku: "agua-600",
      barcode: "7501234567890",
      tags: ["arranque", "refrescos"],
      sale_starts_at: "2026-03-01T00:00:00-06:00",
      sale_ends_at: "2026-03-31T23:59:59-06:00",
    })
  })

  it("rechaza sku y barcode inválidos", () => {
    const sku = parseProductImportCsv(
      `${HEADER}\n${csvRow({ nombre: "Prod", precio: "10", sku: "sku con espacios!" })}`
    )
    expect(sku.errors[0]!.message).toContain("SKU")
    const barcode = parseProductImportCsv(
      `${HEADER}\n${csvRow({ nombre: "Prod", precio: "10", barcode: "123" })}`
    )
    expect(barcode.errors[0]!.message).toContain("código de barras")
  })

  it("deriva el stock de la cantidad y el umbral de la fila", () => {
    const { rows, errors } = parseProductImportCsv(
      `${HEADER}\n${csvRow({ nombre: "Con stock", precio: "10", cantidad: "3", umbral_stock: "4" })}\n${csvRow(
        { nombre: "Sin stock", precio: "10", cantidad: "0" }
      )}\n${csvRow({ nombre: "Sobrado", precio: "10", cantidad: "40", umbral_stock: "10" })}`
    )
    expect(errors).toEqual([])
    expect(rows.map((r) => [r.stock_status, r.stock_quantity, r.low_stock_threshold])).toEqual([
      ["low_stock", 3, 4],
      ["out_of_stock", 0, null],
      ["in_stock", 40, 10],
    ])
  })

  it("la columna stock manda sobre la cantidad y valida la ventana", () => {
    const { rows } = parseProductImportCsv(
      `${HEADER}\n${csvRow({ nombre: "Prod", precio: "10", stock: "out_of_stock", cantidad: "40" })}`
    )
    expect(rows[0]!.stock_status).toBe("out_of_stock")

    const bad = parseProductImportCsv(
      `${HEADER}\n${csvRow({
        nombre: "Prod",
        precio: "10",
        oferta_desde: "2026-04-01",
        oferta_hasta: "2026-03-01",
      })}`
    )
    expect(bad.errors[0]!.message).toContain("posterior")

    const invalid = parseProductImportCsv(
      `${HEADER}\n${csvRow({ nombre: "Prod", precio: "10", oferta_hasta: "pronto" })}`
    )
    expect(invalid.errors[0]!.message).toContain("oferta_hasta inválida")
  })

  it("limita etiquetas y umbrales fuera de rango", () => {
    const many = parseProductImportCsv(
      `${HEADER}\n${csvRow({
        nombre: "Prod",
        precio: "10",
        etiquetas: Array.from({ length: 21 }, (_, i) => `t${i}`).join("|"),
      })}`
    )
    expect(many.errors[0]!.message).toContain("máximo 20")

    const threshold = parseProductImportCsv(
      `${HEADER}\n${csvRow({ nombre: "Prod", precio: "10", umbral_stock: "-1" })}`
    )
    expect(threshold.errors[0]!.message).toContain("umbral_stock inválido")

    const qty = parseProductImportCsv(
      `${HEADER}\n${csvRow({ nombre: "Prod", precio: "10", cantidad: "2.5" })}`
    )
    expect(qty.errors[0]!.message).toContain("cantidad inválida")
  })
})
