/**
 * Emisor de Web Push (W9). Server-only: importa `web-push`.
 *
 * Best-effort, como `notifyUser`: nunca lanza. Un push que no sale no debe
 * tumbar el cambio de estado del pedido ni el correo — el hito ya quedó en
 * la campana persistente, que es el canal garantizado.
 *
 * Degrada en silencio cuando falta configuración (sin par VAPID no hay firma
 * posible) o cuando la migración 00134 no está aplicada. Es a propósito: el
 * repo corre sin secrets reales en dev y preview.
 */

import * as webpush from "web-push"
import { createServiceClient } from "@/lib/supabase/service"
import { logger } from "@/lib/logger"
import {
  buildOrderStatusPushPayload,
  isDeadSubscriptionStatus,
  vapidPublicKey,
  type PushPayload,
} from "@/lib/push"

/** `mailto:` u URL de contacto que exige VAPID como sujeto. */
const VAPID_SUBJECT = process.env.VAPID_SUBJECT?.trim() || "mailto:hola@resurte.me"

function vapidPrivateKey(): string | null {
  const raw = process.env.VAPID_PRIVATE_KEY?.trim()
  return raw && raw.length > 0 ? raw : null
}

let vapidReady = false

/**
 * Registra las credenciales VAPID una sola vez. Devuelve false si falta el
 * par o si el servicio las rechaza (clave malformada) — en ese caso el
 * emisor se vuelve un no-op en lugar de fallar en cada pedido.
 */
function ensureVapid(): boolean {
  if (vapidReady) return true
  const publicKey = vapidPublicKey()
  const privateKey = vapidPrivateKey()
  if (!publicKey || !privateKey) return false
  try {
    webpush.setVapidDetails(VAPID_SUBJECT, publicKey, privateKey)
    vapidReady = true
    return true
  } catch (err) {
    logger.warn("push.vapid.invalid", { error: String(err) })
    return false
  }
}

function statusCodeOf(err: unknown): number | null {
  const code = (err as { statusCode?: unknown } | null)?.statusCode
  return typeof code === "number" ? code : null
}

interface SubscriptionRow {
  id: number
  endpoint: string
  p256dh: string
  auth: string
  failure_count: number | null
}

/**
 * Envía `payload` a todos los navegadores suscritos del usuario.
 *
 * Los endpoints muertos (404/410) se borran; los fallos intermitentes solo
 * suben `failure_count`, para poder diagnosticar sin perder la suscripción
 * por un 5xx pasajero del servicio de push.
 */
export async function sendPushToUser(
  userId: string,
  payload: PushPayload
): Promise<{ sent: number; removed: number }> {
  const result = { sent: 0, removed: 0 }
  if (!userId || !ensureVapid()) return result

  try {
    const supabase = await createServiceClient()
    const { data, error } = await supabase
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth, failure_count")
      .eq("user_id", userId)

    if (error) {
      // 42P01 = tabla ausente (migración 00134 sin aplicar). No es un fallo
      // del pedido: se calla y se sigue con los demás canales.
      if (error.code !== "42P01") {
        logger.warn("push.subscriptions.select", { userId, message: error.message })
      }
      return result
    }

    const rows = (data ?? []) as SubscriptionRow[]
    const body = JSON.stringify(payload)

    for (const row of rows) {
      try {
        await webpush.sendNotification(
          { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
          body,
          { TTL: 3600, urgency: "high", topic: payload.tag }
        )
        result.sent += 1
        await supabase
          .from("push_subscriptions")
          .update({ last_used_at: new Date().toISOString(), failure_count: 0 })
          .eq("id", row.id)
      } catch (err) {
        const status = statusCodeOf(err)
        if (status !== null && isDeadSubscriptionStatus(status)) {
          await supabase.from("push_subscriptions").delete().eq("id", row.id)
          result.removed += 1
          continue
        }
        logger.warn("push.send.failed", { userId, status, message: String(err) })
        // Best-effort: si el contador no sube, no se pierde nada crítico.
        await supabase
          .from("push_subscriptions")
          .update({ failure_count: (row.failure_count ?? 0) + 1 })
          .eq("id", row.id)
      }
    }
  } catch (err) {
    logger.error("push.sendToUser.error", err)
  }

  return result
}

/**
 * Aviso push de un hito logístico del pedido.
 *
 * Se llama junto a `notifyUser` en `sendOrderStatusEmail`, con la MISMA copia:
 * la campana y el push no pueden divergir porque comparten el texto. El
 * estado se filtra aquí (`PUSHABLE_ORDER_STATUSES`) aunque el llamador ya lo
 * haya filtrado, para que sea imposible enviar un aviso por un estado que no
 * corresponde.
 */
export async function sendOrderStatusPush(input: {
  userId: string
  orderId: number
  status: string
  title: string
  body: string
  url?: string | null
}): Promise<void> {
  try {
    const payload = buildOrderStatusPushPayload(input)
    if (!payload) return
    await sendPushToUser(input.userId, payload)
  } catch (err) {
    logger.error("push.orderStatus.error", err)
  }
}
