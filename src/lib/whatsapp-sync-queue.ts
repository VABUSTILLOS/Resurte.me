// ============================================================
// Cola de sync automático de catálogo WhatsApp (WA5).
// Las actions admin encolan productos "sucios"; el cron diario
// vacía la cola con syncs incrementales por catálogo.
// ============================================================

import type { SupabaseClient } from "@supabase/supabase-js"
import { logger } from "@/lib/logger"
import { createServiceClient } from "@/lib/supabase/service"
import { getCatalogWhatsAppConfig, toWhatsAppProduct, validateCatalogProducts, type AdminProduct } from "@/lib/whatsapp-catalogs"
import {
  batchCatalogItems,
  buildCatalogBatchRequests,
  type WhatsAppProduct,
} from "@/lib/whatsapp"

const MAX_ATTEMPTS = 5

interface QueuedRow {
  id: string
  catalog_id: string
  product_id: number
  reason: string
  attempts: number
}

/**
 * Encola productos para sync incremental en todos los catálogos activos
 * que los tienen curados como visibles. Best-effort: nunca rompe la
 * acción admin que lo invoca.
 */
export async function enqueueProductsForWaSync(
  supabase: SupabaseClient,
  productIds: number[],
  reason: string
): Promise<number> {
  if (productIds.length === 0) return 0
  try {
    const { data: rows, error } = await supabase
      .from("whatsapp_catalog_items")
      .select("catalog_id, product_id, whatsapp_catalogs!inner(is_active)")
      .in("product_id", productIds)
      .eq("is_visible", true)
      .eq("whatsapp_catalogs.is_active", true)
    if (error) {
      logger.warn("No se pudo consultar la cola de sync WhatsApp", { error: error.message })
      return 0
    }
    if (!rows?.length) return 0

    const payloads = rows.map((r) => ({
      catalog_id: r.catalog_id as string,
      product_id: r.product_id as number,
      reason,
    }))
    const { error: upsertError } = await supabase
      .from("whatsapp_sync_queue")
      .upsert(payloads, { onConflict: "catalog_id,product_id" })
    if (upsertError) {
      logger.warn("No se pudo encolar el sync de WhatsApp", { error: upsertError.message })
      return 0
    }
    return payloads.length
  } catch (err) {
    logger.warn("enqueueProductsForWaSync falló (best-effort)", {
      error: err instanceof Error ? err.message : String(err),
    })
    return 0
  }
}

/**
 * Vacía la cola: por cada catálogo con pendientes, sube los productos
 * encolados (upsert incremental) y registra un run trigger 'auto'.
 * Un catálogo que falla no detiene a los demás; sus items se reintentan
 * en la siguiente corrida (hasta MAX_ATTEMPTS).
 */
export async function processWaSyncQueue(): Promise<{
  catalogs: number
  synced: number
  failed: number
}> {
  const supabase = await createServiceClient()

  const { data: pending, error } = await supabase
    .from("whatsapp_sync_queue")
    .select("id, catalog_id, product_id, reason, attempts")
    .is("processed_at", null)
    .lt("attempts", MAX_ATTEMPTS)
  if (error) throw new Error(error.message)

  const rows = (pending ?? []) as QueuedRow[]
  if (rows.length === 0) return { catalogs: 0, synced: 0, failed: 0 }

  const byCatalog = new Map<string, QueuedRow[]>()
  for (const row of rows) {
    const list = byCatalog.get(row.catalog_id) ?? []
    list.push(row)
    byCatalog.set(row.catalog_id, list)
  }

  let synced = 0
  let failed = 0

  for (const [catalogId, queueRows] of byCatalog) {
    const markProcessed = async (ok: boolean) => {
      if (ok) {
        await supabase
          .from("whatsapp_sync_queue")
          .update({ processed_at: new Date().toISOString() })
          .in("id", queueRows.map((r) => r.id))
      } else {
        const nextAttempts = Math.max(...queueRows.map((r) => r.attempts)) + 1
        await supabase
          .from("whatsapp_sync_queue")
          .update({ attempts: nextAttempts })
          .in("id", queueRows.map((r) => r.id))
      }
    }

    let runId: string | null = null
    try {
      const { config } = await getCatalogWhatsAppConfig(supabase, catalogId)
      if (!config) throw new Error("Sin credenciales de WhatsApp")

      const { data: run } = await supabase
        .from("whatsapp_sync_runs")
        .insert({ catalog_id: catalogId, trigger_kind: "auto", status: "running" })
        .select("id")
        .single()
      runId = (run?.id as string) ?? null

      const productIds = queueRows.map((r) => r.product_id)
      const { data: products, error: prodError } = await supabase
        .from("products")
        .select("id, name, brand, category_id, image_url, price, sale_price, unit, stock_status")
        .in("id", productIds)
      if (prodError) throw new Error(prodError.message)

      const waProducts = ((products ?? []) as (AdminProduct & { stock_status?: string | null })[])
        .map(toWhatsAppProduct)
        .filter((p): p is WhatsAppProduct => p !== null)

      // WA7: excluir productos que Meta rechazaría.
      const { valid, invalid: invalidQueued } = validateCatalogProducts(waProducts)

      const requests = buildCatalogBatchRequests(valid, "UPDATE")
      const result = await batchCatalogItems(requests, config)

      if (runId) {
        await supabase
          .from("whatsapp_sync_runs")
          .update({
            status: "done",
            updated: valid.length,
            handles: result.handles,
            finished_at: new Date().toISOString(),
          })
          .eq("id", runId)

        // WB2 — detalle por producto (pending hasta resolver handles).
        const itemRows = [
          ...valid.map((p) => ({ run_id: runId, product_id: Number(p.id), action: "update", status: "pending" })),
          ...invalidQueued.map((p) => ({
            run_id: runId,
            product_id: Number(p.id),
            action: "skipped",
            status: "error",
            error: p.reasons.join(", "),
          })),
        ]
        if (itemRows.length > 0) {
          const { error: itemsError } = await supabase.from("whatsapp_sync_items").insert(itemRows)
          if (itemsError) logger.warn("No se pudieron registrar los items del sync auto", { error: itemsError.message })
        }
      }
      synced += valid.length
      await markProcessed(true)
    } catch (err) {
      failed += queueRows.length
      logger.error("processWaSyncQueue: falló el catálogo", {
        catalogId,
        error: err instanceof Error ? err.message : String(err),
      })
      if (runId) {
        await supabase
          .from("whatsapp_sync_runs")
          .update({
            status: "failed",
            error: err instanceof Error ? err.message : String(err),
            finished_at: new Date().toISOString(),
          })
          .eq("id", runId)
      }
      await markProcessed(false)
    }
  }

  return { catalogs: byCatalog.size, synced, failed }
}
