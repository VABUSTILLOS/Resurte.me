/**
 * Notificaciones persistentes por usuario (migración 00070).
 *
 * notifyUser() es best-effort: nunca lanza. Los productores son eventos
 * reales del negocio (pedido confirmado/en camino/entregado, cashback
 * abonado, canje, factura revisada). La campana de /recompensas las lee
 * vía /api/notifications; el estado "leído" vive en read_at (no en
 * localStorage), así sobrevive entre dispositivos.
 */

import { createServiceClient } from "@/lib/supabase/service"
import { logger } from "@/lib/logger"

export interface NotifyInput {
  userId: string
  type: string
  title: string
  body?: string
  actionUrl?: string
  /** Para dedupe por evento de pedido (unique index order_id+type). */
  orderId?: number
}

export async function notifyUser(input: NotifyInput): Promise<void> {
  try {
    const supabase = await createServiceClient()
    const { error } = await supabase.from("notifications").insert({
      user_id: input.userId,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      action_url: input.actionUrl ?? null,
      order_id: input.orderId ?? null,
    })
    if (error) {
      // 23505 = unique violation: evento ya notificado (dedupe) — no es error.
      if (error.code !== "23505") {
        logger.warn("notifications.insert", { type: input.type, message: error.message })
      }
    }
  } catch (err) {
    logger.error("notifications.error", err)
  }
}
