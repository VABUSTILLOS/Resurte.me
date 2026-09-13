/**
 * Avisos al comensal del micrositio FoodOS (P6-3)
 * =================================================
 * Canal paralelo a `workflows.ts`, que es marketplace-only: sus
 * funciones tipan el pedido con `id: number` y registran en
 * `whatsapp_messages` (FK a `orders`), así que no sirven para los
 * pedidos UUID de FoodOS.
 *
 * Qué dispara qué:
 *   * `updateOrderStatus`   → `status:<nuevo estado>`
 *   * `markOrderPaid`       → `payment:paid`
 *   * `approvePaymentProof` → `payment:paid`
 *   * `rejectPaymentProof`  → `payment:proof_rejected`
 *
 * Idempotencia: cada envío toma un "claim" en
 * `foodos_order_notifications` antes de llamar al mensajero. El UPDATE
 * de estado es idempotente en BD (deja el mismo valor), pero el envío
 * no lo sería: sin el claim, cada clic repetido en el panel mandaría
 * otro WhatsApp. Un claim fallido se marca `failed` y deja de bloquear,
 * así un intento posterior sí reintenta.
 *
 * Fail-open: nada de aquí lanza. Un pedido que se guarda correctamente
 * nunca debe fallar porque el mensajero esté caído; el resultado se
 * devuelve para poder asertarlo en pruebas y loguearlo.
 */

import { sendTextMessage } from "@/lib/whatsapp"
import { sendEmail, escapeHtml } from "@/lib/email"
import { createServiceClient } from "@/lib/supabase/service"
import { logger } from "@/lib/logger"
import type { FoodosOrderStatus } from "@/types/foodos"

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://resurte.me").replace(/\/$/, "")

/** Eventos avisables al comensal. */
export type FoodosNotificationEvent =
  | `status:${FoodosOrderStatus}`
  | "payment:paid"
  | "payment:proof_pending"
  | "payment:proof_rejected"
  | "payment:reminder_1h"
  | "payment:reminder_24h"
  | "payment:expired"

export type FoodosChannelResult = "sent" | "skipped" | "failed"

export interface FoodosNotificationOutcome {
  whatsapp: FoodosChannelResult
  email: FoodosChannelResult
}

export interface FoodosNotifyOptions {
  /** Motivo que se muestra al cliente (notas del rechazo de comprobante). */
  reason?: string | null
}

/**
 * Eventos que además mandan correo. No se manda email en cada paso de
 * cocina (`preparing`) ni en cada hito interno para no saturar la
 * bandeja del comensal: sólo en los que cambian algo para él.
 */
const EMAIL_EVENTS: FoodosNotificationEvent[] = [
  "status:confirmed",
  "status:out_for_delivery",
  "status:delivered",
  "status:cancelled",
  "payment:paid",
  "payment:proof_rejected",
  // Recordatorio de 24 h = último aviso antes de cancelar: también por correo.
  // El de 1 h se queda sólo en WhatsApp para no duplicar ruido temprano.
  "payment:reminder_24h",
  "payment:expired",
]

interface NotificationCopy {
  emoji: string
  headline: string
  detail: string
}

const EVENT_COPY: Partial<Record<FoodosNotificationEvent, NotificationCopy>> = {
  "status:pending": {
    emoji: "🧾",
    headline: "Recibimos tu pedido",
    detail: "Estamos esperando que el restaurante lo confirme.",
  },
  "status:confirmed": {
    emoji: "✅",
    headline: "Pedido confirmado",
    detail: "El restaurante confirmó tu pedido y comenzará a prepararlo.",
  },
  "status:preparing": {
    emoji: "👨‍🍳",
    headline: "Estamos preparando tu pedido",
    detail: "Tu pedido ya está en cocina.",
  },
  "status:out_for_delivery": {
    emoji: "🛵",
    headline: "Tu pedido va en camino",
    detail: "Ten a la mano tu método de pago si elegiste pagar al recibir.",
  },
  "status:delivered": {
    emoji: "📦",
    headline: "Pedido entregado",
    detail: "¡Gracias por tu compra! Esperamos verte pronto.",
  },
  "status:cancelled": {
    emoji: "❌",
    headline: "Pedido cancelado",
    detail: "El restaurante canceló tu pedido. Si ya habías pagado, el reembolso se procesa por el mismo medio.",
  },
  "payment:paid": {
    emoji: "💳",
    headline: "Pago confirmado",
    detail: "Recibimos tu pago. Tu pedido sigue su curso normal.",
  },
  "payment:proof_pending": {
    emoji: "📎",
    headline: "Recibimos tu comprobante",
    detail: "Lo estamos revisando; te avisamos en cuanto quede validado.",
  },
  "payment:proof_rejected": {
    emoji: "⚠️",
    headline: "No pudimos validar tu comprobante",
    detail: "Sube de nuevo tu comprobante desde el seguimiento del pedido o contacta al restaurante.",
  },
  "payment:reminder_1h": {
    emoji: "⏳",
    headline: "Tu pedido sigue sin pago",
    detail: "Apartamos tu pedido pero el pago aún no se registra. Completa el pago o sube tu comprobante desde el enlace de abajo.",
  },
  "payment:reminder_24h": {
    emoji: "🔔",
    headline: "Último aviso: tu pedido sigue sin pagarse",
    detail: "Si no registramos tu pago en las próximas 48 horas, el pedido se cancelará automáticamente. Completa el pago o sube tu comprobante desde el enlace de abajo.",
  },
  "payment:expired": {
    emoji: "🚫",
    headline: "Cancelamos tu pedido por falta de pago",
    detail: "No registramos el pago dentro del plazo, así que el pedido se canceló y no hubo ningún cargo. Puedes volver al menú y pedir de nuevo cuando quieras.",
  },
}

const FALLBACK_COPY: NotificationCopy = {
  emoji: "🔔",
  headline: "Actualización de tu pedido",
  detail: "Hubo un cambio en tu pedido.",
}

interface OrderForNotify {
  id: string
  restaurant_id: string
  customer_id: string | null
  customer_phone: string | null
  total: number
  slug: string | null
}

interface NotificationContext {
  restaurant: string
  shortId: string
  total: string
  trackingUrl: string | null
  reason: string | null
}

/** Importe determinista en formato mexicano (sin depender del ICU del runtime). */
function formatMoney(amount: number): string {
  return `$${(Number.isFinite(amount) ? amount : 0).toFixed(2)} MXN`
}

/** Identificador corto y legible del pedido (los UUID no se dictan por teléfono). */
function shortOrderId(orderId: string): string {
  return orderId.slice(-6).toUpperCase()
}

function buildCopy(event: FoodosNotificationEvent, ctx: NotificationContext): NotificationCopy {
  const copy = EVENT_COPY[event] ?? FALLBACK_COPY
  if (event !== "payment:proof_rejected" || !ctx.reason) return copy
  return { ...copy, detail: `Motivo: ${ctx.reason}` }
}

function buildWhatsAppText(copy: NotificationCopy, ctx: NotificationContext): string {
  const lines = [
    `${copy.emoji} *${ctx.restaurant}*`,
    "",
    copy.headline,
    `Pedido *#${ctx.shortId}* · ${ctx.total}`,
    copy.detail,
  ]
  if (ctx.trackingUrl) lines.push("", ctx.trackingUrl)
  return lines.join("\n")
}

function buildEmailHtml(copy: NotificationCopy, ctx: NotificationContext): string {
  const button = ctx.trackingUrl
    ? `<p style="margin:24px 0"><a href="${ctx.trackingUrl}" style="background:#111;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none">Ver mi pedido</a></p>`
    : ""
  return `
    <div style="font-family:system-ui,-apple-system,sans-serif;max-width:520px;margin:0 auto;color:#111">
      <p style="font-size:28px;margin:0 0 8px">${copy.emoji}</p>
      <h1 style="font-size:20px;margin:0 0 12px">${escapeHtml(copy.headline)}</h1>
      <p style="margin:0 0 4px;color:#444">${escapeHtml(ctx.restaurant)}</p>
      <p style="margin:0 0 4px;color:#444">Pedido #${escapeHtml(ctx.shortId)} · ${escapeHtml(ctx.total)}</p>
      <p style="margin:12px 0 0;color:#444">${escapeHtml(copy.detail)}</p>
      ${button}
    </div>
  `.trim()
}

type Claim = { proceed: true; id: number | null } | { proceed: false }

/**
 * Toma el derecho de envío de un (pedido, evento, canal).
 *
 * `proceed: false` sólo significa "ya se avisó" (violación 23505 del
 * índice único parcial). Cualquier otro fallo de BD deja pasar el envío
 * sin dedupe: perder un aviso es peor que repetirlo.
 */
async function claimNotification(
  orderId: string,
  restaurantId: string,
  event: FoodosNotificationEvent,
  channel: "whatsapp" | "email",
  recipient: string
): Promise<Claim> {
  try {
    const supabase = await createServiceClient()
    const { data, error } = await supabase
      .from("foodos_order_notifications")
      .insert({
        order_id: orderId,
        restaurant_id: restaurantId,
        event,
        channel,
        recipient,
        status: "pending",
      })
      .select("id")
      .maybeSingle()

    if (error) {
      if (error.code === "23505") return { proceed: false }
      logger.warn("foodos_notifications.claim", { event, channel, message: error.message })
      return { proceed: true, id: null }
    }
    const id = (data as { id: number } | null)?.id
    return { proceed: true, id: typeof id === "number" ? id : null }
  } catch (err) {
    logger.warn("foodos_notifications.claim_error", { event, channel, err })
    return { proceed: true, id: null }
  }
}

/** Cierra el claim con el resultado real del envío. */
async function settleNotification(
  id: number | null,
  status: "sent" | "failed",
  error?: string
): Promise<void> {
  if (id === null) return
  try {
    const supabase = await createServiceClient()
    await supabase
      .from("foodos_order_notifications")
      .update({ status, error: error ?? null, updated_at: new Date().toISOString() })
      .eq("id", id)
  } catch (err) {
    logger.error("foodos_notifications.settle", err)
  }
}

/**
 * Avisa al comensal de un cambio en su pedido FoodOS por WhatsApp y, en
 * los hitos relevantes, por correo.
 *
 * Nunca lanza: devuelve por canal qué pasó (`sent` / `skipped` / `failed`).
 */
export async function notifyFoodosCustomer(
  orderId: string,
  event: FoodosNotificationEvent,
  options: FoodosNotifyOptions = {}
): Promise<FoodosNotificationOutcome> {
  const outcome: FoodosNotificationOutcome = { whatsapp: "skipped", email: "skipped" }

  let order: OrderForNotify
  let restaurantName = "Tu restaurante"
  let restaurantSlug: string | null = null
  let customerEmail: string | null = null

  try {
    const supabase = await createServiceClient()

    const { data, error } = await supabase
      .from("foodos_orders")
      .select("id, restaurant_id, customer_id, customer_phone, total, slug")
      .eq("id", orderId)
      .maybeSingle()

    if (error || !data) {
      logger.warn("foodos_notifications.order_not_found", { orderId, event })
      return outcome
    }
    order = data as OrderForNotify

    const { data: restaurant } = await supabase
      .from("foodos_restaurants")
      .select("name, slug")
      .eq("id", order.restaurant_id)
      .maybeSingle()
    const rest = restaurant as { name: string | null; slug: string | null } | null
    if (rest?.name) restaurantName = rest.name
    restaurantSlug = rest?.slug ?? null

    if (order.customer_id) {
      const { data: customer } = await supabase
        .from("foodos_customers")
        .select("email")
        .eq("id", order.customer_id)
        .maybeSingle()
      customerEmail = (customer as { email: string | null } | null)?.email ?? null
    }
  } catch (err) {
    logger.error("foodos_notifications.load_failed", { orderId, event, err })
    return outcome
  }

  const slug = order.slug ?? restaurantSlug
  const ctx: NotificationContext = {
    restaurant: restaurantName,
    shortId: shortOrderId(order.id),
    total: formatMoney(order.total),
    trackingUrl: slug ? `${SITE_URL}/r/${slug}/pedido/${order.id}` : null,
    reason: options.reason?.trim() ? options.reason.trim() : null,
  }
  const copy = buildCopy(event, ctx)

  // ── WhatsApp ────────────────────────────────────────────────
  const phone = order.customer_phone?.trim()
  if (!phone) {
    outcome.whatsapp = "skipped"
  } else {
    const claim = await claimNotification(order.id, order.restaurant_id, event, "whatsapp", phone)
    if (!claim.proceed) {
      outcome.whatsapp = "skipped"
    } else {
      try {
        await sendTextMessage({ to: phone, text: buildWhatsAppText(copy, ctx) })
        await settleNotification(claim.id, "sent")
        outcome.whatsapp = "sent"
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error"
        await settleNotification(claim.id, "failed", message)
        logger.error("foodos_notifications.whatsapp_failed", { orderId, event, message })
        outcome.whatsapp = "failed"
      }
    }
  }

  // ── Email ───────────────────────────────────────────────────
  if (!EMAIL_EVENTS.includes(event) || !customerEmail) {
    outcome.email = "skipped"
  } else {
    const claim = await claimNotification(
      order.id,
      order.restaurant_id,
      event,
      "email",
      customerEmail
    )
    if (!claim.proceed) {
      outcome.email = "skipped"
    } else {
      try {
        const result = await sendEmail({
          to: customerEmail,
          subject: `${copy.emoji} ${copy.headline} — Pedido #${ctx.shortId}`,
          html: buildEmailHtml(copy, ctx),
          tag: "foodos_order_update",
        })
        if (!result.ok) throw new Error(result.error ?? "send failed")
        await settleNotification(claim.id, "sent")
        outcome.email = "sent"
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error"
        await settleNotification(claim.id, "failed", message)
        logger.error("foodos_notifications.email_failed", { orderId, event, message })
        outcome.email = "failed"
      }
    }
  }

  return outcome
}
