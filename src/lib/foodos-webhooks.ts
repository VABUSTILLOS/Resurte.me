// ============================================================
// Webhooks salientes de FoodOS: notifica pedidos nuevos a URLs
// externas del restaurante con firma HMAC-SHA256 (estilo take.app
// / Shopify). Se dispara fire-and-forget desde el API de pedidos.
// ============================================================

import { createHmac } from "crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import { logger } from "@/lib/logger"

export function signWebhookPayload(secret: string, body: string): string {
  return createHmac("sha256", secret).update(body).digest("hex")
}

interface WebhookRow {
  id: string
  url: string
  secret: string
}

/**
 * Envía el evento `order.created` a todos los webhooks activos del
 * restaurante y registra la entrega. Nunca lanza: un endpoint caído
 * no debe romper la creación del pedido.
 */
export async function dispatchOrderCreated(
  supabase: SupabaseClient,
  restaurantId: string,
  order: Record<string, unknown>
): Promise<void> {
  try {
    const { data: hooks } = await supabase
      .from("foodos_webhooks")
      .select("id, url, secret")
      .eq("restaurant_id", restaurantId)
      .eq("is_active", true)
    if (!hooks?.length) return

    const body = JSON.stringify({
      event: "order.created",
      timestamp: new Date().toISOString(),
      data: order,
    })

    await Promise.allSettled(
      (hooks as WebhookRow[]).map(async (hook) => {
        let responseCode: number | null = null
        let success = false
        try {
          const res = await fetch(hook.url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-FoodOS-Event": "order.created",
              "X-FoodOS-Signature": signWebhookPayload(hook.secret, body),
            },
            body,
            signal: AbortSignal.timeout(8_000),
          })
          responseCode = res.status
          success = res.ok
        } catch (e) {
          logger.warn(`Webhook ${hook.id} falló:`, {
            message: e instanceof Error ? e.message : String(e),
          })
        }
        await supabase.from("foodos_webhook_deliveries").insert({
          webhook_id: hook.id,
          order_id: (order.id as string) ?? null,
          event: "order.created",
          response_code: responseCode,
          success,
        })
      })
    )
  } catch (e) {
    logger.error("dispatchOrderCreated error:", e)
  }
}
