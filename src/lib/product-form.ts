/**
 * Validación del formulario de producto (`ProductFormModal`).
 *
 * Vive en `src/lib/` porque es una regla pura: se puede probar sin React ni
 * Supabase, y el modal solo la usa para pintar. Las reglas ESPEJAN las de
 * `POST /api/admin/products/create` y `PATCH /api/admin/products/update`: al
 * cambiar una hay que cambiar la otra, y el cliente debe adelantarse para que
 * el usuario no descubra el problema después de guardar.
 *
 * Devuelve TODOS los errores a la vez (no se detiene en el primero) porque el
 * modal los pinta campo por campo; `firstInvalid` es el que recibe el foco.
 */

import { validateSku, validateBarcode } from "./sku"

/** Campos del formulario que participan en la validación. */
export interface ProductFormInput {
  name: string
  price: string
  salePrice: string
  cost: string
  stockQuantity: string
  lowStockThreshold: string
  sku: string
  barcode: string
  saleStartsAt: string
  saleEndsAt: string
}

export interface ProductFormValidation {
  /** Clave de campo → mensaje. Vacío cuando el formulario es válido. */
  errors: Record<string, string>
  /** Clave del primer campo inválido (el que recibe el foco), o null. */
  firstInvalid: string | null
  /** Valores ya parseados para el payload; null = "sin valor". */
  price: number | null
  salePrice: number | null
  cost: number | null
  stockQuantity: number | null
  lowStockThreshold: number | null
}

/** Clave de error → `id` del control que recibe el foco al reintentar. */
export const PRODUCT_FIELD_INPUT_IDS: Record<string, string> = {
  name: "pf-name",
  category: "pf-category",
  price: "pf-price",
  salePrice: "pf-sale",
  cost: "pf-cost",
  stockQuantity: "pf-qty",
  lowStockThreshold: "pf-threshold",
  sku: "pf-sku",
  barcode: "pf-barcode",
  saleWindow: "pf-sale-start",
}

/** Cadena vacía (o solo espacios) → sin valor; si no, número finito o NaN. */
function parseDecimal(raw: string): number | null {
  return raw.trim() === "" ? null : parseFloat(raw)
}

function parseInteger(raw: string): number | null {
  return raw.trim() === "" ? null : parseInt(raw, 10)
}

function isInvalidNumber(value: number | null): boolean {
  return value !== null && (!Number.isFinite(value) || value < 0)
}

function isInvalidInteger(value: number | null): boolean {
  return value !== null && (!Number.isInteger(value) || value < 0)
}

export function validateProductForm(input: ProductFormInput): ProductFormValidation {
  const errors: Record<string, string> = {}

  if (!input.name.trim()) errors.name = "El nombre es obligatorio"

  const price = parseDecimal(input.price)
  if (isInvalidNumber(price)) errors.price = "Precio inválido"

  const salePrice = parseDecimal(input.salePrice)
  if (isInvalidNumber(salePrice)) errors.salePrice = "Precio de oferta inválido"

  const cost = parseDecimal(input.cost)
  if (isInvalidNumber(cost)) errors.cost = "Costo inválido"

  const stockQuantity = parseInteger(input.stockQuantity)
  if (isInvalidInteger(stockQuantity)) errors.stockQuantity = "Cantidad de stock inválida"

  const lowStockThreshold = parseInteger(input.lowStockThreshold)
  if (isInvalidInteger(lowStockThreshold)) {
    errors.lowStockThreshold = "Umbral de stock bajo inválido"
  }

  const skuCheck = validateSku(input.sku)
  if (!skuCheck.ok) errors.sku = skuCheck.error

  const barcodeCheck = validateBarcode(input.barcode)
  if (!barcodeCheck.ok) errors.barcode = barcodeCheck.error

  if (
    input.saleStartsAt &&
    input.saleEndsAt &&
    new Date(input.saleStartsAt) > new Date(input.saleEndsAt)
  ) {
    errors.saleWindow = "La oferta no puede empezar después de terminar"
  }

  const keys = Object.keys(errors)
  const [firstInvalid] = keys
  return {
    errors,
    firstInvalid: firstInvalid ?? null,
    price,
    salePrice,
    cost,
    stockQuantity,
    lowStockThreshold,
  }
}
