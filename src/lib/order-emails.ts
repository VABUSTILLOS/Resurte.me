/**
 * Emails transaccionales de pedido (confirmación + cambios de estado).
 *
 * Canal paralelo a los workflows de WhatsApp (workflows.ts): el cliente
 * recibe un correo con el enlace de rastreo público (capability URL con
 * restore_token) al crear el pedido y en cada hito logístico.
 *
 * Dedupe: cada envío se registra en email_logs (order_id + email_type); antes
 * de enviar se verifica que no exista ya un registro 'sent' para ese tipo,
 * así reintentos o dobles disparos no reenvían el correo.
 */

import { createServiceClient } from "@/lib/supabase/service"
import { sendEmail, orderConfirmationEmailHtml, orderStatusEmailHtml, escapeHtml } from "@/lib/email"
import { PAYMENT_METHOD_LABEL } from "@/lib/order-labels"
import { notifyUser } from "@/lib/notifications"
import { logger } from "@/lib/logger"
import type { OrderStatus } from "@/types"

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://resurte.me").replace(/\/$/, "")

/** Estados que notifican por email al cliente (además del WhatsApp). */
export const EMAILED_STATUSES: OrderStatus[] = ["confirmed", "out_for_delivery", "delivered"]

const STATUS_EMAIL_CONTENT: Record<string, { emoji: string; label: string; headline: string }> = {
  confirmed: {
    emoji: "✅",
    label: "Confirmado",
    headline: "La tienda confirmó tu pedido y comenzará a prepararlo.",
  },
  out_for_delivery: {
    emoji: "🛵",
    label: "En camino",
    headline: "¡Tu pedido va en camino! Ten a la mano tu método de pago si elegiste pagar al recibir.",
  },
  delivered: {
    emoji: "📦",
    label: "Entregado",
    headline: "Tu pedido fue entregado. ¡Gracias por surtirte con Resurte.me!",
  },
}

type ServiceClient = Awaited<ReturnType<typeof createServiceClient>>

interface OrderForEmail {
  id: number
  user_id: string | null
  customer_email: string | null
  total: number
  payment_method: string | null
  scheduled_for: string | null
  restore_token: string | null
  cities: { slug: string } | { slug: string }[] | null
}

/** URL pública de rastreo (sin sesión) para un pedido. */
export function buildTrackingUrl(citySlug: string, orderId: number, token: string): string {
  return `${SITE_URL}/${citySlug}/pedido/${orderId}?t=${token}`
}

async function fetchOrderForEmail(
  supabase: ServiceClient,
  orderId: number
): Promise<OrderForEmail | null> {
  const { data, error } = await supabase
    .from("orders")
    .select("id, user_id, customer_email, total, payment_method, scheduled_for, restore_token, cities(slug)")
    .eq("id", orderId)
    .maybeSingle()
  if (error) {
    logger.error("order-emails.fetch", { orderId, message: error.message })
    return null
  }
  return (data as OrderForEmail | null) ?? null
}

/** Destinatario: email capturado en checkout o el email de la cuenta. */
async function resolveRecipient(
  supabase: ServiceClient,
  order: OrderForEmail
): Promise<string | null> {
  if (order.customer_email) return order.customer_email
  if (!order.user_id) return null
  const { data, error } = await supabase.auth.admin.getUserById(order.user_id)
  if (error) {
    logger.warn("order-emails.recipient", { orderId: order.id, message: error.message })
    return null
  }
  return data?.user?.email ?? null
}

/** true si ya se envió ese tipo de correo para ese pedido. */
async function alreadySent(
  supabase: ServiceClient,
  orderId: number,
  emailType: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("email_logs")
    .select("id")
    .eq("order_id", orderId)
    .eq("email_type", emailType)
    .eq("status", "sent")
    .limit(1)
  if (error) {
    // Ante un error de dedupe, mejor no enviar que spamear.
    logger.error("order-emails.dedupe", { orderId, emailType, message: error.message })
    return true
  }
  return (data?.length ?? 0) > 0
}

async function logEmail(
  supabase: ServiceClient,
  order: OrderForEmail,
  emailType: string,
  to: string,
  result: { ok: boolean; id?: string; error?: string }
): Promise<void> {
  const { error } = await supabase.from("email_logs").insert({
    user_id: order.user_id,
    email_to: to,
    email_type: emailType,
    order_id: order.id,
    status: result.ok ? "sent" : "failed",
    error: result.error ?? null,
    metadata: result.id ? { resend_id: result.id } : {},
  })
  if (error) logger.warn("order-emails.log", { orderId: order.id, message: error.message })
}

function citySlugOf(order: OrderForEmail): string | null {
  const c = Array.isArray(order.cities) ? order.cities[0] : order.cities
  return c?.slug ?? null
}

/**
 * Correo de confirmación al registrar el pedido. Best-effort: nunca lanza.
 */
export async function sendOrderConfirmationEmail(orderId: number): Promise<void> {
  try {
    const supabase = await createServiceClient()
    const order = await fetchOrderForEmail(supabase, orderId)
    if (!order) return
    if (await alreadySent(supabase, orderId, "order_confirmation")) return

    // Notificación persistente para la campana (dedupe order_id+type).
    const slug0 = citySlugOf(order)
    if (order.user_id) {
      void notifyUser({
        userId: order.user_id,
        type: "order_confirmation",
        title: `Pedido #${orderId} recibido`,
        body: `Total $${Number(order.total).toFixed(2)} MXN · te avisaremos cada avance`,
        actionUrl:
          slug0 && order.restore_token
            ? buildTrackingUrl(slug0, orderId, order.restore_token).replace(/^https?:\/\/[^/]+/, "")
            : undefined,
        orderId,
      })
    }

    const to = await resolveRecipient(supabase, order)
    const slug = slug0
    if (!to || !slug || !order.restore_token) {
      logger.warn("order-emails.confirmation.skip", {
        orderId,
        hasEmail: Boolean(to),
        hasSlug: Boolean(slug),
        hasToken: Boolean(order.restore_token),
      })
      return
    }

    const { data: items } = await supabase
      .from("order_items")
      .select("quantity, products(name)")
      .eq("order_id", orderId)
    const itemsPreview =
      (items ?? [])
        .map((i) => {
          const p = Array.isArray(i.products) ? i.products[0] : i.products
          // Nombre escapado: se interpola directo en el HTML del correo.
          return `${i.quantity}× ${escapeHtml((p as { name?: string } | null)?.name ?? "Producto")}`
        })
        .join("<br>") || "Tu pedido"

    const result = await sendEmail({
      to,
      subject: `✅ Pedido #${orderId} recibido — Resurte.me`,
      html: orderConfirmationEmailHtml({
        orderId,
        itemsPreview,
        total: `$${Number(order.total).toFixed(2)}`,
        paymentMethod:
          (order.payment_method && PAYMENT_METHOD_LABEL[order.payment_method]) ||
          order.payment_method ||
          "—",
        scheduledFor: order.scheduled_for
          ? new Date(order.scheduled_for).toLocaleDateString("es-MX", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })
          : "A la brevedad",
        trackingUrl: buildTrackingUrl(slug, orderId, order.restore_token),
      }),
      tag: "order_confirmation",
    })
    await logEmail(supabase, order, "order_confirmation", to, result)
  } catch (err) {
    logger.error("order-emails.confirmation.error", err)
  }
}

/**
 * Correo de hito logístico (confirmed / out_for_delivery / delivered).
 * Best-effort: nunca lanza.
 */
export async function sendOrderStatusEmail(orderId: number, status: OrderStatus): Promise<void> {
  if (!EMAILED_STATUSES.includes(status)) return
  const content = STATUS_EMAIL_CONTENT[status]
  if (!content) return

  const emailType = `order_status_${status}`
  try {
    const supabase = await createServiceClient()
    const order = await fetchOrderForEmail(supabase, orderId)
    if (!order) return
    if (await alreadySent(supabase, orderId, emailType)) return

    // Notificación persistente (independiente del email: llega aunque el
    // usuario no haya dejado correo).
    const slug = citySlugOf(order)
    if (order.user_id) {
      void notifyUser({
        userId: order.user_id,
        type: emailType,
        title: `Pedido #${orderId}: ${content.label}`,
        body: content.headline,
        actionUrl:
          slug && order.restore_token
            ? buildTrackingUrl(slug, orderId, order.restore_token).replace(/^https?:\/\/[^/]+/, "")
            : undefined,
        orderId,
      })
    }

    const to = await resolveRecipient(supabase, order)
    if (!to || !slug || !order.restore_token) return

    const result = await sendEmail({
      to,
      subject: `${content.emoji} Tu pedido #${orderId} está ${content.label.toLowerCase()} — Resurte.me`,
      html: orderStatusEmailHtml({
        orderId,
        statusEmoji: content.emoji,
        statusLabel: content.label,
        headline: content.headline,
        trackingUrl: buildTrackingUrl(slug, orderId, order.restore_token),
      }),
      tag: emailType,
    })
    await logEmail(supabase, order, emailType, to, result)
  } catch (err) {
    logger.error("order-emails.status.error", err)
  }
}
