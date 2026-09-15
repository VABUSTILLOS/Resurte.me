import { createServiceClient } from "@/lib/supabase/service"
import { revalidateCatalogCache } from "@/lib/catalog-cache"
import { resetCatalogCache } from "@/lib/catalog"
import { logger } from "@/lib/logger"

/**
 * Publicación programada (00096): aplica los publish_at / unpublish_at
 * vencidos. Idempotente — corre como job del cron diario consolidado.
 *
 * - publish_at <= now   → is_visible = true,  publish_at = null
 * - unpublish_at <= now → is_visible = false, unpublish_at = null
 *
 * Después invalida el caché del catálogo y encola el sync de WhatsApp de
 * los productos afectados (best-effort).
 */
export async function applyScheduledPublishing(): Promise<{
  published: number
  unpublished: number
}> {
  const supabase = await createServiceClient()
  const now = new Date().toISOString()

  const { data: toPublish, error: pubErr } = await supabase
    .from("products")
    .update({ is_visible: true, publish_at: null })
    .lte("publish_at", now)
    .not("publish_at", "is", null)
    .select("id")
  if (pubErr) {
    logger.error("[SCHEDULED-PUBLISHING] publish error:", pubErr)
  }

  const { data: toUnpublish, error: unpubErr } = await supabase
    .from("products")
    .update({ is_visible: false, unpublish_at: null })
    .lte("unpublish_at", now)
    .not("unpublish_at", "is", null)
    .select("id")
  if (unpubErr) {
    logger.error("[SCHEDULED-PUBLISHING] unpublish error:", unpubErr)
  }

  const affected = [
    ...(toPublish ?? []).map((p) => p.id as number),
    ...(toUnpublish ?? []).map((p) => p.id as number),
  ]

  if (affected.length > 0) {
    revalidateCatalogCache()
    resetCatalogCache()
    try {
      const { enqueueProductsForWaSync } = await import("@/lib/whatsapp-sync-queue")
      await enqueueProductsForWaSync(supabase, affected, "scheduled_publishing")
    } catch (err) {
      logger.error("[SCHEDULED-PUBLISHING] wa sync enqueue error:", err)
    }
  }

  return {
    published: toPublish?.length ?? 0,
    unpublished: toUnpublish?.length ?? 0,
  }
}
