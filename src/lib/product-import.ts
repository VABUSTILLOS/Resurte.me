/**
 * Fase 16 — importación masiva de productos vía CSV: plantilla, parser y
 * validación previa (todo puro y testeable; la escritura la hace la API).
 */

import { slugify } from "./foodos"
import { PRODUCT_CSV_EXAMPLE, PRODUCT_CSV_HEADER, type ProductCsvColumnName } from "./product-csv"
import { validateSku, validateBarcode } from "./sku"
import { deriveStockStatus, DEFAULT_LOW_STOCK_THRESHOLD } from "./stock"

/** Encabezados que acepta la importación. Fuente única en `product-csv.ts`
 *  (compartida con la exportación del panel, para que sigan siendo simétricas). */
export const PRODUCT_IMPORT_HEADER: readonly string[] = PRODUCT_CSV_HEADER

/** Nombre de columna válido en el CSV de productos. */
export type ProductImportColumn = ProductCsvColumnName

export interface ProductImportRow {
  name: string
  slug: string
  price: number
  sale_price: number | null
  sale_starts_at: string | null
  sale_ends_at: string | null
  brand: string | null
  category_slug: string | null
  unit: string | null
  stock_status: "in_stock" | "low_stock" | "out_of_stock"
  stock_quantity: number | null
  low_stock_threshold: number | null
  sku: string | null
  barcode: string | null
  tags: string[]
  /** La columna `etiquetas` viene en el CSV (reemplazo total, incluso a []). */
  tags_provided: boolean
  is_visible: boolean
  image_url: string | null
}

interface ProductImportError {
  /** 1-based, contando la fila de encabezado */
  line: number
  message: string
}

export interface ProductImportResult {
  rows: ProductImportRow[]
  errors: ProductImportError[]
  /** Encabezado leído del CSV, tal cual (recortado), para validarlo en servidor. */
  header: string[]
  columns: ProductImportColumnsReport
}

export interface ProductImportColumnsReport {
  /** Columnas reconocidas, normalizadas (minúsculas). */
  known: string[]
  /** Columnas que no existen en la plantilla: sus datos se ignorarían. */
  unknown: string[]
  /** Columnas repetidas en el encabezado: gana la primera. */
  duplicated: string[]
  /** Columnas obligatorias ausentes. */
  missingRequired: string[]
}

/** Columnas sin las cuales la fila no se puede construir. */
const REQUIRED_IMPORT_COLUMNS = ["nombre", "precio"] as const

const KNOWN_IMPORT_COLUMNS = new Set(PRODUCT_IMPORT_HEADER.map((h) => h.toLowerCase()))

/**
 * Valida el encabezado de un CSV de productos sin parsear las filas. Pura, así
 * que sirve igual en el cliente (aviso previo) y en la API (guarda de entrada).
 */
export function validateImportColumns(headers: readonly string[]): ProductImportColumnsReport {
  const seen = new Set<string>()
  const known: string[] = []
  const unknown: string[] = []
  const duplicated: string[] = []

  for (const raw of headers) {
    const name = raw.trim().toLowerCase()
    if (!name) continue
    if (seen.has(name)) {
      if (!duplicated.includes(name)) duplicated.push(name)
      continue
    }
    seen.add(name)
    if (KNOWN_IMPORT_COLUMNS.has(name)) known.push(name)
    else unknown.push(name)
  }

  const missingRequired = REQUIRED_IMPORT_COLUMNS.filter((name) => !seen.has(name))
  return { known, unknown, duplicated, missingRequired }
}

/** Mensaje de error listo para mostrar, o `null` si el encabezado es utilizable. */
export function describeImportColumns(report: ProductImportColumnsReport): string | null {
  const problems: string[] = []
  if (report.missingRequired.length) {
    problems.push(`faltan columnas obligatorias: ${report.missingRequired.join(", ")}`)
  }
  if (report.unknown.length) {
    problems.push(`columnas desconocidas (se ignorarían): ${report.unknown.join(", ")}`)
  }
  if (report.duplicated.length) {
    problems.push(`columnas repetidas: ${report.duplicated.join(", ")}`)
  }
  return problems.length ? problems.join("; ") : null
}

/** Plantilla descargable con encabezado y una fila de ejemplo. */
export function generateProductImportTemplate(): string {
  const example = PRODUCT_CSV_EXAMPLE.join(";")
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
 * Acepta ISO completo o fecha suelta (YYYY-MM-DD). La fecha suelta se ancla a
 * la zona del negocio (America/Mexico_City, UTC-6 sin horario de verano):
 * inicio de día para la apertura y fin de día para el cierre de la oferta.
 */
export function parseImportDate(raw: string, edge: "start" | "end"): string | null {
  if (!raw) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return edge === "start" ? `${raw}T00:00:00-06:00` : `${raw}T23:59:59-06:00`
  }
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/** Etiquetas separadas por "|" (minúsculas, sin duplicados). */
export function parseImportTags(raw: string): string[] {
  if (!raw) return []
  const seen = new Set<string>()
  for (const part of raw.split("|")) {
    const clean = part.trim().toLowerCase()
    if (clean) seen.add(clean)
  }
  return [...seen]
}

/**
 * Parsea y valida el CSV pegado/subido. Acepta separador ; o , (detectado
 * por el encabezado), con o sin BOM. Las filas con error NO entran a rows.
 */
export function parseProductImportCsv(text: string): ProductImportResult {
  const rows: ProductImportRow[] = []
  const errors: ProductImportError[] = []
  const emptyHeader: string[] = []
  const emptyColumns = validateImportColumns(emptyHeader)

  const clean = text.replace(/^﻿/, "").trim()
  if (!clean) {
    return {
      rows,
      errors: [{ line: 1, message: "El CSV está vacío" }],
      header: emptyHeader,
      columns: emptyColumns,
    }
  }

  const lines = clean.split(/\r?\n/)
  const headerLine = lines[0] ?? ''
  const sep = headerLine.includes(";") ? ";" : ","
  const rawHeader = splitCsvLine(headerLine, sep).map((h) => h.trim())
  const header = rawHeader.map((h) => h.toLowerCase())
  const columns = validateImportColumns(rawHeader)

  const col = (name: string) => header.indexOf(name)
  if (col("nombre") === -1) {
    return {
      rows,
      errors: [{ line: 1, message: "Falta la columna obligatoria 'nombre'" }],
      header: rawHeader,
      columns,
    }
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

    const stockRaw = get("stock")
    const qtyRaw = get("cantidad")
    const thresholdRaw = get("umbral_stock")

    let lowStockThreshold: number | null = null
    if (thresholdRaw) {
      const threshold = Number(thresholdRaw)
      if (!Number.isInteger(threshold) || threshold < 0) {
        errors.push({ line: lineNo, message: `umbral_stock inválido: "${thresholdRaw}"` })
        continue
      }
      lowStockThreshold = threshold
    }

    let stockQuantity: number | null = null
    if (qtyRaw) {
      const qty = Number(qtyRaw)
      if (!Number.isInteger(qty) || qty < 0) {
        errors.push({ line: lineNo, message: `cantidad inválida: "${qtyRaw}"` })
        continue
      }
      stockQuantity = qty
    }

    // La columna `stock` manda si viene; si no, se deriva de la cantidad con el
    // umbral de la fila (o el umbral por defecto).
    let stockStatus: ProductImportRow["stock_status"]
    if (stockRaw) {
      if (!VALID_STOCK.has(stockRaw)) {
        errors.push({ line: lineNo, message: `stock inválido: "${stockRaw}" (in_stock | low_stock | out_of_stock)` })
        continue
      }
      stockStatus = stockRaw as ProductImportRow["stock_status"]
    } else if (stockQuantity !== null) {
      stockStatus = deriveStockStatus(
        stockQuantity,
        lowStockThreshold ?? DEFAULT_LOW_STOCK_THRESHOLD
      )
    } else {
      stockStatus = "in_stock"
    }

    const skuRaw = get("sku")
    let sku: string | null = null
    if (skuRaw) {
      const check = validateSku(skuRaw)
      if (!check.ok) {
        errors.push({ line: lineNo, message: check.error })
        continue
      }
      sku = check.value
    }

    const barcodeRaw = get("barcode")
    let barcode: string | null = null
    if (barcodeRaw) {
      const check = validateBarcode(barcodeRaw)
      if (!check.ok) {
        errors.push({ line: lineNo, message: check.error })
        continue
      }
      barcode = check.value
    }

    const tags = parseImportTags(get("etiquetas"))
    if (tags.length > 20) {
      errors.push({ line: lineNo, message: "etiquetas: máximo 20 por producto" })
      continue
    }
    if (tags.some((t) => t.length > 40)) {
      errors.push({ line: lineNo, message: "etiquetas: máximo 40 caracteres cada una" })
      continue
    }

    const startsRaw = get("oferta_desde")
    const endsRaw = get("oferta_hasta")
    const saleStartsAt = parseImportDate(startsRaw, "start")
    const saleEndsAt = parseImportDate(endsRaw, "end")
    if (startsRaw && !saleStartsAt) {
      errors.push({ line: lineNo, message: `oferta_desde inválida: "${startsRaw}"` })
      continue
    }
    if (endsRaw && !saleEndsAt) {
      errors.push({ line: lineNo, message: `oferta_hasta inválida: "${endsRaw}"` })
      continue
    }
    if (saleStartsAt && saleEndsAt && new Date(saleStartsAt) > new Date(saleEndsAt)) {
      errors.push({ line: lineNo, message: "oferta_desde es posterior a oferta_hasta" })
      continue
    }

    const visibleRaw = (get("visible") || "si").toLowerCase()
    const isVisible = !["no", "0", "false"].includes(visibleRaw)

    const imageRaw = get("imagen")
    if (imageRaw && !imageRaw.startsWith("https://") && !imageRaw.startsWith("/")) {
      errors.push({
        line: lineNo,
        message: `imagen inválida: "${imageRaw}" (debe ser URL https o ruta local)`,
      })
      continue
    }

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
      sale_starts_at: saleStartsAt,
      sale_ends_at: saleEndsAt,
      brand: get("marca") || null,
      category_slug: get("categoria") || null,
      unit: get("unidad") || null,
      stock_status: stockStatus,
      stock_quantity: stockQuantity,
      low_stock_threshold: lowStockThreshold,
      sku,
      barcode,
      tags,
      tags_provided: col("etiquetas") !== -1,
      is_visible: isVisible,
      image_url: imageRaw || null,
    })
  }

  return { rows, errors, header: rawHeader, columns }
}
