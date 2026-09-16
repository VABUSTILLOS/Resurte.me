/**
 * Notificaciones persistentes por usuario (migración 00073).
 *
 * notifyUser() es best-effort: nunca lanza. Los productores son eventos
 * reales del negocio (pedido confirmado/en camino/entregado, cashback
 * abonado, canje, factura revisada). La campana de /recompensas las lee
 * vía /api/notifications; el estado "leído" vive en read_at (no en
 * localStorage), así sobrevive entre dispositivos.
 *
 * notifyCashbackCredited() es el único productor del evento
 * 'cashback_credited': todas las vías de pago (panel, webhook de Stripe,
 * reconciliación) deben usarlo en lugar de armar el texto a mano, para que
 * el monto salga siempre del monedero real y el dedupe sea el mismo.
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

/**
 * Notifica al usuario que su pedido generó cashback en el monedero.
 *
 * Se llama desde TODAS las transiciones a `payment_status = 'paid'`
 * (panel/admin, webhook de Stripe, reconciliación de pagos). El monto se
 * lee del monedero —el abono real que hizo el trigger—, nunca del caller:
 * si la orden no generó créditos no hay nada que anunciar.
 *
 * Idempotente: `notifyUser` inserta con `order_id`, y el índice único
 * (order_id, type) descarta reintentos y webhooks duplicados.
 */
export async function notifyCashbackCredited(orderId: number): Promise<void> {
  try {
    const supabase = await createServiceClient()

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("user_id, cashback_tier")
      .eq("id", orderId)
      .maybeSingle()
    if (orderError) {
      logger.warn("notifyCashbackCredited.order", { orderId, message: orderError.message })
      return
    }
    // Órdenes anónimas no tienen campana ni monedero.
    const orderRow = order as { user_id: string | null; cashback_tier: string | null } | null
    const userId = orderRow?.user_id
    if (!userId) return

    // Fuente de verdad del monto: el abono real del monedero.
    const { data: credit, error: creditError } = await supabase
      .from("wallet_transactions")
      .select("amount")
      .eq("order_id", orderId)
      .gt("amount", 0)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (creditError) {
      logger.warn("notifyCashbackCredited.credit", { orderId, message: creditError.message })
      return
    }
    const credits = Number((credit as { amount: number | string } | null)?.amount ?? 0)
    if (!Number.isFinite(credits) || credits <= 0) return

    await notifyUser({
      userId,
      type: "cashback_credited",
      title: `Cashback abonado: +$${credits.toFixed(2)}`,
      body: `Pedido #${orderId}${orderRow?.cashback_tier ? ` · Nivel ${orderRow.cashback_tier}` : ""} — ya está en tu monedero de Créditos Resurte`,
      actionUrl: "/recompensas?tab=wallet",
      orderId,
    })
  } catch (err) {
    logger.error("notifyCashbackCredited.error", err)
  }
}
