// ============================================================
// Resolución de batches asíncronos de Meta (WB1/WB2/WB5).
// items_batch devuelve handles; Meta puede rechazar productos
// DESPUÉS del envío. Este módulo consulta los handles, vuelca
// los errores a whatsapp_sync_items y limpia runs huérfanos.
// ============================================================

import type { SupabaseClient } from "@supabase/supabase-js"
import { logger } from "@/lib/logger"
import { createServiceClient } from "@/lib/supabase/service"
import { getCatalogWhatsAppConfig } from "@/lib/whatsapp-catalogs"
import {
  getBatchStatus,
  isBatchFinished,
  parseBatchErrors,
  type WhatsAppConfig,
} from "@/lib/whatsapp"

/** Runs `running` con más de estas horas se consideran interrumpidos. */
export const ORPHAN_RUN_MAX_AGE_HOURS = 6

/** Regla pura (testeable): ¿run huérfano? */
export function isOrphanRun(startedAt: string | Date, now: Date = new Date()): boolean {
  const started = startedAt instanceof Date ? startedAt : new Date(startedAt)
  const ageMs = now.getTime() - started.getTime()
  return ageMs > ORPHAN_RUN_MAX_AGE_HOURS * 3_600_000
}

export interface ResolveRunResult {
  runId: string
  /** true = todos los handles terminaron y los items quedaron resueltos. */
  resolved: boolean
  okItems: number
  errorItems: number
  pendingHandles: number
}

/**
 * Resuelve los handles de un run: si Meta terminó todos los batches,
 * marca los items pending como ok/error (con el mensaje de Meta) y
 * anota un resumen en el run. Si falta alguno, no toca nada.
 */
export async function resolveRunBatchHandles(
  supabase: SupabaseClient,
  runId: string,
  config: WhatsAppConfig
): Promise<ResolveRunResult> {
  const { data: run, error } = await supabase
    .from("whatsapp_sync_runs")
    .select("id, handles")
    .eq("id", runId)
    .maybeSingle()
  if (error) throw new Error(error.message)

  const handles = Array.isArray(run?.handles) ? (run.handles as string[]) : []
  const base: ResolveRunResult = { runId, resolved: true, okItems: 0, errorItems: 0, pendingHandles: 0 }
  if (!run || handles.length === 0) return base

  const allErrors: { retailer_id: string | null; message: string }[] = []
  let pendingHandles = 0
  for (const handle of handles) {
    try {
      const status = await getBatchStatus(handle, config)
      if (!isBatchFinished(status.status)) {
        pendingHandles++
        continue
      }
      allErrors.push(...parseBatchErrors(status))
    } catch (err) {
      // Un handle que no se puede consultar no bloquea a los demás.
      pendingHandles++
      logger.warn("No se pudo consultar el handle de Meta", {
        handle,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  if (pendingHandles > 0) {
    return { ...base, resolved: false, pendingHandles }
  }

  const { count: pendingCount } = await supabase
    .from("whatsapp_sync_items")
    .select("id", { count: "exact", head: true })
    .eq("run_id", runId)
    .eq("status", "pending")

  // Marcar todo como ok y luego sobreescribir los que Meta rechazó.
  const { error: okError } = await supabase
    .from("whatsapp_sync_items")
    .update({ status: "ok" })
    .eq("run_id", runId)
    .eq("status", "pending")
  if (okError) throw new Error(okError.message)

  const errorByRetailer = new Map<string, string>()
  for (const e of allErrors) {
    if (e.retailer_id && !errorByRetailer.has(e.retailer_id)) {
      errorByRetailer.set(e.retailer_id, e.message)
    }
  }

  let errorItems = 0
  for (const [retailerId, message] of errorByRetailer) {
    const productId = Number(retailerId)
    if (!Number.isFinite(productId)) continue
    const { data: updated, error: itemError } = await supabase
      .from("whatsapp_sync_items")
      .update({ status: "error", error: message })
      .eq("run_id", runId)
      .eq("product_id", productId)
      .select("id")
    if (itemError) {
      logger.warn("No se pudo marcar el item como error", { runId, productId, error: itemError.message })
      continue
    }
    errorItems += updated?.length ?? 0
  }

  const okItems = Math.max(0, (pendingCount ?? 0) - errorItems)

  if (errorItems > 0) {
    await supabase
      .from("whatsapp_sync_runs")
      .update({ error: `${errorItems} producto(s) rechazados por Meta` })
      .eq("id", runId)
  }

  return { runId, resolved: true, okItems, errorItems, pendingHandles: 0 }
}

/**
 * Job del cron: resuelve los runs con items pendientes (handles de Meta)
 * y marca como fallidos los runs `running` huérfanos (> 6 h).
 */
export async function resolvePendingSyncRuns(): Promise<{
  runsChecked: number
  runsResolved: number
  itemsWithError: number
  orphansFailed: number
}> {
  const supabase = await createServiceClient()

  const { data: pendingItems, error } = await supabase
    .from("whatsapp_sync_items")
    .select("run_id")
    .eq("status", "pending")
  if (error) throw new Error(error.message)

  const runIds = [...new Set((pendingItems ?? []).map((i) => i.run_id as string))]
  let runsResolved = 0
  let itemsWithError = 0

  if (runIds.length > 0) {
    const { data: runs } = await supabase
      .from("whatsapp_sync_runs")
      .select("id, catalog_id")
      .in("id", runIds)

    for (const run of runs ?? []) {
      try {
        const { config } = await getCatalogWhatsAppConfig(supabase, run.catalog_id as string)
        if (!config) continue
        const result = await resolveRunBatchHandles(supabase, run.id as string, config)
        if (result.resolved) {
          runsResolved++
          itemsWithError += result.errorItems
        }
      } catch (err) {
        logger.error("resolvePendingSyncRuns: falló un run", {
          runId: run.id,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }
  }

  // Runs huérfanos: running con más de ORPHAN_RUN_MAX_AGE_HOURS.
  const cutoff = new Date(Date.now() - ORPHAN_RUN_MAX_AGE_HOURS * 3_600_000).toISOString()
  const { data: orphans } = await supabase
    .from("whatsapp_sync_runs")
    .update({
      status: "failed",
      error: "interrumpido (sin cierre en 6 h)",
      finished_at: new Date().toISOString(),
    })
    .eq("status", "running")
    .lt("started_at", cutoff)
    .select("id")

  return {
    runsChecked: runIds.length,
    runsResolved,
    itemsWithError,
    orphansFailed: orphans?.length ?? 0,
  }
}
