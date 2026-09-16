/**
 * Ronda 7 — render de la bitácora de productos.
 *
 * `PATCH /api/admin/products/update` guarda el detalle como `{ before, after }`
 * con solo los campos que cambiaron. Las entradas antiguas guardaban el objeto
 * de updates plano (o, más atrás, `{ price }`). Estos helpers son puros y
 * normalizan las tres formas para la UI del modal de historial.
 */

/** Etiquetas en español de los campos auditables de producto. */
export const AUDIT_FIELD_LABEL: Record<string, string> = {
  price: "Precio",
  sale_price: "Precio de oferta",
  sale_starts_at: "Oferta desde",
  sale_ends_at: "Oferta hasta",
  cost: "Costo",
  stock_status: "Estado de stock",
  stock_quantity: "Stock",
  low_stock_threshold: "Umbral de stock bajo",
  is_visible: "Publicado",
  show_in_whatsapp: "En WhatsApp",
  name: "Nombre",
  slug: "Slug",
  brand: "Marca",
  category_id: "Categoría",
  sku: "SKU",
  barcode: "Código de barras",
  tags: "Etiquetas",
  image_url: "Imagen",
  description: "Descripción",
  seo_title: "Título SEO",
  seo_description: "Descripción SEO",
  unit: "Unidad",
  related_product_ids: "Relacionados",
}

const STOCK_STATUS_LABEL: Record<string, string> = {
  in_stock: "Disponible",
  low_stock: "Stock bajo",
  out_of_stock: "Agotado",
}

const MONEY_FIELDS = new Set(["price", "sale_price", "cost"])

export interface AuditDiffRow {
  field: string
  label: string
  before: string
  after: string
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

/** Etiqueta legible del campo; cae al nombre crudo si no hay traducción. */
export function auditFieldLabel(field: string): string {
  return AUDIT_FIELD_LABEL[field] ?? field
}

function formatMoney(value: number): string {
  return `$${value.toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatDate(value: string): string {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString("es-CO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

/** Valor de un campo de la bitácora en texto legible. */
export function formatAuditValue(field: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—"
  if (typeof value === "boolean") return value ? "Sí" : "No"
  if (typeof value === "number") {
    if (MONEY_FIELDS.has(field)) return formatMoney(value)
    return String(value)
  }
  if (Array.isArray(value)) {
    return value.length === 0 ? "—" : value.map((v) => formatAuditValue(field, v)).join(", ")
  }
  if (typeof value === "string") {
    if (field === "stock_status") return STOCK_STATUS_LABEL[value] ?? value
    if (field.endsWith("_at")) return formatDate(value)
    return value
  }
  return JSON.stringify(value)
}

/**
 * Normaliza el `detail` de una entrada de la bitácora a filas antes/después.
 * Devuelve `[]` cuando el detalle no describe cambios por campo (p. ej.
 * `{ name, slug }` de un alta o de una baja).
 */
export function auditDiffRows(detail: unknown): AuditDiffRow[] {
  const record = asRecord(detail)
  if (!record) return []
  const before = asRecord(record.before)
  const after = asRecord(record.after)
  if (!before && !after) return []

  const fields = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])
  return [...fields].map((field) => ({
    field,
    label: auditFieldLabel(field),
    before: formatAuditValue(field, before?.[field]),
    after: formatAuditValue(field, after?.[field]),
  }))
}

/** Campos del detalle que no son el diff (nombre, slug, motivo…). */
export function auditExtraFields(detail: unknown): { label: string; value: string }[] {
  const record = asRecord(detail)
  if (!record) return []
  return Object.entries(record)
    .filter(([key]) => key !== "before" && key !== "after")
    .map(([key, value]) => ({
      label: auditFieldLabel(key),
      value: formatAuditValue(key, value),
    }))
}

export interface PricePoint {
  at: string
  price: number
}

/**
 * Serie de precios para el sparkline del historial. Soporta el formato nuevo
 * (`{ before, after }` con `after.price`) y el antiguo (`{ price }`).
 */
export function priceSeries(
  entries: { created_at: string; detail?: unknown }[]
): PricePoint[] {
  const points: PricePoint[] = []
  for (const entry of entries) {
    const record = asRecord(entry.detail)
    if (!record) continue
    const after = asRecord(record.after)
    const raw = after && "price" in after ? after.price : record.price
    if (typeof raw === "number" && Number.isFinite(raw)) {
      points.push({ at: entry.created_at, price: raw })
    }
  }
  return points
}
