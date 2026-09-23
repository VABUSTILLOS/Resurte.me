/**
 * Metadatos por fila del listado de productos (WA pendiente, última edición y
 * ventas), y su lectura tolerante a fallos.
 *
 * La ruta `row-meta` pide tres fuentes **decorativas**: la cola de WhatsApp, la
 * bitácora de auditoría y las ventas agregadas. Ninguna es imprescindible para
 * pintar la tabla, así que ninguna puede tumbar la respuesta: cada una degrada
 * por su cuenta y el resultado declara cuáles fallaron (`degraded`), para que el
 * panel pueda avisar en vez de mostrar columnas vacías sin explicación.
 *
 * Las ventas se leen de la vista `products_with_sales` (00116) en vez de agregar
 * `order_items` en la aplicación: una fila por producto, sin el recorte
 * silencioso al `max-rows` de PostgREST y con `idx_order_items_product` de
 * apoyo. La semántica es la misma que el reporte de ventas y que el orden
 * "más vendidos": pedidos con `status <> 'cancelled'`.
 */

/** Fuentes decorativas que pueden degradar de forma independiente. */
export type RowMetaSource = "queue" | "audit" | "sales" | "suppliers"

/**
 * Tope de ids por petición. Coincide con el tamaño de página máximo del panel
 * (`PAGE_SIZE_OPTIONS`), que es el único llamador: pedir más significa que algo
 * cambió en el panel y las filas sobrantes se quedarían sin metadatos.
 */
export const MAX_META_IDS = 200

export interface RowMetaLastEdit {
  at: string
  email: string | null
}

export interface RowMetaPayload {
  waPending: number[]
  lastEdit: Record<string, RowMetaLastEdit>
  sales: Record<string, number>
  salesAmount: Record<string, number>
  /** id de producto -> nombre del proveedor. Ausente = sin proveedor. */
  suppliers: Record<string, string>
  degraded: RowMetaSource[]
}

export interface RowMetaQueueRow {
  product_id: number | null
}

export interface RowMetaAuditRow {
  entity_id: string
  actor_email: string | null
  created_at: string
}

export interface RowMetaSalesRow {
  id: number
  sales_units: number | string | null
  sales_revenue: number | string | null
}

/**
 * Fila ya resuelta: el nombre del proveedor viene aplanado.
 *
 * El join se hace en la ruta y no con un embed de PostgREST a propósito: la
 * relación se devuelve como objeto o como arreglo según cómo infiera la clave
 * foránea, y de eso dependía una insignia que debe ser determinista.
 */
export interface RowMetaSupplierRow {
  product_id: number | null
  is_primary: boolean | null
  supplier_name: string | null
}

export interface RowMetaSourceResult<TRow> {
  /** `false` cuando la lectura falló; la fuente degrada en vez de lanzar. */
  ok: boolean
  rows: TRow[]
}

export interface RowMetaSources {
  queue: RowMetaSourceResult<RowMetaQueueRow>
  audit: RowMetaSourceResult<RowMetaAuditRow>
  sales: RowMetaSourceResult<RowMetaSalesRow>
  suppliers: RowMetaSourceResult<RowMetaSupplierRow>
}

/** `numeric`/`bigint` llegan como cadena en algunos caminos de PostgREST. */
function toNumber(value: number | string | null | undefined): number {
  if (value === null || value === undefined) return 0
  const n = typeof value === "number" ? value : Number(value)
  return Number.isFinite(n) ? n : 0
}

/**
 * Normaliza los ids de la query: enteros positivos, sin duplicados, acotados a
 * `MAX_META_IDS`. Los inválidos se descartan en vez de provocar un 400: es una
 * lectura best-effort.
 */
export function parseMetaIds(raw: string | null | undefined): number[] {
  const ids = (raw ?? "")
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0)
  return [...new Set(ids)].slice(0, MAX_META_IDS)
}

/**
 * Compone la respuesta a partir de las tres fuentes. Puro: no toca red ni
 * Supabase, así que el contrato de degradación se prueba sin mocks.
 */
export function parseRowMetaPayload(sources: RowMetaSources): RowMetaPayload {
  const degraded: RowMetaSource[] = []
  if (!sources.queue.ok) degraded.push("queue")
  if (!sources.audit.ok) degraded.push("audit")
  if (!sources.sales.ok) degraded.push("sales")
  if (!sources.suppliers.ok) degraded.push("suppliers")

  const waPending = sources.queue.ok
    ? [...new Set(sources.queue.rows.map((r) => r.product_id).filter((id): id is number => typeof id === "number"))]
    : []

  const lastEdit: Record<string, RowMetaLastEdit> = {}
  if (sources.audit.ok) {
    for (const row of sources.audit.rows) {
      // La consulta viene ordenada desc: la primera fila por id es la última.
      if (!(row.entity_id in lastEdit)) {
        lastEdit[row.entity_id] = { at: row.created_at, email: row.actor_email }
      }
    }
  }

  // La vista devuelve una fila por producto, pero se acumula igual que antes:
  // así el resultado no depende de que el agregado siga agrupado en SQL.
  const sales: Record<string, number> = {}
  const salesAmount: Record<string, number> = {}
  if (sources.sales.ok) {
    for (const row of sources.sales.rows) {
      const key = String(row.id)
      sales[key] = (sales[key] ?? 0) + toNumber(row.sales_units)
      salesAmount[key] = (salesAmount[key] ?? 0) + toNumber(row.sales_revenue)
    }
  }

  // Proveedor por producto. `is_primary` decide cuando un producto tiene varios
  // vínculos: el panel muestra uno solo, y el primario es el que manda en el
  // precio (00198 y 00191 leen `product_suppliers.cost` con ese orden).
  const suppliers: Record<string, string> = {}
  const supplierRank: Record<string, number> = {}
  if (sources.suppliers.ok) {
    for (const row of sources.suppliers.rows) {
      const id = row.product_id
      const name = row.supplier_name
      if (typeof id !== "number" || !name) continue
      const rank = row.is_primary === false ? 0 : 1
      const key = String(id)
      const current = supplierRank[key]
      if (current !== undefined && current >= rank) continue
      suppliers[key] = name
      supplierRank[key] = rank
    }
  }

  return { waPending, lastEdit, sales, salesAmount, suppliers, degraded }
}
