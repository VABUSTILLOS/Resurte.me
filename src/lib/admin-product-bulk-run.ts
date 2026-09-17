/**
 * Ejecución de las acciones masivas del panel de productos.
 *
 * Vive fuera de `page.tsx` por dos razones: se puede probar sin montar el
 * componente, y las llamadas por lote dejan de ser una función anónima dentro
 * de un archivo de 6 000 líneas.
 *
 * La escritura masiva tiene una sola vía — `POST /api/admin/products/bulk` — y
 * este módulo es el único que la llama desde el panel.
 */

import { BULK_CHUNK, chunkList, type BulkFailure } from "@/lib/product-bulk"

/**
 * Ids por petición desde el cliente. Coincide con el trozo interno del
 * servidor (`BULK_CHUNK`): el trabajo de base de datos es el mismo, pero la
 * barra de progreso avanza por pasos reales y el botón de cancelar tiene dónde
 * cortar. Sigue siendo un puñado de peticiones, no una por producto.
 */
export const BULK_CLIENT_CHUNK = BULK_CHUNK

export type BulkOptions = {
  /** Se llama al terminar cada bloque, con (hechos, total). */
  onProgress?: (done: number, total: number) => void
  /** Se consulta antes de cada bloque: `true` detiene el proceso. */
  isCancelled?: () => boolean
}

export type BulkResult = {
  updated: number[]
  failed: BulkFailure[]
  /** `true` si el usuario canceló antes de procesar todos los ids. */
  cancelled: boolean
}

/**
 * Trocea por el tope del endpoint y devuelve qué ids se guardaron y cuáles no.
 * Los errores de red o HTTP se traducen a fallos **por id** en vez de lanzar:
 * en una acción sobre 300 productos, abortar por un fallo parcial es peor que
 * reportarlo.
 */
export async function postBulk(
  ids: number[],
  payload: { patch?: Record<string, unknown>; patches?: Record<string, Record<string, unknown>> },
  options: BulkOptions = {}
): Promise<BulkResult> {
  const updated: number[] = []
  const failed: BulkFailure[] = []
  if (ids.length === 0) return { updated, failed, cancelled: false }
  let done = 0
  for (const idsChunk of chunkList(ids, BULK_CLIENT_CHUNK)) {
    if (options.isCancelled?.()) return { updated, failed, cancelled: true }
    const body: Record<string, unknown> = { ids: idsChunk }
    const patches = payload.patches
    if (patches) {
      body.patches = Object.fromEntries(idsChunk.map((id) => [String(id), patches[String(id)]]))
    } else {
      body.patch = payload.patch
    }
    try {
      const res = await fetch("/api/admin/products/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const reason: string = data.error ?? "Error al actualizar en lote"
        for (const id of idsChunk) failed.push({ id, reason })
      } else {
        if (Array.isArray(data.updated)) updated.push(...data.updated)
        if (Array.isArray(data.failed)) failed.push(...data.failed)
      }
    } catch {
      for (const id of idsChunk) failed.push({ id, reason: "Sin conexión" })
    }
    done += idsChunk.length
    options.onProgress?.(done, ids.length)
  }
  return { updated, failed, cancelled: false }
}

/** El mismo cambio para todos: una sola petición por bloque de ids. */
export function bulkPatch(
  ids: number[],
  patch: Record<string, unknown>,
  options?: BulkOptions
): Promise<BulkResult> {
  return postBulk(ids, { patch }, options)
}

/**
 * Un cambio calculado por producto (subir precios un %, sumar una etiqueta a
 * las que ya tiene). Devolver `null` omite ese producto sin reportarlo como
 * fallo: el llamador decide si lo menciona.
 */
export function bulkPatchEach<T extends { id: number }>(
  products: T[],
  patchFor: (product: T) => Record<string, unknown> | null,
  options?: BulkOptions
): Promise<BulkResult> {
  const ids: number[] = []
  const patches: Record<string, Record<string, unknown>> = {}
  for (const product of products) {
    const patch = patchFor(product)
    if (!patch) continue
    ids.push(product.id)
    patches[String(product.id)] = patch
  }
  return postBulk(ids, { patches }, options)
}

export type PerIdResult = {
  ok: number[]
  failed: BulkFailure[]
  cancelled: boolean
}

/**
 * Para los endpoints que no aceptan lote (borrar, duplicar): una petición por
 * id, de a una, para poder reportar progreso y cortar al cancelar.
 *
 * Secuencial a propósito: 200 peticiones simultáneas contra el mismo servidor
 * no son más rápidas y sí más difíciles de cancelar.
 */
export async function runPerId(
  ids: number[],
  request: (id: number) => Promise<Response>,
  options: BulkOptions = {}
): Promise<PerIdResult> {
  const ok: number[] = []
  const failed: BulkFailure[] = []
  let done = 0
  for (const id of ids) {
    if (options.isCancelled?.()) return { ok, failed, cancelled: true }
    try {
      const res = await request(id)
      if (res.ok) {
        ok.push(id)
      } else {
        const data = await res.json().catch(() => ({}))
        failed.push({ id, reason: data.error ?? "Error del servidor" })
      }
    } catch {
      failed.push({ id, reason: "Sin conexión" })
    }
    done++
    options.onProgress?.(done, ids.length)
  }
  return { ok, failed, cancelled: false }
}

export type BulkFailureSummary = {
  count: number
  /** Motivos agrupados, de más a menos frecuente. */
  reasons: { reason: string; count: number }[]
}

/**
 * Agrupa los fallos por motivo para el resumen posterior a un lote. Un toast
 * con "37 no se pudieron actualizar" no dice qué hacer; el motivo sí.
 */
export function summarizeBulkFailures(failed: BulkFailure[]): BulkFailureSummary {
  const byReason = new Map<string, number>()
  for (const failure of failed) {
    const reason = failure.reason.trim() || "Error desconocido"
    byReason.set(reason, (byReason.get(reason) ?? 0) + 1)
  }
  const reasons = [...byReason.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason))
  return { count: failed.length, reasons }
}
