// ============================================================
// Cola de sync automático de catálogo WhatsApp (WA5).
// Las actions admin y el trigger del catálogo principal (`00221`)
// encolan productos "sucios"; el cron diario vacía la cola con
// syncs incrementales por catálogo.
//
// `kind` distingue las dos operaciones:
//   - `upsert`: subir el payload completo del producto a Meta.
//   - `hide`:   marcarlo `out of stock` en Meta.
//
// Ocultar NO borra: el borrado en Meta sigue siendo una
// confirmación explícita del sync manual (invariante WA2). Por eso
// desmarcar un producto en el panel es reversible — volver a
// marcarlo lo devuelve a `in stock` con su payload completo.
// ============================================================

import type { SupabaseClient } from "@supabase/supabase-js"
import { logger } from "@/lib/logger"
import { createServiceClient } from "@/lib/supabase/service"
import { getCatalogWhatsAppConfig, toWhatsAppProduct, validateCatalogProducts, type AdminProduct } from "@/lib/whatsapp-catalogs"
import {
  batchCatalogItems,
  buildCatalogBatchRequests,
  type CatalogBatchRequest,
  type WhatsAppProduct,
} from "@/lib/whatsapp"

const MAX_ATTEMPTS = 5

/**
 * Valores válidos de `whatsapp_sync_queue.kind`.
 * Contrato con el CHECK de `00221_whatsapp_catalogo_principal.sql`, verificado
 * por `whatsapp-default-catalog.contract.test.ts`.
 */
export const WA_QUEUE_KINDS = ["upsert", "hide"] as const
export type WaQueueKind = (typeof WA_QUEUE_KINDS)[number]

interface QueuedRow {
  id: string
  catalog_id: string
  product_id: number
  reason: string
  kind: string
  attempts: number
}

interface QueueProduct extends AdminProduct {
  stock_status?: string | null
  whatsapp_product_id?: string | null
}

/**
 * Separa la cola en sus dos operaciones.
 *
 * Un `kind` desconocido cae en `upserts` a propósito: ante una versión futura
 * de la cola es preferible volver a subir el producto (operación idempotente)
 * que dejarlo sin sincronizar en silencio.
 */
export function partitionQueueByKind<T extends { kind: string }>(
  rows: T[]
): { upserts: T[]; hides: T[] } {
  const upserts: T[] = []
  const hides: T[] = []
  for (const row of rows) {
    if (row.kind === "hide") hides.push(row)
    else upserts.push(row)
  }
  return { upserts, hides }
}

/**
 * Encola productos para sync incremental en TODOS los catálogos activos que
 * los tienen curados como visibles.
 *
 * Re-encolar resetea `attempts`/`processed_at`: sin eso, un producto que ya se
 * sincronizó una vez y vuelve a cambiar quedaba marcado como procesado y su
 * cambio nunca llegaba a Meta.
 *
 * Best-effort: nunca rompe la acción admin que lo invoca.
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
      kind: "upsert" as const,
      attempts: 0,
      queued_at: new Date().toISOString(),
      processed_at: null,
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
 * Encola una operación explícita para UN catálogo.
 *
 * Lo usa la curaduría cuando el catálogo NO es el principal: ahí no hay
 * trigger que encolo por su cuenta (`00221` sólo cubre el principal), así que
 * quitar un producto de la curaduría tiene que pedir el `hide` a mano.
 * Best-effort, igual que el resto de la cola.
 */
export async function enqueueWaSyncForCatalog(
  supabase: SupabaseClient,
  catalogId: string,
  productIds: number[],
  kind: WaQueueKind,
  reason: string
): Promise<number> {
  if (productIds.length === 0) return 0
  try {
    const payloads = productIds.map((product_id) => ({
      catalog_id: catalogId,
      product_id,
      reason,
      kind,
      attempts: 0,
      queued_at: new Date().toISOString(),
      processed_at: null,
    }))
    const { error } = await supabase
      .from("whatsapp_sync_queue")
      .upsert(payloads, { onConflict: "catalog_id,product_id" })
    if (error) {
      logger.warn("No se pudo encolar el sync de WhatsApp por catálogo", {
        catalogId,
        kind,
        error: error.message,
      })
      return 0
    }
    return payloads.length
  } catch (err) {
    logger.warn("enqueueWaSyncForCatalog falló (best-effort)", {
      catalogId,
      kind,
      error: err instanceof Error ? err.message : String(err),
    })
    return 0
  }
}

/**
 * Vacía la cola: por cada catálogo con pendientes, aplica los `upsert` y los
 * `hide` en UN solo batch, y registra un run trigger 'auto'.
 *
 * Un catálogo que falla no detiene a los demás; sus items se reintentan en la
 * siguiente corrida (hasta MAX_ATTEMPTS).
 */
export async function processWaSyncQueue(): Promise<{
  catalogs: number
  synced: number
  failed: number
}> {
  const supabase = await createServiceClient()

  const { data: pending, error } = await supabase
    .from("whatsapp_sync_queue")
    .select("id, catalog_id, product_id, reason, kind, attempts")
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

      const { upserts, hides } = partitionQueueByKind(queueRows)

      const { data: run } = await supabase
        .from("whatsapp_sync_runs")
        .insert({ catalog_id: catalogId, trigger_kind: "auto", status: "running" })
        .select("id")
        .single()
      runId = (run?.id as string) ?? null

      // Una sola lectura cubre las dos operaciones.
      const productIds = [...new Set(queueRows.map((r) => r.product_id))]
      const { data: products, error: prodError } = await supabase
        .from("products")
        .select("id, name, brand, category_id, image_url, price, sale_price, unit, stock_status, whatsapp_product_id")
        .in("id", productIds)
      if (prodError) throw new Error(prodError.message)

      const byId = new Map(((products ?? []) as QueueProduct[]).map((p) => [p.id, p]))

      // --- upsert: payload completo ---
      const waProducts = upserts
        .map((r) => byId.get(r.product_id))
        .filter((p): p is QueueProduct => Boolean(p))
        .map(toWhatsAppProduct)
        .filter((p): p is WhatsAppProduct => p !== null)

      // WA7: excluir productos que Meta rechazaría.
      const { valid, invalid: invalidQueued } = validateCatalogProducts(waProducts)

      // --- hide: fuera de stock en Meta ---
      // Sólo los que ya llegaron a Meta: ocultar uno que nunca se publicó
      // haría fallar el batch con "producto no encontrado". Si alguno quedara
      // fuera por un `whatsapp_product_id` desactualizado, el Explorador Meta
      // lo delata como `only_meta` y se corrige desde ahí.
      const hideTargets = hides
        .map((r) => byId.get(r.product_id))
        .filter((p): p is QueueProduct => p !== undefined && Boolean(p.whatsapp_product_id))
      const hideIds = new Set(hideTargets.map((p) => p.id))
      const hideSkipped = hides.filter((r) => !hideIds.has(r.product_id)).map((r) => r.product_id)

      const hideProducts = hideTargets
        .map(toWhatsAppProduct)
        .filter((p): p is WhatsAppProduct => p !== null)
        .map((p) => ({ ...p, availability: "out of stock" as const }))
      const { valid: validHides, invalid: unvalidatableHides } = validateCatalogProducts(hideProducts)

      const hideRequests: CatalogBatchRequest[] = [
        ...buildCatalogBatchRequests(validHides, "UPDATE"),
        // Un producto que Meta rechazaría con payload completo (p. ej. precio
        // 0) todavía se puede ocultar: el UPDATE mínimo sólo lleva availability.
        ...unvalidatableHides.map((h) => ({
          method: "UPDATE" as const,
          retailer_id: h.id,
          data: { availability: "out of stock" as const },
        })),
      ]

      if (hideSkipped.length > 0) {
        logger.warn("Cola WhatsApp: hide sin producto publicado en Meta, se omite", {
          catalogId,
          products: hideSkipped,
        })
      }

      const requests = [...buildCatalogBatchRequests(valid, "UPDATE"), ...hideRequests]
      const result = requests.length > 0
        ? await batchCatalogItems(requests, config)
        : { handles: [], chunks: 0 }

      // `hide` también es un UPDATE en Meta: entra en el mismo contador.
      const touched = valid.length + hideRequests.length

      if (runId) {
        await supabase
          .from("whatsapp_sync_runs")
          .update({
            status: "done",
            updated: touched,
            handles: result.handles,
            finished_at: new Date().toISOString(),
          })
          .eq("id", runId)

        // WB2 — detalle por producto (pending hasta resolver handles).
        const itemRows = [
          ...valid.map((p) => ({ run_id: runId, product_id: Number(p.id), action: "update", status: "pending" })),
          ...validHides.map((p) => ({ run_id: runId, product_id: Number(p.id), action: "hide", status: "pending" })),
          ...unvalidatableHides.map((p) => ({ run_id: runId, product_id: Number(p.id), action: "hide", status: "pending" })),
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
      synced += touched
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
