/**
 * Helpers puros del listado de /admin/productos.
 *
 * Estaban dentro de `page.tsx` (6 000+ líneas), donde no se podían probar sin
 * montar el componente entero. No tienen estado ni acceso a red salvo por los
 * dos fetchers, que reciben sus ids y devuelven `null` en vez de lanzar.
 */

export interface AvailabilityRow {
  product_id: number
  city_id: number
  is_available: boolean
}

export type AvailabilityMap = Map<number, Map<number, boolean>>

/**
 * Tope de ids por petición. Espejo del `MAX_IDS` de city-availability y del
 * `MAX_PAGE_SIZE` de list: por encima de esto el servidor recorta en silencio,
 * así que el panel trocea en lugar de perder parte de la selección.
 */
export const IDS_PER_REQUEST = 1000

/** Tiempo relativo en español para "última edición" de la fila. */
export function timeAgo(iso: string, now = Date.now()): string {
  const diff = now - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return "ahora"
  if (m < 60) return `hace ${m} min`
  const h = Math.floor(m / 60)
  if (h < 24) return `hace ${h} h`
  const d = Math.floor(h / 24)
  if (d < 30) return `hace ${d} d`
  return new Date(iso).toLocaleDateString("es-MX")
}

/** Badge ✨ Nuevo: producto creado en los últimos 7 días. */
export function isNewProduct(p: { created_at: string | null }, now = Date.now()): boolean {
  if (!p.created_at) return false
  return now - new Date(p.created_at).getTime() < 7 * 24 * 60 * 60 * 1000
}

/** "N productos" con la concordancia correcta en singular. */
export function productCount(n: number): string {
  return `${n} producto${n === 1 ? "" : "s"}`
}

/**
 * Celdas de disponibilidad agrupadas por producto.
 *
 * Clave ausente = sin filas en `product_city_availability` = "Global" (visible
 * en todas las ciudades), que no es lo mismo que "no disponible en ninguna".
 */
export function buildMap(rows: AvailabilityRow[]): AvailabilityMap {
  const map: AvailabilityMap = new Map()
  for (const row of rows) {
    const inner = map.get(row.product_id) ?? new Map<number, boolean>()
    inner.set(row.city_id, row.is_available)
    map.set(row.product_id, inner)
  }
  return map
}

export function chunkIds(ids: number[]): number[][] {
  const chunks: number[][] = []
  for (let i = 0; i < ids.length; i += IDS_PER_REQUEST) {
    chunks.push(ids.slice(i, i + IDS_PER_REQUEST))
  }
  return chunks
}

/** Tope de tandas que restaura un deep-link `?page=N` al abrir el panel: sin
 *  él, una URL con una página alta dispara cientos de peticiones en serie. */
export const MAX_RESTORE_PAGES = 10

/**
 * Tandas que el scroll infinito carga al reiniciar el listado.
 *
 * Tres casos que no pueden confundirse entre sí:
 * - primer render (`prevListKey === null`): respeta el deep-link `?page=N`;
 * - listado nuevo (filtros, orden o tanda distintos): primera tanda, porque lo
 *   cargado ya no pertenece a lo que se va a pedir;
 * - recarga de los mismos datos (edición, borrado): la profundidad alcanzada,
 *   para no devolver al admin al principio del catálogo.
 */
export function pagesToRestore({
  prevListKey,
  listKey,
  page,
  initialPage,
  max = MAX_RESTORE_PAGES,
}: {
  prevListKey: string | null
  listKey: string
  page: number
  initialPage: number
  max?: number
}): number {
  const target = prevListKey === null ? initialPage : prevListKey === listKey ? page : 1
  return Math.min(Math.max(1, Math.trunc(target) || 1), max)
}
