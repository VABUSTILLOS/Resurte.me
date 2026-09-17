import { describe, it, expect } from "vitest"
import { toCsv } from "./csv"
import { parseProductImportCsv } from "./product-import"
import {
  PRODUCT_CSV_COLUMNS,
  PRODUCT_CSV_EXAMPLE,
  PRODUCT_CSV_HEADER,
  productCsvCells,
  type ProductCsvRow,
} from "./product-csv"

function row(overrides: Partial<ProductCsvRow> = {}): ProductCsvRow {
  return {
    name: "Agua mineral",
    slug: "agua-mineral",
    sku: "AGUA-600",
    barcode: "7501234567890",
    price: 18.5,
    sale_price: 15,
    sale_starts_at: "2026-03-01T00:00:00.000Z",
    sale_ends_at: "2026-03-31T23:59:59.000Z",
    brand: "Topo Chico",
    category_slug: "bebidas",
    tags: ["arranque", "refrescos"],
    unit: "pieza",
    stock_status: "in_stock",
    stock_quantity: 24,
    low_stock_threshold: 6,
    is_visible: true,
    image_url: null,
    ...overrides,
  }
}

describe("PRODUCT_CSV_COLUMNS", () => {
  it("declara encabezados únicos y sin acentos (como los lee el parser)", () => {
    const headers = PRODUCT_CSV_HEADER
    expect(headers).toHaveLength(17)
    expect(new Set(headers).size).toBe(headers.length)
    expect(headers.every((h) => h === h.toLowerCase())).toBe(true)
  })

  it("mantiene una fila de ejemplo por columna", () => {
    expect(PRODUCT_CSV_EXAMPLE).toHaveLength(PRODUCT_CSV_COLUMNS.length)
    expect(PRODUCT_CSV_EXAMPLE[0]).toBe("Agua mineral 600ml")
  })

  it("exporta las celdas en el orden del encabezado", () => {
    const [cells] = productCsvCells([row()])
    expect(cells).toEqual([
      "Agua mineral",
      "agua-mineral",
      "AGUA-600",
      "7501234567890",
      18.5,
      15,
      "2026-03-01T00:00:00.000Z",
      "2026-03-31T23:59:59.000Z",
      "Topo Chico",
      "bebidas",
      "arranque|refrescos",
      "pieza",
      "in_stock",
      24,
      6,
      "si",
      null,
    ])
  })

  it("serializa los nulos como celda vacía y la visibilidad como si/no", () => {
    const [cells] = productCsvCells([
      row({
        sku: null,
        barcode: null,
        sale_price: null,
        brand: null,
        tags: null,
        unit: null,
        stock_quantity: null,
        low_stock_threshold: null,
        is_visible: false,
      }),
    ])
    expect(cells).toEqual([
      "Agua mineral",
      "agua-mineral",
      null,
      null,
      18.5,
      null,
      "2026-03-01T00:00:00.000Z",
      "2026-03-31T23:59:59.000Z",
      null,
      "bebidas",
      "",
      null,
      "in_stock",
      null,
      null,
      "no",
      null,
    ])
  })

  it("es simétrico: lo exportado se vuelve a importar sin cambios", () => {
    const original = row()
    const csv = toCsv([...PRODUCT_CSV_HEADER], productCsvCells([original]))

    const { rows, errors } = parseProductImportCsv(csv)

    expect(errors).toEqual([])
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      name: original.name,
      slug: original.slug,
      sku: original.sku,
      barcode: original.barcode,
      price: original.price,
      sale_price: original.sale_price,
      sale_starts_at: original.sale_starts_at,
      sale_ends_at: original.sale_ends_at,
      brand: original.brand,
      category_slug: original.category_slug,
      tags: original.tags,
      unit: original.unit,
      stock_status: original.stock_status,
      stock_quantity: original.stock_quantity,
      low_stock_threshold: original.low_stock_threshold,
      is_visible: original.is_visible,
      image_url: null,
    })
  })

  it("sobrevive a marcas con comas y comillas en el ida y vuelta", () => {
    const csv = toCsv(
      [...PRODUCT_CSV_HEADER],
      productCsvCells([row({ name: 'Aceite "extra", 1L', brand: "Marca, S.A." })])
    )

    const { rows, errors } = parseProductImportCsv(csv)

    expect(errors).toEqual([])
    expect(rows[0]?.name).toBe('Aceite "extra", 1L')
    expect(rows[0]?.brand).toBe("Marca, S.A.")
  })
})
