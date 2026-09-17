/**
 * Vistas guardadas del listado de /admin/productos (B20).
 *
 * Una "vista" es la URL canónica del listado: filtros (`admin-product-filters`),
 * orden (`admin-product-sort`), vista tabla/tarjetas y tamaño de página. Guardar
 * y restaurar es serializar esa query y navegar a ella, así que un preset nunca
 * puede describir algo que la URL no reproduzca — no hay formato paralelo que se
 * desincronice de los filtros.
 *
 * La persistencia es local (`localStorage`, como las vistas de Pedidos): son
 * preferencias de quien mira el panel, no datos del catálogo, y no necesitan
 * migración ni viajar entre dispositivos.
 */

import {
  activeProductFilterCount,
  parseProductFilters,
  PRODUCT_FLAG_KEYS,
  type ProductFlagKey,
} from "@/lib/admin-product-filters"
import { parseProductSort, PRODUCT_SORT_LABEL } from "@/lib/admin-product-sort"

export interface ProductPreset {
  name: string
  /** Query canónica sin `?`, tal como la escribe el panel en la URL. */
  query: string
}

export const PRODUCT_PRESETS_STORAGE_KEY = "admin-productos-vistas"

/** Tope de vistas guardadas: la fila de chips debe seguir cabiendo sin scroll infinito. */
export const MAX_PRODUCT_PRESETS = 8
const MAX_PRESET_NAME = 40

/**
 * Parámetros que NO forman parte de una vista: guardar `?page=7` haría que la
 * vista abriera en una página que puede no existir con esos filtros.
 */
const PRESET_IGNORED_PARAMS: readonly string[] = ["page"]

/** Etiquetas de los filtros rápidos, compartidas con los chips de la barra. */
export const PRODUCT_FLAG_LABELS: Record<ProductFlagKey, string> = {
  noImage: "Sin imagen",
  noCities: "Sin ciudades",
  noPrice: "Sin precio",
  noCategory: "Sin categoría",
  waMismatch: "WA sin publicar",
  onSale: "En oferta",
  dupNames: "Nombres duplicados",
  trash: "Papelera",
  staleSale: "Ofertas vencidas",
  underThreshold: "Bajo umbral",
  brokenImage: "Imagen rota",
}

export const PRODUCT_STOCK_LABELS: Record<string, string> = {
  in_stock: "En stock",
  low_stock: "Stock bajo",
  out_of_stock: "Sin stock",
}

export const PRODUCT_STATUS_LABELS: Record<string, string> = {
  published: "Publicados",
  unpublished: "Ocultos",
}

/**
 * Query canónica de una vista: sin `page`, sin valores vacíos y con los
 * parámetros ordenados. Sin esto, la misma vista escrita en otro orden no se
 * reconocería como activa ni reemplazaría a la anterior al guardarla.
 */
export function normalizePresetQuery(query: string): string {
  const raw = query.startsWith("?") ? query.slice(1) : query
  const pairs: [string, string][] = []
  for (const [key, value] of new URLSearchParams(raw)) {
    if (PRESET_IGNORED_PARAMS.includes(key)) continue
    if (value === "") continue
    pairs.push([key, value])
  }
  pairs.sort((a, b) => (a[0] === b[0] ? a[1].localeCompare(b[1]) : a[0].localeCompare(b[0])))
  const sp = new URLSearchParams()
  for (const [key, value] of pairs) sp.append(key, value)
  return sp.toString()
}

/** Comparación de nombres sin distinguir mayúsculas ni espacios sobrantes. */
function sameName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

/**
 * Parsea el JSON de `localStorage`. Nunca lanza: un valor corrupto, de otra
 * versión del panel o manipulado a mano se descarta entero en vez de romper la
 * barra de filtros.
 */
export function parseProductPresets(json: string | null): ProductPreset[] {
  if (!json) return []
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    return []
  }
  if (!Array.isArray(raw)) return []

  const out: ProductPreset[] = []
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) continue
    const { name, query } = entry as { name?: unknown; query?: unknown }
    if (typeof name !== "string" || typeof query !== "string") continue
    const preset = makeProductPreset(name, query)
    if (!preset) continue
    // Un nombre repetido en el almacenamiento (edición manual) se queda con el primero.
    if (out.some((p) => sameName(p.name, preset.name))) continue
    out.push(preset)
    if (out.length >= MAX_PRODUCT_PRESETS) break
  }
  return out
}

export function serializeProductPresets(presets: ProductPreset[]): string {
  return JSON.stringify(presets.slice(0, MAX_PRODUCT_PRESETS))
}

/**
 * Clave de las vistas de la versión anterior del panel, que guardaba un objeto
 * `params` en vez de la query canónica. Se lee una sola vez, para que cambiar de
 * formato no borre las vistas que el admin ya tenía guardadas.
 */
export const PRODUCT_PRESETS_LEGACY_KEY = "resurte-admin-product-views"

/**
 * Convierte las vistas del formato antiguo (`{ name, params }`) al actual. Pasa
 * por `parseProductPresets`, así que hereda la normalización, el descarte de
 * entradas corruptas y el tope.
 */
export function parseLegacyProductPresets(json: string | null): ProductPreset[] {
  if (!json) return []
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    return []
  }
  if (!Array.isArray(raw)) return []

  const converted: { name: string; query: string }[] = []
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) continue
    const { name, params } = entry as { name?: unknown; params?: unknown }
    if (typeof name !== "string" || typeof params !== "object" || params === null) continue
    const sp = new URLSearchParams()
    for (const [key, value] of Object.entries(params as Record<string, unknown>)) {
      if (typeof value === "string" && value !== "") sp.set(key, value)
    }
    converted.push({ name, query: sp.toString() })
  }
  return parseProductPresets(JSON.stringify(converted))
}

/**
 * Crea un preset normalizado, o `null` si el nombre queda vacío.
 *
 * La vista sin filtros es válida a propósito: "Catálogo completo" es un atajo
 * legítimo para volver al estado inicial.
 */
export function makeProductPreset(name: string, query: string): ProductPreset | null {
  const clean = name.trim().slice(0, MAX_PRESET_NAME)
  if (!clean) return null
  return { name: clean, query: normalizePresetQuery(query) }
}

/**
 * Añade o reemplaza una vista por nombre (sin distinguir mayúsculas). Al
 * reemplazar conserva la posición, y al añadir una nueva por encima del tope
 * descarta la más antigua: la fila de chips mantiene las vistas recientes.
 */
export function upsertProductPreset(
  presets: ProductPreset[],
  preset: ProductPreset
): ProductPreset[] {
  const index = presets.findIndex((p) => sameName(p.name, preset.name))
  if (index >= 0) {
    const next = [...presets]
    next[index] = preset
    return next
  }
  const next = [...presets, preset]
  return next.length > MAX_PRODUCT_PRESETS ? next.slice(next.length - MAX_PRODUCT_PRESETS) : next
}

export function removeProductPreset(presets: ProductPreset[], name: string): ProductPreset[] {
  return presets.filter((p) => !sameName(p.name, name))
}

/** ¿La vista guardada es la que se está viendo ahora? */
export function isActiveProductPreset(preset: ProductPreset, currentQuery: string): boolean {
  return preset.query === normalizePresetQuery(currentQuery)
}

/** Cuántos filtros aplica la vista (el número del chip). */
export function productPresetFilterCount(preset: ProductPreset): number {
  return activeProductFilterCount(parseProductFilters(new URLSearchParams(preset.query)))
}

/**
 * Resumen legible de una vista, para el `title` del chip: qué filtra y con qué
 * orden. Se construye con las etiquetas compartidas para que el texto no
 * invente un vocabulario distinto al de la barra de filtros.
 */
export function describeProductPreset(preset: ProductPreset): string {
  const sp = new URLSearchParams(preset.query)
  const filters = parseProductFilters(sp)
  const parts: string[] = []

  if (filters.search.trim()) parts.push(`«${filters.search.trim()}»`)
  if (filters.category !== "all") parts.push(`Categoría: ${filters.category}`)
  if (filters.tag !== "all") parts.push(`Etiqueta: ${filters.tag}`)
  if (filters.brand !== "all") parts.push(`Marca: ${filters.brand}`)
  if (filters.city !== "all") parts.push(`Ciudad: ${filters.city}`)
  if (filters.stock !== "all") parts.push(PRODUCT_STOCK_LABELS[filters.stock] ?? filters.stock)
  if (filters.status !== "all") parts.push(PRODUCT_STATUS_LABELS[filters.status] ?? filters.status)
  for (const key of PRODUCT_FLAG_KEYS) {
    if (filters[key]) parts.push(PRODUCT_FLAG_LABELS[key])
  }

  const sort = parseProductSort(sp.get("sort"), sp.get("dir"))
  parts.push(`${PRODUCT_SORT_LABEL[sort.key]} ${sort.dir === "asc" ? "↑" : "↓"}`)
  if (sp.get("view") === "grid") parts.push("Tarjetas")

  return parts.join(" · ")
}
