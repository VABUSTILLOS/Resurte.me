/**
 * Recordatorios y recuperación de pagos FoodOS (P6-4)
 * ===================================================
 * `checkAndSendPaymentReminders` (`workflows.ts`) sólo barre la tabla
 * `orders` del marketplace. Los pedidos del micrositio (`foodos_orders`,
 * UUID) quedaban sin recordatorio y sin caducidad: un pedido con tarjeta
 * abandonado a medias se quedaba en `pending` para siempre, ocupando
 * lugar en el panel y sin que el comensal supiera que le faltaba pagar.
 *
 * Reglas
 * ------
 *   * Recordatorio a las 1 h y a las 24 h (un bucket por corrida: el más
 *     avanzado que aplique y no se haya enviado todavía).
 *   * Cancelación a las 72 h **sólo** si el pago sigue en `pending`.
 *     Un pedido en `processing` tiene un voucher OXXO/SPEI/CoDi en vuelo
 *     y su ventana real es `FOODOS_VOUCHER_TTL_HOURS` (96 h), que cierra
 *     `reconcile-payments`; cancelarlo antes mataría un pago válido.
 *   * Nunca se cancela un pedido que el restaurante ya aceptó
 *     (`status <> 'pending'`): ahí ya hay una persona decidiendo.
 *   * Nunca se cancela si hay un comprobante esperando revisión.
 *
 * El cron es **diario** (Hobby sólo permite crons diarios), así que los
 * umbrales son "al menos N horas" y no instantes exactos. La dedupe por
 * (pedido, evento, canal) en `foodos_order_notifications` —dentro de
 * `notifyFoodosCustomer`— es lo que hace que correr esto dos veces el
 * mismo día no mande dos WhatsApps.
 */

import { createServiceClient } from "@/lib/supabase/service"
import { notifyFoodosCustomer } from "@/lib/foodos-notifications"
import type { FoodosNotificationEvent } from "@/lib/foodos-notifications"
import { logger } from "@/lib/logger"

const BATCH_LIMIT = 500

/** Umbrales de recordatorio, de menor a mayor. */
const REMINDER_BUCKETS: Array<{ event: FoodosNotificationEvent; afterHours: number }> = [
  { event: "payment:reminder_1h", afterHours: 1 },
  { event: "payment:reminder_24h", afterHours: 24 },
]

const REMINDER_EVENTS = REMINDER_BUCKETS.map((b) => b.event)

/** A las 72 h sin pago ni comprobante, el pedido se cancela. */
export const FOODOS_UNPAID_CANCEL_HOURS = 72

export interface FoodosReminderResult {
  checked: number
  reminded: number
  cancelled: number
  errors: string[]
}

function hoursSince(createdAt: string, now: number): number {
  const created = new Date(createdAt).getTime()
  if (!Number.isFinite(created)) return 0
  return (now - created) / (1000 * 60 * 60)
}

/**
 * Barrido de pagos pendientes del micrositio. Llamado por el cron diario
 * junto al de marketplace. No lanza: devuelve el conteo y los errores.
 */
export async function checkAndSendFoodosPaymentReminders(): Promise<FoodosReminderResult> {
  const errors: string[] = []
  let reminded = 0
  let cancelled = 0

  try {
    const supabase = await createServiceClient()
    const now = Date.now()
    const oneHourAgo = new Date(now - 60 * 60 * 1000).toISOString()

    // Sólo `pending`/`processing`: son los dos únicos estados no terminales
    // que existen para un pago (el resto —paid/failed/expired/refunded/
    // amount_mismatch— ya está resuelto).
    const { data: orders, error } = await supabase
      .from("foodos_orders")
      .select("id, created_at, payment_status, status")
      .in("payment_status", ["pending", "processing"])
      .neq("status", "cancelled")
      .lt("created_at", oneHourAgo)
      .order("created_at", { ascending: true })
      .limit(BATCH_LIMIT)

    if (error) {
      logger.error("foodos_reminders: fetch error:", error)
      return { checked: 0, reminded: 0, cancelled: 0, errors: [error.message] }
    }

    const pendingOrders = orders ?? []
    if (pendingOrders.length === 0) {
      return { checked: 0, reminded: 0, cancelled: 0, errors }
    }

    const orderIds = pendingOrders.map((o) => o.id as string)

    // Qué recordatorios ya salieron (una sola consulta para todo el lote).
    const alreadyReminded = new Set<string>()
    const { data: sent, error: sentError } = await supabase
      .from("foodos_order_notifications")
      .select("order_id, event")
      .in("order_id", orderIds)
      .in("event", REMINDER_EVENTS)
      .eq("status", "sent")

    if (sentError) {
      // No es fatal: si no podemos leer la bitácora, `notifyFoodosCustomer`
      // vuelve a deduplicar por su cuenta.
      logger.warn("foodos_reminders: bitácora no disponible", { message: sentError.message })
    } else {
      for (const row of sent ?? []) {
        alreadyReminded.add(`${row.order_id}:${row.event}`)
      }
    }

    // Pedidos con comprobante esperando revisión: el comensal ya hizo su
    // parte, así que ni se le recuerda ni se cancela nada.
    const withPendingProof = new Set<string>()
    const { data: proofs, error: proofsError } = await supabase
      .from("foodos_order_payments")
      .select("order_id")
      .in("order_id", orderIds)
      .eq("status", "pending")

    if (proofsError) {
      logger.warn("foodos_reminders: comprobantes no disponibles", {
        message: proofsError.message,
      })
    } else {
      for (const row of proofs ?? []) {
        withPendingProof.add(row.order_id as string)
      }
    }

    for (const order of pendingOrders) {
      const orderId = order.id as string
      const paymentStatus = order.payment_status as string
      const orderStatus = order.status as string
      const ageHours = hoursSince(order.created_at as string, now)

      if (withPendingProof.has(orderId)) continue

      const expired =
        paymentStatus === "pending" &&
        orderStatus === "pending" &&
        ageHours >= FOODOS_UNPAID_CANCEL_HOURS

      if (expired) {
        try {
          // `select("id")` para saber si el UPDATE realmente tocó la fila:
          // si el panel la cambió entre la lectura y la escritura, no hay
          // nada que avisar (y no se manda un "cancelamos tu pedido" falso).
          const { data: updated, error: updateError } = await supabase
            .from("foodos_orders")
            .update({ status: "cancelled", payment_status: "expired" })
            .eq("id", orderId)
            .eq("payment_status", "pending")
            .eq("status", "pending")
            .select("id")

          if (updateError) {
            errors.push(`Failed to expire order ${orderId}: ${updateError.message}`)
            continue
          }
          if (!updated?.length) continue

          await notifyFoodosCustomer(orderId, "payment:expired")
          cancelled++
        } catch (err) {
          errors.push(
            `Failed to expire order ${orderId}: ${err instanceof Error ? err.message : "Unknown"}`
          )
        }
        continue
      }

      // Un bucket por corrida: el más avanzado que ya aplique. Con cron
      // diario, un pedido de 30 h recibe el de 24 h (el de 1 h ya salió o
      // se saltó) en vez de dos mensajes de golpe.
      const bucket = [...REMINDER_BUCKETS].reverse().find((b) => ageHours >= b.afterHours)
      if (!bucket) continue
      if (alreadyReminded.has(`${orderId}:${bucket.event}`)) continue

      try {
        await notifyFoodosCustomer(orderId, bucket.event)
        reminded++
      } catch (err) {
        // `notifyFoodosCustomer` no lanza, pero un fallo del cliente de BD
        // al cargar el pedido sí podría; se aísla por pedido.
        errors.push(
          `Failed to remind order ${orderId}: ${err instanceof Error ? err.message : "Unknown"}`
        )
      }
    }

    return { checked: pendingOrders.length, reminded, cancelled, errors }
  } catch (err) {
    logger.error("foodos_reminders: unexpected error:", err)
    return {
      checked: 0,
      reminded,
      cancelled,
      errors: [...errors, err instanceof Error ? err.message : "Unknown"],
    }
  }
}
