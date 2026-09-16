/**
 * Papelera de productos (ronda 7): retención y purga definitiva.
 *
 * Los productos eliminados viven en `products.deleted_at` (00099) y se pueden
 * restaurar. Pasada la retención se purgan (DELETE real) salvo que tengan
 * pedidos: `order_items.product_id` es ON DELETE CASCADE, así que borrar un
 * producto con ventas destruiría el historial. Esos se conservan.
 *
 * La lógica pura (fechas) vive aquí para poder probarla; el I/O de Supabase
 * está en `purgeTrashProducts`.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { logger } from "@/lib/logger"

/** Días que un producto permanece en la papelera antes de purgarse. */
export const TRASH_RETENTION_DAYS = 30

/** Tope de productos purgados por corrida (acota el tiempo de la petición). */
export const PURGE_MAX_PER_RUN = 500

/** Fecha en que el producto se purga, o null si no está en la papelera. */
export function purgeAt(deletedAt: string | Date | null | undefined): Date | null {
  if (!deletedAt) return null
  const date = deletedAt instanceof Date ? deletedAt : new Date(deletedAt)
  if (Number.isNaN(date.getTime())) return null
  return new Date(date.getTime() + TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000)
}

/**
 * Días completos que faltan para la purga. Negativo o 0 = ya vencida.
 * null = el producto no está en la papelera.
 */
export function daysUntilPurge(
  deletedAt: string | Date | null | undefined,
  now: Date = new Date()
): number | null {
  const at = purgeAt(deletedAt)
  if (!at) return null
  return Math.ceil((at.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
}

/** true cuando la retención venció y el producto es candidato a purga. */
export function isPurgeDue(
  deletedAt: string | Date | null | undefined,
  now: Date = new Date()
): boolean {
  const days = daysUntilPurge(deletedAt, now)
  return days !== null && days <= 0
}

/** Texto de la fila de papelera: "se purga hoy" / "se purga en N días". */
export function purgeLabel(
  deletedAt: string | Date | null | undefined,
  now: Date = new Date()
): string | null {
  const days = daysUntilPurge(deletedAt, now)
  if (days === null) return null
  if (days <= 0) return "se purga hoy"
  return `se purga en ${days} día${days === 1 ? "" : "s"}`
}

export interface PurgeTrashOptions {
  /** Productos concretos a purgar. Sin esto se purga toda la papelera. */
  productIds?: number[]
  /** true = purga sin esperar la retención (acción manual del admin). */
  ignoreRetention?: boolean
  retentionDays?: number
  maxPerRun?: number
  now?: Date
}

export interface PurgeTrashResult {
  scanned: number
  purged: number
  purgedIds: number[]
  /** Se conservan porque tienen pedidos (borrarlos perdería el historial). */
  keptWithOrders: number[]
  /** Se conservan porque aún no vence la retención. */
  keptNotDue: number[]
  hasMore: boolean
}

/** Productos de la papelera candidatos a purga. */
async function loadCandidates(
  supabase: SupabaseClient,
  options: PurgeTrashOptions
): Promise<{ id: number; deleted_at: string | null }[]> {
  const limit = options.maxPerRun ?? PURGE_MAX_PER_RUN
  let query = supabase
    .from("products")
    .select("id,deleted_at")
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: true })

  if (options.productIds && options.productIds.length > 0) {
    // Lista explícita: se traen todos y la retención se evalúa en memoria para
    // poder reportar los que aún no vencen.
    query = query.in("id", options.productIds).limit(limit)
  } else {
    query = query.limit(limit + 1)
    if (!options.ignoreRetention) {
      const retention = options.retentionDays ?? TRASH_RETENTION_DAYS
      const cutoff = new Date(
        (options.now ?? new Date()).getTime() - retention * 24 * 60 * 60 * 1000
      ).toISOString()
      query = query.lte("deleted_at", cutoff)
    }
  }

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as { id: number; deleted_at: string | null }[]
}

/** IDs de la lista que aparecen en algún pedido (no se pueden purgar). */
async function idsWithOrders(supabase: SupabaseClient, ids: number[]): Promise<Set<number>> {
  if (ids.length === 0) return new Set()
  const { data, error } = await supabase.from("order_items").select("product_id").in("product_id", ids)
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as unknown as { product_id: number }[]
  return new Set(rows.map((r) => r.product_id))
}

/**
 * Purga definitivamente los productos de la papelera que ya cumplieron la
 * retención y no tienen pedidos. Devuelve el detalle para el panel y el cron.
 */
export async function purgeTrashProducts(
  supabase: SupabaseClient,
  options: PurgeTrashOptions = {}
): Promise<PurgeTrashResult> {
  const limit = options.maxPerRun ?? PURGE_MAX_PER_RUN
  const explicit = Boolean(options.productIds && options.productIds.length > 0)
  const candidates = await loadCandidates(supabase, options)
  const hasMore = !explicit && candidates.length > limit
  const page = hasMore ? candidates.slice(0, limit) : candidates

  if (page.length === 0) {
    return { scanned: 0, purged: 0, purgedIds: [], keptWithOrders: [], keptNotDue: [], hasMore: false }
  }

  const now = options.now ?? new Date()
  const due = options.ignoreRetention
    ? page
    : page.filter((row) => isPurgeDue(row.deleted_at, now))
  const keptNotDue = page.filter((row) => !due.includes(row)).map((row) => row.id)

  const protectedIds = await idsWithOrders(
    supabase,
    due.map((row) => row.id)
  )
  const purgeable = due.filter((row) => !protectedIds.has(row.id))
  const purgedIds = purgeable.map((row) => row.id)

  if (purgedIds.length > 0) {
    const { error } = await supabase.from("products").delete().in("id", purgedIds)
    if (error) throw new Error(error.message)
    logger.info("[PURGE-TRASH] purged", { count: purgedIds.length, ids: purgedIds.slice(0, 20) })
  }

  return {
    scanned: page.length,
    purged: purgedIds.length,
    purgedIds,
    keptWithOrders: due.filter((row) => protectedIds.has(row.id)).map((row) => row.id),
    keptNotDue,
    hasMore,
  }
}
