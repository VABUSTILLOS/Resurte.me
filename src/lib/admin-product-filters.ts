/**
 * Modelo único de los filtros de /admin/productos.
 *
 * El panel usa los mismos filtros en tres sitios distintos: la URL (para que un
 * enlace reproduzca la vista), la query de la API de listado y el contador de
 * "filtros activos" del encabezado. Antes cada uno enumeraba los filtros a mano,
 * así que añadir uno nuevo y olvidar uno de los tres producía un deep-link que
 * mentía, una consulta que ignoraba el filtro o un contador desfasado.
 *
 * Aquí la lista de claves booleanas es la fuente única: `PRODUCT_FLAG_KEYS`
 * genera el parseo, la serialización y los parámetros de la API.
 */

import { supplierFilterValue } from "@/lib/admin-supplier-panel"

export type StockStatus = "in_stock" | "low_stock" | "out_of_stock"
export type PublicationFilter = "all" | "published" | "unpublished"


/** Filtros booleanos de "catálogo incompleto" + los de Ronda 7. */
export const PRODUCT_FLAG_KEYS = [
  "noImage",
  "noCities",
  "noPrice",
  "noCategory",
  "waMismatch",
  "onSale",
  "dupNames",
  "trash",
  "staleSale",
  "underThreshold",
  "brokenImage",
] as const

export type ProductFlagKey = (typeof PRODUCT_FLAG_KEYS)[number]

export interface ProductFilters {
  /** Texto ya debounced (el que viaja a la API). */
  search: string
  category: string
  stock: StockStatus | "all"
  status: PublicationFilter
  tag: string
  city: string
  brand: string
  /**
   * Proveedor: `all`, `none` (productos sin proveedor) o el `slug` del
   * proveedor. Es un `<select>` como ciudad y marca, no un chip, así que no
   * participa de los contadores del RPC `admin_product_filter_counts`.
   */
  supplier: string
  noImage: boolean
  noCities: boolean
  noPrice: boolean
  noCategory: boolean
  waMismatch: boolean
  onSale: boolean
  dupNames: boolean
  trash: boolean
  staleSale: boolean
  underThreshold: boolean
  brokenImage: boolean
}

/** Lo mínimo que necesita el parseo: sirve `URLSearchParams` y `ReadonlyURLSearchParams`. */
export interface FilterSource {
  get(key: string): string | null
}

export const DEFAULT_STOCK_FILTER: StockStatus | "all" = "all"
export const DEFAULT_STATUS_FILTER: PublicationFilter = "all"

const STOCK_VALUES: readonly string[] = ["in_stock", "low_stock", "out_of_stock"]
const STATUS_VALUES: readonly string[] = ["published", "unpublished"]

/** `"all"` como valor de los filtros de texto = sin filtro. */
const ALL = "all"

export const EMPTY_PRODUCT_FILTERS: ProductFilters = {
  search: "",
  category: ALL,
  stock: DEFAULT_STOCK_FILTER,
  status: DEFAULT_STATUS_FILTER,
  tag: ALL,
  city: ALL,
  brand: ALL,
  supplier: ALL,
  noImage: false,
  noCities: false,
  noPrice: false,
  noCategory: false,
  waMismatch: false,
  onSale: false,
  dupNames: false,
  trash: false,
  staleSale: false,
  underThreshold: false,
  brokenImage: false,
}

function parseFlags(sp: FilterSource): Record<ProductFlagKey, boolean> {
  const flags = {} as Record<ProductFlagKey, boolean>
  for (const key of PRODUCT_FLAG_KEYS) flags[key] = sp.get(key) === "1"
  return flags
}

/**
 * Filtros a partir de la URL.
 *
 * Los filtros de texto usan `||` y no `??` a propósito: un `?category=` vacío
 * (`""`) se trataría como filtro activo y dejaría el listado en blanco, sin
 * error, hasta que el usuario limpiara la URL.
 *
 * Un `stock`/`status` desconocido cae a `"all"` en vez de propagarse a la API,
 * que lo rechazaría con un 400.
 */
export function parseProductFilters(sp: FilterSource): ProductFilters {
  const stock = sp.get("stock")
  const status = sp.get("status")
  return {
    search: sp.get("q") ?? "",
    category: sp.get("category") || ALL,
    stock: stock && STOCK_VALUES.includes(stock) ? (stock as StockStatus) : DEFAULT_STOCK_FILTER,
    status:
      status && STATUS_VALUES.includes(status)
        ? (status as PublicationFilter)
        : DEFAULT_STATUS_FILTER,
    tag: sp.get("tag") || ALL,
    city: sp.get("city") || ALL,
    brand: sp.get("brand") || ALL,
    supplier: supplierFilterValue(sp.get("supplier")),
    ...parseFlags(sp),
  }
}

/**
 * Filtros a query de URL. Solo se escriben los que difieren del default: un
 * `?noImage=0` o un `?category=all` ensucian el enlace sin cambiar la vista.
 *
 * `into` permite añadir los filtros a un `URLSearchParams` que ya trae orden,
 * página o vista, y así no encadenar dos objetos.
 */
export function productFiltersToSearchParams(
  filters: ProductFilters,
  into?: URLSearchParams
): URLSearchParams {
  const sp = into ?? new URLSearchParams()
  if (filters.search) sp.set("q", filters.search)
  if (filters.category !== ALL) sp.set("category", filters.category)
  if (filters.stock !== DEFAULT_STOCK_FILTER) sp.set("stock", filters.stock)
  if (filters.status !== DEFAULT_STATUS_FILTER) sp.set("status", filters.status)
  for (const key of PRODUCT_FLAG_KEYS) if (filters[key]) sp.set(key, "1")
  if (filters.tag !== ALL) sp.set("tag", filters.tag)
  if (filters.city !== ALL) sp.set("city", filters.city)
  if (filters.brand !== ALL) sp.set("brand", filters.brand)
  if (filters.supplier !== ALL) sp.set("supplier", filters.supplier)
  return sp
}

/**
 * Filtros a query de la API. Aquí los booleanos van explícitos como `"1"`/`"0"`
 * (la API los lee con `=== "1"`) y los filtros de texto llevan su valor aunque
 * sea `"all"`: la ruta conoce sus propios defaults.
 */
export function productFilterApiParams(filters: ProductFilters): Record<string, string> {
  const params: Record<string, string> = {
    q: filters.search,
    category: filters.category,
    stock: filters.stock,
    status: filters.status,
    tag: filters.tag,
    city: filters.city,
    brand: filters.brand,
    supplier: filters.supplier,
  }
  for (const key of PRODUCT_FLAG_KEYS) params[key] = filters[key] ? "1" : "0"
  return params
}

/**
 * Cuántos filtros están activos (el badge del botón "Limpiar filtros").
 *
 * El texto se mide con `trim()`: un `q="   "` no filtra nada en la API, así que
 * no debe contar como filtro activo.
 */
export function activeProductFilterCount(filters: ProductFilters): number {
  let count = 0
  if (filters.search.trim() !== "") count++
  if (filters.category !== ALL) count++
  if (filters.stock !== DEFAULT_STOCK_FILTER) count++
  if (filters.status !== DEFAULT_STATUS_FILTER) count++
  if (filters.city !== ALL) count++
  if (filters.brand !== ALL) count++
  if (filters.supplier !== ALL) count++
  if (filters.tag !== ALL) count++
  for (const key of PRODUCT_FLAG_KEYS) if (filters[key]) count++
  return count
}

/**
 * Filtros sin ninguno aplicado, conservando lo que no es un filtro (nada hoy,
 * pero deja el punto de extensión explícito para el llamador).
 */
export function clearedProductFilters(): ProductFilters {
  return { ...EMPTY_PRODUCT_FILTERS }
}
