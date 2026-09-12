/**
 * Fase 16 — importación masiva de productos vía CSV: plantilla, parser y
 * validación previa (todo puro y testeable; la escritura la hace la API).
 */

import { slugify } from "./foodos"

export const PRODUCT_IMPORT_HEADER = [
  "nombre",
  "slug",
  "precio",
  "precio_oferta",
  "marca",
  "categoria",
  "stock",
  "visible",
] as const

export interface ProductImportRow {
  name: string
  slug: string
  price: number
  sale_price: number | null
  brand: string | null
  category_slug: string | null
  stock_status: "in_stock" | "low_stock" | "out_of_stock"
  is_visible: boolean
}

export interface ProductImportError {
  /** 1-based, contando la fila de encabezado */
  line: number
  message: string
}

export interface ProductImportResult {
  rows: ProductImportRow[]
  errors: ProductImportError[]
}

/** Plantilla descargable con encabezado y una fila de ejemplo. */
export function generateProductImportTemplate(): string {
  const example = [
    "Agua mineral 600ml",
    "agua-mineral-600ml",
    "18.50",
    "",
    "Topo Chico",
    "bebidas",
    "in_stock",
    "si",
  ].join(";")
  return "﻿" + PRODUCT_IMPORT_HEADER.join(";") + "\r\n" + example + "\r\n"
}

/** Divide una línea CSV respetando comillas (separador ; o ,). */
function splitCsvLine(line: string, sep: string): string[] {
  const cells: string[] = []
  let current = ""
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i] ?? ''
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"'
        i++
      } else if (ch === '"') {
        inQuotes = false
      } else {
        current += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === sep) {
      cells.push(current)
      current = ""
    } else {
      current += ch
    }
  }
  cells.push(current)
  return cells.map((c) => c.trim())
}

const VALID_STOCK = new Set(["in_stock", "low_stock", "out_of_stock"])

/**
 * Parsea y valida el CSV pegado/subido. Acepta separador ; o , (detectado
 * por el encabezado), con o sin BOM. Las filas con error NO entran a rows.
 */
export function parseProductImportCsv(text: string): ProductImportResult {
  const rows: ProductImportRow[] = []
  const errors: ProductImportError[] = []

  const clean = text.replace(/^﻿/, "").trim()
  if (!clean) {
    return { rows, errors: [{ line: 1, message: "El CSV está vacío" }] }
  }

  const lines = clean.split(/\r?\n/)
  const headerLine = lines[0] ?? ''
  const sep = headerLine.includes(";") ? ";" : ","
  const header = splitCsvLine(headerLine, sep).map((h) => h.toLowerCase())

  const col = (name: string) => header.indexOf(name)
  if (col("nombre") === -1) {
    return { rows, errors: [{ line: 1, message: "Falta la columna obligatoria 'nombre'" }] }
  }

  for (let i = 1; i < lines.length; i++) {
    const lineNo = i + 1
    const raw = (lines[i] ?? '').trim()
    if (!raw) continue
    const cells = splitCsvLine(lines[i] ?? "", sep)
    const get = (name: string) => (col(name) === -1 ? "" : (cells[col(name)] ?? ""))

    const name = get("nombre")
    if (!name) {
      errors.push({ line: lineNo, message: "nombre vacío" })
      continue
    }

    const priceRaw = get("precio")
    const price = Number(priceRaw)
    if (!priceRaw || !Number.isFinite(price) || price < 0) {
      errors.push({ line: lineNo, message: `precio inválido: "${priceRaw}"` })
      continue
    }

    const saleRaw = get("precio_oferta")
    const salePrice = saleRaw ? Number(saleRaw) : null
    if (saleRaw && (!Number.isFinite(salePrice) || (salePrice ?? 0) < 0)) {
      errors.push({ line: lineNo, message: `precio_oferta inválido: "${saleRaw}"` })
      continue
    }

    const stockRaw = get("stock") || "in_stock"
    if (!VALID_STOCK.has(stockRaw)) {
      errors.push({ line: lineNo, message: `stock inválido: "${stockRaw}" (in_stock | low_stock | out_of_stock)` })
      continue
    }

    const visibleRaw = (get("visible") || "si").toLowerCase()
    const isVisible = !["no", "0", "false"].includes(visibleRaw)

    const slugRaw = get("slug")
    const slug = slugRaw ? slugify(slugRaw) : slugify(name)
    if (!slug) {
      errors.push({ line: lineNo, message: "no se pudo derivar un slug válido" })
      continue
    }

    rows.push({
      name,
      slug,
      price,
      sale_price: salePrice,
      brand: get("marca") || null,
      category_slug: get("categoria") || null,
      stock_status: stockRaw as ProductImportRow["stock_status"],
      is_visible: isVisible,
    })
  }

  return { rows, errors }
}
