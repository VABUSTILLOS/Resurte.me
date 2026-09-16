/**
 * SKU y código de barras (migración 00106).
 *
 * Reglas:
 * - SKU: identificador interno legible. Se normaliza (trim, espacios → guiones)
 *   y se acepta `[A-Za-z0-9][A-Za-z0-9._/-]*` hasta 40 caracteres. La
 *   unicidad la garantiza el índice parcial `idx_products_sku_unique`
 *   (productos no borrados); el servidor valida antes de escribir para poder
 *   devolver un 409 claro en lugar de un error de Postgres.
 * - Código de barras: solo dígitos (EAN-8, UPC-A, EAN-13, ITF-14).
 */

export const SKU_MAX_LENGTH = 40
const BARCODE_LENGTHS = [8, 12, 13, 14] as const

const SKU_PATTERN = new RegExp(
  `^[A-Za-z0-9][A-Za-z0-9._/-]{0,${SKU_MAX_LENGTH - 1}}$`
)

/** Normaliza un SKU: trim y espacios internos → guiones. "" → null. */
export function normalizeSku(raw: unknown): string | null {
  if (typeof raw !== "string") return null
  const trimmed = raw.trim().replace(/\s+/g, "-")
  return trimmed.length > 0 ? trimmed : null
}

export function validateSku(
  raw: unknown
): { ok: true; value: string | null } | { ok: false; error: string } {
  if (raw === null || raw === undefined) return { ok: true, value: null }
  if (typeof raw !== "string") return { ok: false, error: "El SKU debe ser texto" }
  const value = normalizeSku(raw)
  if (value === null) return { ok: true, value: null }
  if (value.length > SKU_MAX_LENGTH) {
    return { ok: false, error: `El SKU no puede superar ${SKU_MAX_LENGTH} caracteres` }
  }
  if (!SKU_PATTERN.test(value)) {
    return {
      ok: false,
      error: "El SKU solo admite letras, números, punto, guion, guion bajo y barra",
    }
  }
  return { ok: true, value }
}

export function validateBarcode(
  raw: unknown
): { ok: true; value: string | null } | { ok: false; error: string } {
  if (raw === null || raw === undefined) return { ok: true, value: null }
  if (typeof raw !== "string") {
    return { ok: false, error: "El código de barras debe ser texto" }
  }
  const value = raw.trim().replace(/[\s-]/g, "")
  if (value === "") return { ok: true, value: null }
  if (!/^\d+$/.test(value)) {
    return { ok: false, error: "El código de barras solo admite dígitos" }
  }
  if (!BARCODE_LENGTHS.includes(value.length as (typeof BARCODE_LENGTHS)[number])) {
    return {
      ok: false,
      error: `El código de barras debe tener ${BARCODE_LENGTHS.join(", ")} dígitos`,
    }
  }
  return { ok: true, value }
}
