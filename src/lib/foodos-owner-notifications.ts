/**
 * Avisos al DUEÑO de FoodOS
 * =========================
 * Contraparte de `foodos-notifications.ts`, que avisa al comensal. Antes de
 * esto el dueño solo se enteraba de un pedido nuevo si tenía el panel abierto
 * con Realtime conectado: cerrar la pestaña era perder pedidos.
 *
 * TRES CANALES, Y POR QUÉ TRES
 *   Medido en producción, los tres canales externos están apagados: no hay
 *   `RESEND_API_KEY`, no hay credenciales de WhatsApp, y no hay claves VAPID.
 *   Si el aviso al dueño viajara solo por push/correo, la función existiría y
 *   no entregaría nada — una función que solo está por estar. Por eso el
 *   primer canal es `bell`: una fila persistente en `public.notifications`,
 *   que es la base de datos del propio dueño y no depende de ningún proveedor.
 *
 *     bell  → `notifyUser()`. Siempre disponible. Es la garantía de entrega.
 *     push  → `sendPushToUser()`. Entrega fuera del panel, cuando hay VAPID.
 *     email → `sendEmail()`. Entrega fuera del panel, cuando hay Resend.
 *
 *   Los tres se reclaman por separado en `foodos_order_notifications`
 *   (`audience = 'owner'`), así que un canal caído no arrastra a los otros y
 *   el que falla se reintenta en la siguiente llamada.
 *
 * NUNCA LANZA
 *   Igual que el canal del comensal: un pedido que se guarda bien no puede
 *   fallar porque un mensajero esté caído. Devuelve por canal qué pasó.
 */

import { sendEmail, escapeHtml } from "@/lib/email"
import { createServiceClient } from "@/lib/supabase/service"
import { logger } from "@/lib/logger"
import { notifyUser } from "@/lib/notifications"
import { sendPushToUser } from "@/lib/push-server"
import {
  claimFoodosNotification,
  settleFoodosNotification,
} from "@/lib/foodos-notification-claim"
import type { FoodosChannelResult } from "@/lib/foodos-notifications"

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://resurte.me").replace(/\/$/, "")

/**
 * Eventos que le cambian el trabajo al dueño.
 *
 * La lista es corta a propósito. Avisar de cada paso de cocina convertiría la
 * campana en ruido y el dueño dejaría de mirarla; estos dos son los que
 * exigen una acción suya.
 */
export const FOODOS_OWNER_EVENTS = ["status:pending", "payment:proof_pending"] as const

export type FoodosOwnerEvent = (typeof FOODOS_OWNER_EVENTS)[number]

export function isFoodosOwnerEvent(event: string): event is FoodosOwnerEvent {
  return (FOODOS_OWNER_EVENTS as readonly string[]).includes(event)
}

export interface FoodosOwnerOutcome {
  bell: FoodosChannelResult
  push: FoodosChannelResult
  email: FoodosChannelResult
}

interface OwnerEventCopy {
  emoji: string
  headline: string
  /** Texto que explica qué tiene que hacer el dueño. */
  detail: string
  /** Tipo de la campana; prefijo `foodos_` para poder filtrar en el panel. */
  type: string
}

const EVENT_COPY: Record<FoodosOwnerEvent, OwnerEventCopy> = {
  "status:pending": {
    emoji: "🧾",
    headline: "Pedido nuevo",
    detail: "Confírmalo para que entre a cocina.",
    type: "foodos_order_created",
  },
  "payment:proof_pending": {
    emoji: "📎",
    headline: "Comprobante por revisar",
    detail: "Subieron un comprobante de pago. Apruébalo o recházalo.",
    type: "foodos_payment_proof_pending",
  },
}

interface OrderForOwner {
  id: string
  restaurant_id: string
  total: number | null
  slug: string | null
  customer_name: string | null
}

function formatMoney(amount: number | null): string {
  const value = typeof amount === "number" && Number.isFinite(amount) ? amount : 0
  return `$${value.toFixed(2)} MXN`
}

/** Últimos 6 caracteres del id, en mayúsculas: el folio que el dueño reconoce. */
function shortOrderId(orderId: string): string {
  return orderId.replace(/-/g, "").slice(-6).toUpperCase()
}

/** Ruta del pedido dentro del panel del dueño. */
function panelOrderUrl(orderId: string): string {
  return `/panel/foodos/pedidos/${orderId}`
}

function buildBody(copy: OwnerEventCopy, order: OrderForOwner): string {
  const shortId = shortOrderId(order.id)
  const who = order.customer_name?.trim()
  const amount = order.total === null ? null : formatMoney(order.total)
  const parts = [`Pedido #${shortId}`]
  if (amount) parts.push(amount)
  if (who) parts.push(who)
  return `${parts.join(" · ")}. ${copy.detail}`
}

function buildEmailHtml(copy: OwnerEventCopy, order: OrderForOwner): string {
  const shortId = shortOrderId(order.id)
  const url = `${SITE_URL}${panelOrderUrl(order.id)}`
  const rows: string[] = []
  if (order.total !== null) rows.push(`<p style="margin:4px 0"><strong>Total:</strong> ${escapeHtml(formatMoney(order.total))}</p>`)
  if (order.customer_name?.trim()) rows.push(`<p style="margin:4px 0"><strong>Cliente:</strong> ${escapeHtml(order.customer_name.trim())}</p>`)
  return `
    <div style="font-family:system-ui,-apple-system,sans-serif;max-width:520px;margin:0 auto;padding:24px">
      <h2 style="margin:0 0 8px">${copy.emoji} ${escapeHtml(copy.headline)} — Pedido #${escapeHtml(shortId)}</h2>
      <p style="margin:0 0 12px;color:#444">${escapeHtml(copy.detail)}</p>
      ${rows.join("")}
      <p style="margin:20px 0 0">
        <a href="${escapeHtml(url)}" style="background:#0E7A0E;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:600">Abrir en el panel</a>
      </p>
      <p style="margin:16px 0 0;color:#777;font-size:13px">Recibes este correo porque eres el dueño del restaurante en Resurte.me.</p>
    </div>
  `.trim()
}

/**
 * Avisa al dueño del restaurante de un evento de su pedido.
 *
 * Devuelve por canal qué pasó (`sent` / `skipped` / `failed`). `skipped`
 * significa "ya se avisó por ese canal" o "el canal no aplica"; `failed`
 * significa que se intentó y no se pudo — que es lo que hay que mirar.
 */
export async function notifyFoodosOwner(
  orderId: string,
  event: FoodosOwnerEvent
): Promise<FoodosOwnerOutcome> {
  const outcome: FoodosOwnerOutcome = { bell: "skipped", push: "skipped", email: "skipped" }

  const copy = EVENT_COPY[event]
  if (!copy) {
    logger.warn("foodos_owner_notifications.evento_desconocido", { orderId, event })
    return outcome
  }

  let order: OrderForOwner
  let ownerUserId: string
  let restaurantName = "Tu restaurante"

  try {
    const supabase = await createServiceClient()

    const { data: orderData, error: orderError } = await supabase
      .from("foodos_orders")
      .select("id, restaurant_id, total, slug, customer_name")
      .eq("id", orderId)
      .maybeSingle()

    if (orderError || !orderData) {
      logger.warn("foodos_owner_notifications.pedido_no_encontrado", {
        orderId,
        event,
        message: orderError?.message ?? "sin fila",
      })
      return outcome
    }
    order = orderData as OrderForOwner

    const { data: restaurant, error: restaurantError } = await supabase
      .from("foodos_restaurants")
      .select("name, user_id")
      .eq("id", order.restaurant_id)
      .maybeSingle()

    if (restaurantError || !restaurant) {
      logger.warn("foodos_owner_notifications.restaurante_no_encontrado", {
        orderId,
        event,
        message: restaurantError?.message ?? "sin fila",
      })
      return outcome
    }
    const owner = restaurant as { name: string | null; user_id: string | null }
    if (!owner.user_id) {
      logger.warn("foodos_owner_notifications.sin_dueno", { orderId, event })
      return outcome
    }
    ownerUserId = owner.user_id
    restaurantName = owner.name ?? restaurantName
  } catch (err) {
    logger.error("foodos_owner_notifications.carga", err)
    return outcome
  }

  const shortId = shortOrderId(order.id)
  const url = panelOrderUrl(order.id)
  const body = buildBody(copy, order)

  // ── Campana ─────────────────────────────────────────────────
  // Va primero: es el único canal que no depende de un proveedor, así que si
  // todo lo demás está apagado el dueño igual se entera al abrir el panel.
  {
    const claim = await claimFoodosNotification({
      orderId: order.id,
      restaurantId: order.restaurant_id,
      audience: "owner",
      event,
      channel: "bell",
      recipient: ownerUserId,
    })
    if (!claim.proceed) {
      outcome.bell = "skipped"
    } else {
      try {
        await notifyUser({
          userId: ownerUserId,
          type: copy.type,
          title: `${copy.emoji} ${copy.headline} · #${shortId}`,
          body,
          actionUrl: url,
        })
        await settleFoodosNotification(claim.id, "sent")
        outcome.bell = "sent"
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error"
        await settleFoodosNotification(claim.id, "failed", message)
        logger.error("foodos_owner_notifications.bell_failed", { orderId, event, message })
        outcome.bell = "failed"
      }
    }
  }

  // ── Push ────────────────────────────────────────────────────
  {
    const claim = await claimFoodosNotification({
      orderId: order.id,
      restaurantId: order.restaurant_id,
      audience: "owner",
      event,
      channel: "push",
      recipient: ownerUserId,
    })
    if (!claim.proceed) {
      outcome.push = "skipped"
    } else {
      try {
        // `sendPushToUser` nunca lanza: sin VAPID devuelve { sent: 0, removed: 0 }.
        const result = await sendPushToUser(ownerUserId, {
          title: `${copy.emoji} ${copy.headline} · #${shortId}`,
          body,
          url,
          tag: `foodos-order-${order.id}`,
        })
        if (result.sent > 0) {
          await settleFoodosNotification(claim.id, "sent")
          outcome.push = "sent"
        } else {
          // Sin suscripción o sin VAPID: no es un envío. Se marca `failed`
          // para que un intento posterior sí reintente cuando el canal exista,
          // en lugar de dejar el aviso bloqueado para siempre como si se
          // hubiera entregado.
          await settleFoodosNotification(claim.id, "failed", "sin_dispositivo_o_sin_vapid")
          outcome.push = "failed"
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error"
        await settleFoodosNotification(claim.id, "failed", message)
        logger.error("foodos_owner_notifications.push_failed", { orderId, event, message })
        outcome.push = "failed"
      }
    }
  }

  // ── Correo ──────────────────────────────────────────────────
  {
    const claim = await claimFoodosNotification({
      orderId: order.id,
      restaurantId: order.restaurant_id,
      audience: "owner",
      event,
      channel: "email",
      recipient: ownerUserId,
    })
    if (!claim.proceed) {
      outcome.email = "skipped"
    } else {
      try {
        const email = await resolveOwnerEmail(ownerUserId)
        if (!email) {
          await settleFoodosNotification(claim.id, "failed", "sin_correo_de_dueno")
          outcome.email = "failed"
        } else {
          const result = await sendEmail({
            to: email,
            subject: `${copy.emoji} ${copy.headline} — Pedido #${shortId} · ${restaurantName}`,
            html: buildEmailHtml(copy, order),
            tag: "foodos_owner_order",
          })
          if (!result.ok) throw new Error(result.error ?? "send failed")
          await settleFoodosNotification(claim.id, "sent")
          outcome.email = "sent"
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error"
        await settleFoodosNotification(claim.id, "failed", message)
        logger.error("foodos_owner_notifications.email_failed", { orderId, event, message })
        outcome.email = "failed"
      }
    }
  }

  // Un aviso que no llegó por ningún lado se registra explícitamente: es la
  // diferencia entre "el dueño no quiso avisos" y "el dueño no se enteró".
  if (outcome.bell !== "sent" && outcome.push !== "sent" && outcome.email !== "sent") {
    logger.warn("foodos_owner_notifications.sin_entrega", { orderId, event, outcome })
  }

  return outcome
}

/**
 * Correo del dueño. Vive en `auth.users`, no en `profiles`: esa tabla no tiene
 * columna de correo (lo mismo que hace `foodos_review_queue()`).
 */
async function resolveOwnerEmail(userId: string): Promise<string | null> {
  try {
    const supabase = await createServiceClient()
    const { data, error } = await supabase.auth.admin.getUserById(userId)
    if (error) {
      logger.warn("foodos_owner_notifications.correo", { userId, message: error.message })
      return null
    }
    const email = data?.user?.email
    return typeof email === "string" && email.includes("@") ? email : null
  } catch (err) {
    logger.warn("foodos_owner_notifications.correo_error", { userId, err })
    return null
  }
}
