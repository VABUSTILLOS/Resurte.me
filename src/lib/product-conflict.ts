import { timeAgo } from "./admin-product-list"

/**
 * Concurrencia optimista del panel de Productos (Ronda 10, B19).
 *
 * El panel manda `expectedUpdatedAt` (el `updated_at` que leyó). Si la fila ya
 * cambió, la escritura se rechaza con 409 en vez de pisar el cambio ajeno.
 * Sin `expectedUpdatedAt` el comportamiento es el de siempre (última escritura
 * gana), así que un cliente viejo sigue funcionando.
 */
export interface ConflictCurrent {
  id?: number | null
  name?: string | null
  updated_at?: string | null
}

export interface ProductConflictPayload {
  error: string
  code: "stale_write"
  field: null
  conflict: {
    /** `updated_at` vigente en la base, para que el panel se resincronice. */
    currentUpdatedAt: string | null
    /** Fila actual (recortada) por si el panel quiere mostrar qué cambió. */
    current: Record<string, unknown> | null
  }
}

/**
 * ¿La escritura se apoya en una versión ya superada?
 *
 * Solo compara cuando ambos extremos existen y son fechas válidas: si el
 * cliente no pide precondición, o la fila no expone `updated_at` (esquema
 * anterior a la migración), no se bloquea nada. Se usa `>` y no `!==` para no
 * marcar como conflicto un `updated_at` más antiguo (relojes desfasados o una
 * importación que reescribió la fecha hacia atrás).
 */
export function isStaleWrite(
  currentUpdatedAt: string | null | undefined,
  expected: string | null | undefined
): boolean {
  if (!expected) return false
  if (!currentUpdatedAt) return false
  const currentMs = Date.parse(currentUpdatedAt)
  const expectedMs = Date.parse(expected)
  if (!Number.isFinite(currentMs) || !Number.isFinite(expectedMs)) return false
  return currentMs > expectedMs
}

/** Mensaje para el panel, con la antigüedad de la edición ajena. */
export function describeConflict(currentUpdatedAt: string | null, now = Date.now()): string {
  if (!currentUpdatedAt) {
    return "Otro usuario modificó este producto mientras lo editabas. Recarga para ver los cambios."
  }
  return `Otro usuario modificó este producto ${timeAgo(currentUpdatedAt, now)}. Recarga para ver los cambios y vuelve a aplicar tu edición.`
}

/** Cuerpo del 409: código estable + fila vigente + mensaje legible. */
export function conflictPayload(
  current: ConflictCurrent | null,
  now = Date.now()
): ProductConflictPayload {
  const currentUpdatedAt = current?.updated_at ?? null
  return {
    error: describeConflict(currentUpdatedAt, now),
    code: "stale_write",
    field: null,
    conflict: {
      currentUpdatedAt,
      current: current ? (current as Record<string, unknown>) : null,
    },
  }
}

/** Motivo corto por id para el resumen de fallos del lote (B19). */
export const STALE_WRITE_REASON = "Modificado por otro usuario; recarga e inténtalo de nuevo"

/** Lee la fila vigente del cuerpo del 409 (para el panel). */
export function conflictFromResponse(
  body: unknown
): { currentUpdatedAt: string | null; current: Record<string, unknown> | null } | null {
  if (!body || typeof body !== "object") return null
  const conflict = (body as { conflict?: unknown }).conflict
  if (!conflict || typeof conflict !== "object") return null
  const { currentUpdatedAt, current } = conflict as {
    currentUpdatedAt?: unknown
    current?: unknown
  }
  return {
    currentUpdatedAt: typeof currentUpdatedAt === "string" ? currentUpdatedAt : null,
    current:
      current && typeof current === "object" ? (current as Record<string, unknown>) : null,
  }
}

/**
 * Precondiciones por id para el lote (`POST /api/admin/products/bulk`).
 * Formato: `{ "12": "2026-01-01T00:00:00Z", ... }`.
 */
export function parseExpectedMap(raw: unknown): Map<number, string> {
  const map = new Map<number, string>()
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return map
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const id = Number(key)
    if (!Number.isInteger(id) || id <= 0) continue
    if (typeof value !== "string" || !value) continue
    map.set(id, value)
  }
  return map
}

/** Ids del lote cuya versión ya no es la vigente (los que provocan 409). */
export function staleIds(
  expected: Map<number, string>,
  currentRows: readonly ConflictCurrent[]
): number[] {
  if (expected.size === 0) return []
  const currentById = new Map<number, string | null>()
  for (const row of currentRows) {
    if (typeof row.id !== "number") continue
    currentById.set(row.id, row.updated_at ?? null)
  }
  const stale: number[] = []
  for (const [id, expectedUpdatedAt] of expected) {
    if (!currentById.has(id)) continue
    if (isStaleWrite(currentById.get(id), expectedUpdatedAt)) stale.push(id)
  }
  return stale.sort((a, b) => a - b)
}
