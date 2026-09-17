/**
 * Fuente única del orden del listado de productos (panel admin).
 *
 * El panel y `/api/admin/products/list` comparten estas reglas para que la URL
 * (`?sort=`/`?dir=`), el estado de React, el `aria-sort` de la cabecera y el
 * `ORDER BY` de PostgREST nunca se desincronicen.
 *
 * Alcance deliberado: solo columnas reales de `products`. Ordenar por ventas o
 * margen exigiría un agregado server-side que hoy no existe (los importes viven
 * en `row-meta`), así que esas columnas siguen siendo informativas.
 */

export const PRODUCT_SORT_KEYS = [
  "name",
  "price",
  "stock",
  "quantity",
  "cost",
  "created_at",
] as const

export type ProductSortKey = (typeof PRODUCT_SORT_KEYS)[number]
export type ProductSortDir = "asc" | "desc"

export interface ProductSort {
  key: ProductSortKey
  dir: ProductSortDir
}

/** Orden por defecto = el de la consulta inicial (nombre ascendente). */
export const DEFAULT_PRODUCT_SORT: ProductSort = { key: "name", dir: "asc" }

export const PRODUCT_SORT_LABEL: Record<ProductSortKey, string> = {
  name: "Nombre",
  price: "Precio",
  stock: "Stock (estado)",
  quantity: "Unidades",
  cost: "Costo",
  created_at: "Fecha de alta",
}

/** Claves que tienen botón en la cabecera de la tabla (`aria-sort`). */
export const PRODUCT_TABLE_SORT_KEYS: readonly ProductSortKey[] = ["name", "price", "stock"]

export function isProductSortKey(value: string | null | undefined): value is ProductSortKey {
  return typeof value === "string" && (PRODUCT_SORT_KEYS as readonly string[]).includes(value)
}

/**
 * Normaliza `?sort=`/`?dir=` sin lanzar: cualquier valor desconocido (o vacío)
 * cae al orden por defecto, igual que el resto de parámetros del listado.
 */
export function parseProductSort(
  rawKey: string | null | undefined,
  rawDir: string | null | undefined
): ProductSort {
  return {
    key: isProductSortKey(rawKey) ? rawKey : DEFAULT_PRODUCT_SORT.key,
    dir: rawDir === "desc" ? "desc" : "asc",
  }
}

/** Clic en una cabecera: misma columna alterna dirección, otra empieza en asc. */
export function nextProductSort(current: ProductSort, key: ProductSortKey): ProductSort {
  if (current.key !== key) return { key, dir: "asc" }
  return { key, dir: current.dir === "asc" ? "desc" : "asc" }
}

/**
 * Valor de `aria-sort` para una cabecera ordenable. `aria-sort` va en el `<th>`
 * (o en un `columnheader`), nunca en el `<button>` de dentro.
 */
export function ariaSortFor(
  key: ProductSortKey,
  current: ProductSort
): "ascending" | "descending" | "none" {
  if (current.key !== key) return "none"
  return current.dir === "asc" ? "ascending" : "descending"
}

export interface ProductSortOrderClause {
  column: string
  ascending: boolean
  /** `undefined` deja el default de PostgREST (se usa en `stock_status`). */
  nullsFirst?: boolean
}

/**
 * Cláusulas `ORDER BY` para PostgREST. `stock` ordena por severidad del estado
 * (`in_stock` < `low_stock` < `out_of_stock`, orden alfabético de la columna)
 * con el nombre como desempate estable.
 */
export function productSortOrderClauses(sort: ProductSort): ProductSortOrderClause[] {
  const ascending = sort.dir === "asc"
  if (sort.key === "stock") {
    return [
      { column: "stock_status", ascending },
      { column: "name", ascending: true },
    ]
  }
  const column =
    sort.key === "price"
      ? "price"
      : sort.key === "quantity"
        ? "stock_quantity"
        : sort.key === "cost"
          ? "cost"
          : sort.key === "created_at"
            ? "created_at"
            : "name"
  return [{ column, ascending, nullsFirst: false }]
}

/**
 * Parámetros de URL del orden. El default se omite para no ensuciar la URL ni
 * romper los deep-links existentes.
 */
export function productSortSearchParams(sort: ProductSort): Record<string, string> {
  const params: Record<string, string> = {}
  if (sort.key !== DEFAULT_PRODUCT_SORT.key) params.sort = sort.key
  if (sort.dir !== DEFAULT_PRODUCT_SORT.dir) params.dir = sort.dir
  return params
}

/** Columnas que cada clave necesita para poder ordenar de verdad. */
const SORT_REQUIRED_COLUMNS: Record<ProductSortKey, string[]> = {
  name: ["name"],
  price: ["price"],
  stock: ["stock_status", "name"],
  quantity: ["stock_quantity"],
  cost: ["cost"],
  created_at: ["created_at"],
}

/**
 * Degradación de columnas: si el set de columnas disponible (las migraciones
 * pueden faltar) no soporta la clave pedida, se vuelve al orden por defecto en
 * vez de dejar que PostgREST falle con `42703`.
 */
export function clampProductSortToColumns(sort: ProductSort, columns: string): ProductSort {
  const available = new Set(
    columns
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean)
  )
  const required = SORT_REQUIRED_COLUMNS[sort.key]
  return required.every((c) => available.has(c)) ? sort : DEFAULT_PRODUCT_SORT
}

/** Etiqueta del control que alterna la dirección. */
export function productSortDirLabel(dir: ProductSortDir): string {
  return dir === "asc" ? "Ascendente" : "Descendente"
}
