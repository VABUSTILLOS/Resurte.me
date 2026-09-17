/**
 * Lógica pura de la selección de filas del panel de productos.
 *
 * Vive fuera del hook (`use-product-selection`) porque el entorno de pruebas
 * del repo es `node`, sin DOM: el hook solo guarda el estado y delega aquí, así
 * que las reglas que de verdad importan (Shift+clic, "seleccionar todo el
 * filtro") se prueban sin montar React.
 */

/** Alterna un id sin mutar el conjunto anterior. */
export function toggleSelected(prev: ReadonlySet<number>, id: number): Set<number> {
  const next = new Set(prev)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  return next
}

/**
 * Posiciones (inclusive) del rango a marcar con Shift+clic, o `null` si el
 * ancla o el destino ya no están en la página visible —por ejemplo si se cambió
 * de página entre los dos clics—. En ese caso no se inventa un rango: se trata
 * como un clic normal.
 */
export function shiftRange(
  pageIds: readonly number[],
  anchorId: number,
  id: number
): { from: number; to: number } | null {
  const a = pageIds.indexOf(anchorId)
  const b = pageIds.indexOf(id)
  if (a === -1 || b === -1) return null
  return a < b ? { from: a, to: b } : { from: b, to: a }
}

/** Añade al conjunto el rango `[from, to]` por posición en la página. */
export function addRange(
  prev: ReadonlySet<number>,
  pageIds: readonly number[],
  from: number,
  to: number
): Set<number> {
  const next = new Set(prev)
  for (let i = from; i <= to; i++) {
    const id = pageIds[i]
    if (id !== undefined) next.add(id)
  }
  return next
}

/** `true` cuando la selección cubre todos los resultados del filtro. */
export function isAllFilteredSelected(total: number, selectedSize: number): boolean {
  return total > 0 && selectedSize >= total
}

/**
 * Ids de TODOS los resultados del filtro, página a página (`idsOnly=1`).
 *
 * La selección puede abarcar páginas que no están en pantalla, así que los ids
 * se piden al servidor en vez de acumular los visibles: el número de filas
 * sobre el que actúan las acciones en lote tiene que coincidir con el total que
 * reporta la API.
 *
 * Se detiene ante la primera página que falle o llegue vacía. Una selección
 * parcial es preferible a un bucle infinito o a un error de red que dejaría al
 * admin sin nada seleccionado.
 */
export async function collectFilteredIds(
  buildListQuery: (extra: Record<string, string>) => string,
  idsPerRequest: number,
  fetchImpl: typeof fetch = fetch
): Promise<number[]> {
  const ids: number[] = []
  let pageIdx = 1
  for (;;) {
    const res = await fetchImpl(
      `/api/admin/products/list?${buildListQuery({
        idsOnly: "1",
        page: String(pageIdx),
        pageSize: String(idsPerRequest),
      })}`
    )
    const data = (await res.json().catch(() => ({}))) as { ids?: number[]; total?: number }
    if (!res.ok) break
    const batch = data.ids ?? []
    ids.push(...batch)
    if (ids.length >= (data.total ?? 0) || batch.length === 0) break
    pageIdx++
  }
  return ids
}
