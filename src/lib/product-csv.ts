/**
 * Columnas del CSV de productos: fuente única para la plantilla de importación
 * y para la exportación del panel.
 *
 * Antes el encabezado vivía duplicado (una copia literal dentro de
 * `exportCsv()` en el panel y otra en `product-import.ts`), así que añadir una
 * columna obligaba a tocar dos sitios y, si se olvidaba uno, la exportación
 * dejaba de ser re-importable sin que nada avisara. Aquí se declara una vez, con
 * el valor de ejemplo de la plantilla y el extractor de exportación de cada
 * columna, y ambos lados consumen la misma lista.
 */

import type { CsvCell } from "./csv"

/** Fila de producto lista para exportar (proyección de `Product`). */
export interface ProductCsvRow {
  name: string
  slug: string
  sku: string | null
  barcode: string | null
  price: number | null
  sale_price: number | null
  sale_starts_at: string | null
  sale_ends_at: string | null
  brand: string | null
  /** Slug de la categoría (`categoria` viaja por slug, no por id). */
  category_slug: string
  tags: string[] | null
  unit: string | null
  stock_status: string
  stock_quantity: number | null
  low_stock_threshold: number | null
  is_visible: boolean
  image_url: string | null
}

export interface ProductCsvColumn {
  /** Encabezado tal cual se escribe y se vuelve a leer (sin acentos). */
  header: string
  /** Valor de la fila de ejemplo de la plantilla descargable. */
  example: string
  /** Valor exportado para un producto. */
  pick: (row: ProductCsvRow) => CsvCell
}

/** Orden canónico de columnas: el mismo en plantilla, export e importación. */
export const PRODUCT_CSV_COLUMNS = [
  { header: "nombre", example: "Agua mineral 600ml", pick: (p) => p.name },
  { header: "slug", example: "agua-mineral-600ml", pick: (p) => p.slug },
  { header: "sku", example: "AGUA-600", pick: (p) => p.sku },
  { header: "barcode", example: "7501234567890", pick: (p) => p.barcode },
  { header: "precio", example: "18.50", pick: (p) => p.price },
  { header: "precio_oferta", example: "15.00", pick: (p) => p.sale_price },
  {
    header: "oferta_desde",
    example: "2026-03-01T00:00:00.000Z",
    pick: (p) => p.sale_starts_at,
  },
  {
    header: "oferta_hasta",
    example: "2026-03-31T23:59:59.000Z",
    pick: (p) => p.sale_ends_at,
  },
  { header: "marca", example: "Topo Chico", pick: (p) => p.brand },
  { header: "categoria", example: "bebidas", pick: (p) => p.category_slug },
  { header: "etiquetas", example: "arranque|refrescos", pick: (p) => (p.tags ?? []).join("|") },
  { header: "unidad", example: "pieza", pick: (p) => p.unit },
  { header: "stock", example: "in_stock", pick: (p) => p.stock_status },
  { header: "cantidad", example: "24", pick: (p) => p.stock_quantity },
  { header: "umbral_stock", example: "6", pick: (p) => p.low_stock_threshold },
  { header: "visible", example: "si", pick: (p) => (p.is_visible ? "si" : "no") },
  { header: "imagen", example: "", pick: (p) => p.image_url },
] as const satisfies readonly ProductCsvColumn[]

/** Nombre de columna aceptado por la plantilla y la exportación. */
export type ProductCsvColumnName = (typeof PRODUCT_CSV_COLUMNS)[number]["header"]

/** Encabezados en orden (plantilla, exportación y validación de la importación). */
export const PRODUCT_CSV_HEADER: readonly string[] = PRODUCT_CSV_COLUMNS.map((c) => c.header)

/** Fila de ejemplo de la plantilla descargable. */
export const PRODUCT_CSV_EXAMPLE: readonly string[] = PRODUCT_CSV_COLUMNS.map((c) => c.example)

/** Celdas de exportación (sin escapar; el escapado lo hace `toCsv`). */
export function productCsvCells(rows: readonly ProductCsvRow[]): CsvCell[][] {
  return rows.map((row) => PRODUCT_CSV_COLUMNS.map((column) => column.pick(row)))
}
