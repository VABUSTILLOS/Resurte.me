/**
 * WhatsApp Workflow Engine — Resurte.me
 * =======================================
 * Automated WhatsApp messaging triggered by order events.
 *
 * Workflows:
 *  1. new_order_staff    — Notify staff when an order is placed
 *  2. new_order_customer — Confirm order to customer
 *  3. status_update      — Notify customer on status change
 *  4. payment_reminder   — Remind customer to pay pending orders
 *  5. payment_confirmed  — Confirm payment to customer
 *  6. fulfillment_update — Notify customer on fulfillment progress
 *
 * Architecture:
 *  - Direct triggers: called from API routes when order events happen
 *  - CRON triggers: Vercel Cron calls checkAndSendPaymentReminders()
 *  - Las notificaciones PROACTIVAS al cliente (confirmación de pedido,
 *    actualización de estado y recordatorio de pago) se envían con
 *    sendTemplate() y las plantillas aprobadas por Meta de abajo: el
 *    texto libre solo se entrega dentro de la ventana de servicio de
 *    24 h que abre el cliente, y estos avisos no pueden depender de
 *    ella. El aviso a staff y las confirmaciones de pago/entrega
 *    siguen en texto libre.
 */

import { sendTemplate, sendTextMessage } from "@/lib/whatsapp"
import { createServiceClient } from "@/lib/supabase/service"
import {
  buildTrackingUrl,
  sendOrderConfirmationEmail,
  sendOrderStatusEmail,
} from "@/lib/order-emails"
import { getOrCreateOrderPaymentLink } from "@/lib/stripe-payment-link"
import type { OrderStatus, PaymentStatus } from "@/types"
import { logger } from "@/lib/logger"
import { applyOrderCancellationEffects } from "@/lib/order-cancellation"
import {
  applyPaymentRecoveryFilter,
  isPaymentRecoverable,
  isWhatsAppUnpaidCancellationDue,
  PAYMENT_RECOVERY_CANCEL_HOURS,
} from "@/lib/payment-recovery"
import {
  WHATSAPP_UNPAID_CANCEL_ENABLED,
  WHATSAPP_UNPAID_CANCEL_GRACE_HOURS,
} from "@/lib/whatsapp-order-config"
import type { WorkflowType } from "@/lib/workflow-types"
import { WHATSAPP_NUMBER } from "@/lib/business"

// ============================================================
// Types
// ============================================================

// La definición canónica vive en `@/lib/workflow-types` (client-safe).
export type { WorkflowType }

export interface WorkflowLog {
  id?: number
  workflow_type: WorkflowType
  order_id: number
  recipient: string
  message_id?: string | null
  status: "sent" | "failed"
  error?: string | null
  created_at?: string
}

interface OrderWithDetails {
  id: number
  user_id: string
  status: OrderStatus
  payment_status: PaymentStatus
  payment_method: string
  total: number
  subtotal: number
  delivery_fee: number
  scheduled_for: string | null
  source: "web" | "whatsapp" | "recurring"
  created_at: string
  // Joined fields
  customer_name?: string
  customer_phone?: string
  staff_phones?: string[]
  items?: { name: string; quantity: number }[]
  /** Token de la liga pública del pedido (recordatorio con link). */
  restore_token?: string | null
  /** Slug de la ciudad del pedido, para armar la liga pública. */
  city_slug?: string | null
}

/** Raw shape of order joined with profile from Supabase */
interface RawOrderRow {
  id: number
  user_id: string
  status: string
  payment_status: string
  payment_method: string
  total: number
  subtotal: number
  delivery_fee: number
  scheduled_for: string | null
  source: string
  created_at: string
  customer_phone: string | null
  restore_token?: string | null
  city?: { slug: string } | null
  profile: { full_name: string; phone: string | null }
}

/** Raw shape of order_item joined with product from Supabase */
interface RawOrderItemRow {
  quantity: number
  product: { name: string }
}

// ============================================================
// Workflow Logging
// ============================================================

async function logWorkflow(
  workflowType: WorkflowType,
  orderId: number,
  recipient: string,
  messageId: string | null,
  status: "sent" | "failed",
  error?: string
): Promise<void> {
  try {
    const supabase = await createServiceClient()
    // Try to insert into whatsapp_messages table (reuse existing schema)
    await supabase.from("whatsapp_messages").insert({
      from_number: recipient,
      message_type: `workflow:${workflowType}`,
      content: JSON.stringify({ message_id: messageId, status, error: error || null }),
      order_id: orderId,
      direction: "outbound",
    })
  } catch (err) {
    logger.error(`[Workflow] Failed to log ${workflowType}:`, err)
  }
}

// ============================================================
// Helper: Fetch order with all details needed for workflows
// ============================================================

async function getOrderDetails(orderId: number): Promise<OrderWithDetails | null> {
  const supabase = await createServiceClient()

  const { data: order, error } = await supabase
    .from("orders")
    .select(`
      *,
      profile:profiles!orders_user_id_fkey(full_name, phone),
      city:cities(slug)
    `)
    .eq("id", orderId)
    .single()

  if (error || !order) {
    logger.error(`[Workflow] Order ${orderId} not found:`, error)
    return null
  }

  const rawOrder = order as unknown as RawOrderRow

  // Fetch order items
  const { data: items } = await supabase
    .from("order_items")
    .select(`
      quantity,
      product:products(name)
    `)
    .eq("order_id", orderId)

  const rawItems = (items as unknown as RawOrderItemRow[]) || []

  // Use default WhatsApp number for staff contacts
  const staffPhones = [WHATSAPP_NUMBER]

  return {
    id: rawOrder.id,
    user_id: rawOrder.user_id,
    status: rawOrder.status as OrderStatus,
    payment_status: rawOrder.payment_status as PaymentStatus,
    payment_method: rawOrder.payment_method,
    total: rawOrder.total,
    subtotal: rawOrder.subtotal,
    delivery_fee: rawOrder.delivery_fee,
    scheduled_for: rawOrder.scheduled_for,
    source: rawOrder.source as "web" | "whatsapp" | "recurring",
    created_at: rawOrder.created_at,
    customer_name: rawOrder.profile?.full_name || "Cliente",
    customer_phone: rawOrder.customer_phone ?? rawOrder.profile?.phone ?? undefined,
    restore_token: rawOrder.restore_token ?? null,
    city_slug: rawOrder.city?.slug ?? null,
    staff_phones: staffPhones,
    items: rawItems.map((item) => ({
      name: item.product?.name || "Producto",
      quantity: item.quantity,
    })),
  }
}

// ============================================================
// Message Builders
// ============================================================

// ============================================================
// Plantillas de Meta (es_MX) para avisos proactivos al cliente
// ============================================================
// Creadas y sometidas a aprobación en Meta el 2026-11-24. Variables
// del cuerpo, en orden:
//  - confirmacion_pedido_resurte: 1=nombre, 2=número de pedido, 3=total
//  - actualizacion_pedido_resurte: 1=nombre, 2=número de pedido, 3=novedad
//  - recordatorio_pago_resurte: 1=nombre, 2=número de pedido, 3=total

const TEMPLATE_ORDER_CONFIRMATION = "confirmacion_pedido_resurte"
const TEMPLATE_ORDER_STATUS_UPDATE = "actualizacion_pedido_resurte"
const TEMPLATE_PAYMENT_REMINDER = "recordatorio_pago_resurte"

/** La "novedad" ({{3}}) de la plantilla de actualización, por estado. */
const STATUS_NOVELTY: Record<string, string> = {
  pending: "está pendiente de confirmación",
  confirmed: "fue confirmado y ya lo estamos preparando",
  preparing: "está en preparación",
  out_for_delivery: "va en camino",
  delivered: "fue entregado",
  cancelled: "fue cancelado",
}

/** Total como lo muestran los demás mensajes al cliente: "$609.00 MXN". */
function formatTemplateTotal(total: number): string {
  return `$${total.toFixed(2)} MXN`
}

function buildOrderItemsText(items?: { name: string; quantity: number }[]): string {
  if (!items || items.length === 0) return ""
  return items.map((item) => `  • ${item.quantity}x ${item.name}`).join("\n")
}

function buildNewOrderStaffMessage(order: OrderWithDetails): string {
  const items = buildOrderItemsText(order.items)
  const paymentMethod = order.payment_method === "cash_on_delivery" ? "Efectivo" : order.payment_method.toUpperCase()

  return [
    `🛎 *¡Nuevo pedido #${order.id}!*`,
    ``,
    `*Tienda:* Resurte.me`,
    `*Cliente:* ${order.customer_name}`,
    `*Total:* $${order.total.toFixed(2)} MXN`,
    `*Método de pago:* ${paymentMethod}`,
    `*Origen:* ${order.source === "whatsapp" ? "WhatsApp" : "Web"}`,
    order.scheduled_for ? `*Entrega:* ${new Date(order.scheduled_for).toLocaleString("es-MX")}` : "",
    items ? `\n*Productos:*\n${items}` : "",
    ``,
    `_Confirma o cancela el pedido desde el panel de administración._`,
  ].filter(Boolean).join("\n")
}

function buildPaymentConfirmedMessage(order: OrderWithDetails): string {
  return [
    `✅ *¡Pago confirmado!*`,
    ``,
    `Hola ${order.customer_name},`,
    ``,
    `Hemos recibido tu pago de *$${order.total.toFixed(2)} MXN* para el pedido #${order.id}.`,
    ``,
    `Tu pedido será procesado y te notificaremos cuando esté listo.`,
    ``,
    `¡Gracias por tu compra en Resurte.me! 🎉`,
  ].join("\n")
}

function buildFulfillmentUpdateMessage(order: OrderWithDetails, fulfillmentStatus: string): string {
  const labels: Record<string, string> = {
    ready: "Listo para recoger",
    out_for_delivery: "En camino",
    delivered: "Entregado",
  }

  return [
    `📦 Actualización de entrega`,
    ``,
    `Pedido #${order.id}`,
    `Estado: *${labels[fulfillmentStatus] || fulfillmentStatus}*`,
    ``,
    fulfillmentStatus === "ready" ? "Tu pedido está listo. ¡Ven por él!" : "",
    fulfillmentStatus === "out_for_delivery" ? "Tu pedido va en camino. ¡Llega pronto! 🛵" : "",
    fulfillmentStatus === "delivered" ? "Tu pedido ha sido entregado. ¡Buen provecho! 🎉" : "",
  ].filter(Boolean).join("\n")
}

// ============================================================
// Workflow Executors
// ============================================================

/**
 * Workflow 1: Notify staff when a new order is placed.
 */
export async function notifyStaffNewOrder(orderId: number): Promise<WorkflowLog[]> {
  const order = await getOrderDetails(orderId)
  if (!order) return []

  const results: WorkflowLog[] = []

  // If no staff phones configured, skip
  if (!order.staff_phones || order.staff_phones.length === 0) {
    logger.warn("workflow.no_staff_phones", { fallback: "default" })
    return results
  }

  const message = buildNewOrderStaffMessage(order)

  for (const phone of order.staff_phones) {
    try {
      const res = await sendTextMessage({ to: phone, text: message })
      const messageId = res.messages?.[0]?.id || null

      await logWorkflow("new_order_staff", orderId, phone, messageId, "sent")
      results.push({
        workflow_type: "new_order_staff",
        order_id: orderId,
        recipient: phone,
        message_id: messageId,
        status: "sent",
      })
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Unknown error"
      logger.error(`[Workflow] Failed to notify staff ${phone}:`, errorMsg)
      await logWorkflow("new_order_staff", orderId, phone, null, "failed", errorMsg)
      results.push({
        workflow_type: "new_order_staff",
        order_id: orderId,
        recipient: phone,
        status: "failed",
        error: errorMsg,
      })
    }
  }

  return results
}

/**
 * Workflow 2: Confirm order to customer.
 * Proactivo (el cliente puede no tener conversación abierta): va por
 * plantilla aprobada, no por texto libre.
 */
export async function confirmOrderToCustomer(orderId: number): Promise<WorkflowLog | null> {
  const order = await getOrderDetails(orderId)
  if (!order || !order.customer_phone) return null

  try {
    const res = await sendTemplate({
      to: order.customer_phone,
      templateName: TEMPLATE_ORDER_CONFIRMATION,
      languageCode: "es_MX",
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", text: order.customer_name || "Cliente" },
            { type: "text", text: String(order.id) },
            { type: "text", text: formatTemplateTotal(order.total) },
          ],
        },
      ],
    })
    const messageId = res.messages?.[0]?.id || null

    await logWorkflow("new_order_customer", orderId, order.customer_phone, messageId, "sent")

    return {
      workflow_type: "new_order_customer",
      order_id: orderId,
      recipient: order.customer_phone,
      message_id: messageId,
      status: "sent",
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unknown error"
    logger.error(`[Workflow] Failed to confirm order to customer:`, errorMsg)
    await logWorkflow("new_order_customer", orderId, order.customer_phone || "unknown", null, "failed", errorMsg)
    return {
      workflow_type: "new_order_customer",
      order_id: orderId,
      recipient: order.customer_phone || "unknown",
      status: "failed",
      error: errorMsg,
    }
  }
}

/**
 * Workflow 3: Notify customer when order status changes.
 * Proactivo: va por plantilla aprobada, no por texto libre.
 */
export async function notifyCustomerStatusUpdate(orderId: number, newStatus: OrderStatus): Promise<WorkflowLog | null> {
  const order = await getOrderDetails(orderId)
  if (!order || !order.customer_phone) return null

  // Update the status in the order object for the message
  order.status = newStatus

  try {
    const res = await sendTemplate({
      to: order.customer_phone,
      templateName: TEMPLATE_ORDER_STATUS_UPDATE,
      languageCode: "es_MX",
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", text: order.customer_name || "Cliente" },
            { type: "text", text: String(order.id) },
            { type: "text", text: STATUS_NOVELTY[newStatus] || `cambió a ${newStatus}` },
          ],
        },
      ],
    })
    const messageId = res.messages?.[0]?.id || null

    await logWorkflow("status_update", orderId, order.customer_phone, messageId, "sent")

    return {
      workflow_type: "status_update",
      order_id: orderId,
      recipient: order.customer_phone,
      message_id: messageId,
      status: "sent",
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unknown error"
    logger.error(`[Workflow] Failed to send status update:`, errorMsg)
    await logWorkflow("status_update", orderId, order.customer_phone || "unknown", null, "failed", errorMsg)
    return {
      workflow_type: "status_update",
      order_id: orderId,
      recipient: order.customer_phone || "unknown",
      status: "failed",
      error: errorMsg,
    }
  }
}

/**
 * Aviso de la cancelación por falta de pago PROPIA de WhatsApp (el
 * paso final de whatsapp-order-config.ts): misma plantilla de
 * actualización que cualquier cambio de estado, pero la novedad dice
 * el motivo y cómo volver a pedir; el staff recibe el aviso en texto
 * libre, como los demás avisos internos. Se registra bajo
 * "status_update" porque eso es lo que es: un cambio de estado con
 * texto propio.
 */
export async function notifyWhatsAppUnpaidCancellation(
  orderId: number
): Promise<WorkflowLog | null> {
  const order = await getOrderDetails(orderId)
  if (!order || !order.customer_phone) return null

  try {
    const res = await sendTemplate({
      to: order.customer_phone,
      templateName: TEMPLATE_ORDER_STATUS_UPDATE,
      languageCode: "es_MX",
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", text: order.customer_name || "Cliente" },
            { type: "text", text: String(order.id) },
            {
              type: "text",
              text: "se canceló por falta de pago. Si lo necesitas, vuelve a pedirlo desde el catálogo",
            },
          ],
        },
      ],
    })
    const messageId = res.messages?.[0]?.id || null

    await logWorkflow("status_update", orderId, order.customer_phone, messageId, "sent")

    for (const phone of order.staff_phones ?? []) {
      try {
        await sendTextMessage({
          to: phone,
          text:
            `🚫 *Pedido #${order.id} cancelado por falta de pago* (regla de WhatsApp)\n\n` +
            `*Cliente:* ${order.customer_name}\n` +
            `*Total:* $${order.total.toFixed(2)} MXN\n\n` +
            `El stock reservado ya se liberó.`,
        })
        await logWorkflow("status_update", orderId, phone, null, "sent")
      } catch (staffErr) {
        logger.error(`[Workflow] Aviso a staff de cancelación sin pago falló:`, staffErr)
      }
    }

    return {
      workflow_type: "status_update",
      order_id: orderId,
      recipient: order.customer_phone,
      message_id: messageId,
      status: "sent",
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unknown error"
    logger.error(`[Workflow] Failed to notify WhatsApp unpaid cancellation:`, errorMsg)
    await logWorkflow("status_update", orderId, order.customer_phone || "unknown", null, "failed", errorMsg)
    return {
      workflow_type: "status_update",
      order_id: orderId,
      recipient: order.customer_phone || "unknown",
      status: "failed",
      error: errorMsg,
    }
  }
}

/**
 * Workflow 4: Send payment reminder to customer.
 * Proactivo (corre por CRON, sin conversación abierta): plantilla.
 */
export async function sendPaymentReminder(orderId: number): Promise<WorkflowLog | null> {
  const order = await getOrderDetails(orderId)
  if (!order || !order.customer_phone) return null

  // Only send reminders for pending payments
  if (order.payment_status !== "pending") return null

  try {
    const res = await sendTemplate({
      to: order.customer_phone,
      templateName: TEMPLATE_PAYMENT_REMINDER,
      languageCode: "es_MX",
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", text: order.customer_name || "Cliente" },
            { type: "text", text: String(order.id) },
            { type: "text", text: formatTemplateTotal(order.total) },
          ],
        },
      ],
    })
    const messageId = res.messages?.[0]?.id || null

    await logWorkflow("payment_reminder", orderId, order.customer_phone, messageId, "sent")

    // La "liga de pago" del recordatorio: la plantilla no admite
    // URLs variables, así que la liga pública del pedido va en un
    // texto libre enseguida. Esa página muestra el estado del pago
    // (y el bloque SPEI cuando el método lo es). El texto libre solo
    // se entrega dentro de la ventana de servicio de 24 h; el
    // recordatorio corre por cron y normalmente va fuera de ella, así
    // que un fallo aquí se registra y se ignora: la plantilla —el
    // aviso que sí llega siempre— ya se envió.
    if (order.restore_token && order.city_slug) {
      try {
        const url = buildTrackingUrl(order.city_slug, order.id, order.restore_token)
        await sendTextMessage({
          to: order.customer_phone,
          text: `👉 Revisa tu pedido #${order.id} y cómo pagarlo aquí:\n${url}`,
        })
      } catch (linkErr) {
        logger.warn(
          `[Workflow] Liga del pedido ${orderId} no entregada (ventana de 24 h cerrada, probablemente): ${
            linkErr instanceof Error ? linkErr.message : String(linkErr)
          }`
        )
      }
    }

    // Link de pago con tarjeta (Ola 4): la página hospedada de
    // Stripe por el SALDO del pedido (si ya abonó algo, el link es
    // por lo que falta). Mismo régimen que la liga de seguimiento:
    // texto libre tras la plantilla, best-effort fuera de la
    // ventana de 24 h. Sin llave de Stripe el generador se corta
    // antes de tocar la base y el recordatorio queda como antes.
    try {
      const supabase = await createServiceClient()
      const link = await getOrCreateOrderPaymentLink(supabase, {
        id: order.id,
        total: order.total,
        payment_status: order.payment_status,
        status: order.status,
        customer_email: null,
        restore_token: order.restore_token ?? null,
        city_slug: order.city_slug ?? null,
      })
      await sendTextMessage({
        to: order.customer_phone,
        text:
          `💳 Paga tu pedido #${order.id} con tarjeta en este link seguro de Stripe ` +
          `(por $${link.amount.toFixed(2)} MXN):\n${link.url}`,
      })
    } catch (payLinkErr) {
      logger.warn(
        `[Workflow] Link de pago del pedido ${orderId} no entregado: ${
          payLinkErr instanceof Error ? payLinkErr.message : String(payLinkErr)
        }`
      )
    }

    return {
      workflow_type: "payment_reminder",
      order_id: orderId,
      recipient: order.customer_phone,
      message_id: messageId,
      status: "sent",
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unknown error"
    logger.error(`[Workflow] Failed to send payment reminder:`, errorMsg)
    await logWorkflow("payment_reminder", orderId, order.customer_phone || "unknown", null, "failed", errorMsg)
    return {
      workflow_type: "payment_reminder",
      order_id: orderId,
      recipient: order.customer_phone || "unknown",
      status: "failed",
      error: errorMsg,
    }
  }
}

/**
 * Workflow 5: Confirm payment to customer.
 */
export async function confirmPaymentToCustomer(orderId: number): Promise<WorkflowLog | null> {
  const order = await getOrderDetails(orderId)
  if (!order || !order.customer_phone) return null

  try {
    const message = buildPaymentConfirmedMessage(order)
    const res = await sendTextMessage({ to: order.customer_phone, text: message })
    const messageId = res.messages?.[0]?.id || null

    await logWorkflow("payment_confirmed", orderId, order.customer_phone, messageId, "sent")

    return {
      workflow_type: "payment_confirmed",
      order_id: orderId,
      recipient: order.customer_phone,
      message_id: messageId,
      status: "sent",
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unknown error"
    logger.error(`[Workflow] Failed to confirm payment:`, errorMsg)
    await logWorkflow("payment_confirmed", orderId, order.customer_phone || "unknown", null, "failed", errorMsg)
    return {
      workflow_type: "payment_confirmed",
      order_id: orderId,
      recipient: order.customer_phone || "unknown",
      status: "failed",
      error: errorMsg,
    }
  }
}

/**
 * Workflow 6: Send fulfillment status update to customer.
 */
export async function notifyFulfillmentUpdate(
  orderId: number,
  fulfillmentStatus: string
): Promise<WorkflowLog | null> {
  const order = await getOrderDetails(orderId)
  if (!order || !order.customer_phone) return null

  try {
    const message = buildFulfillmentUpdateMessage(order, fulfillmentStatus)
    const res = await sendTextMessage({ to: order.customer_phone, text: message })
    const messageId = res.messages?.[0]?.id || null

    await logWorkflow("fulfillment_update", orderId, order.customer_phone, messageId, "sent")

    return {
      workflow_type: "fulfillment_update",
      order_id: orderId,
      recipient: order.customer_phone,
      message_id: messageId,
      status: "sent",
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unknown error"
    logger.error(`[Workflow] Failed to send fulfillment update:`, errorMsg)
    await logWorkflow("fulfillment_update", orderId, order.customer_phone || "unknown", null, "failed", errorMsg)
    return {
      workflow_type: "fulfillment_update",
      order_id: orderId,
      recipient: order.customer_phone || "unknown",
      status: "failed",
      error: errorMsg,
    }
  }
}

// ============================================================
// Batch Operations (CRON Jobs)
// ============================================================

/**
 * Fila mínima que consume el barrido de recordatorios de pago. `coupon_code`
 * es opcional porque el select completo se reintenta sin ella si la migración
 * 00114 no está aplicada (ver `checkAndSendPaymentReminders`).
 */
interface PendingPaymentOrder {
  id: number
  created_at: string
  status: OrderStatus
  /** Decide si el pedido entra en la recuperación (ver `payment-recovery.ts`). */
  payment_status: string | null
  payment_method: string | null
  /** El paso final propio de cancelación solo alcanza a pedidos de WhatsApp. */
  source?: string | null
  coupon_code?: string | null
}

/**
 * Check all pending-payment orders and send reminders at the right intervals.
 * Called by Vercel Cron every hour.
 * WC1: respeta whatsapp_automations (is_active + config.levels persistidos).
 */
export async function checkAndSendPaymentReminders(): Promise<{
  checked: number
  reminded: number
  cancelled: number
  errors: string[]
}> {
  const supabase = await createServiceClient()
  const errors: string[] = []
  let reminded = 0
  let cancelled = 0

  // WC1 — leer la config persistida; si el admin la desactivó, no enviar nada.
  const { getAutomationConfig, effectiveAutomationConfig, resolveReminderLevels, isReminderDue } =
    await import("@/lib/whatsapp-automations-engine")
  const automationCfg = effectiveAutomationConfig(
    await getAutomationConfig(supabase, "payment_recovery"),
    "payment_recovery"
  )
  if (!automationCfg.is_active) {
    return { checked: 0, reminded: 0, cancelled: 0, errors: [] }
  }
  const reminderLevels = resolveReminderLevels(automationCfg)

  // Get pending payment orders (bounded: select only what the loop uses and
  // cap the batch so an unbounded `select("*")` can't grow without limit).
  // `coupon_code` es opcional: se reintenta sin ella si la migración 00114 no
  // está aplicada, para que un desfase de esquema no tumbe los recordatorios.
  //
  // `payment_method` viaja en el select porque el bucle decide con él: sin ese
  // dato, `isPaymentRecoverable()` no puede distinguir un impago real de un
  // pedido contra entrega, que nace `pending` y no es un impago. Ver
  // `src/lib/payment-recovery.ts`.
  let orders: PendingPaymentOrder[] | null = null
  let fetchError: { message: string } | null = null

  const fullPending = await applyPaymentRecoveryFilter(
    supabase
      .from("orders")
      .select("id, created_at, status, payment_status, coupon_code, payment_method, source")
      .eq("payment_status", "pending")
      .neq("status", "cancelled")
  ).limit(500)

  if (fullPending.error?.code === "42703") {
    const retry = await applyPaymentRecoveryFilter(
      supabase
        .from("orders")
        .select("id, created_at, status, payment_status, payment_method, source")
        .eq("payment_status", "pending")
        .neq("status", "cancelled")
    ).limit(500)
    orders = (retry.data as PendingPaymentOrder[] | null) ?? null
    fetchError = retry.error ? { message: retry.error.message } : null
  } else {
    orders = (fullPending.data as PendingPaymentOrder[] | null) ?? null
    fetchError = fullPending.error ? { message: fullPending.error.message } : null
  }

  if (fetchError) {
    logger.error("[Workflow] Failed to fetch pending orders:", fetchError)
    return { checked: 0, reminded: 0, cancelled: 0, errors: [fetchError.message] }
  }

  const now = new Date()

  for (const order of orders || []) {
    // Segundo cinturón, y no una repetición de la consulta: si un refactor
    // futuro toca el `select` de arriba y se lleva el filtro por delante, el
    // bucle seguiría cancelando pedidos contra entrega en silencio. Aquí la
    // decisión se toma con la misma regla que la consulta usa para filtrar.
    if (!isPaymentRecoverable(order)) continue

    const created = new Date(order.created_at)
    const hoursSinceCreation = Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60))

    // Paso final propio de WhatsApp (whatsapp-order-config.ts): si
    // está encendido, los pedidos de WhatsApp se gobiernan por su
    // regla —último nivel de recordatorio + gracia— y NO por la
    // general; nace apagado y entonces todo sigue como siempre.
    const waOwnRule = WHATSAPP_UNPAID_CANCEL_ENABLED && order.source === "whatsapp"
    const lastReminderLevel =
      reminderLevels.length > 0
        ? Math.max(...reminderLevels)
        : PAYMENT_RECOVERY_CANCEL_HOURS - WHATSAPP_UNPAID_CANCEL_GRACE_HOURS
    const waCancelDue =
      waOwnRule &&
      isWhatsAppUnpaidCancellationDue(
        hoursSinceCreation,
        lastReminderLevel,
        WHATSAPP_UNPAID_CANCEL_GRACE_HOURS
      )
    const genericCancelDue = !waOwnRule && hoursSinceCreation >= PAYMENT_RECOVERY_CANCEL_HOURS

    // Check if we should cancel very old unpaid orders (>72 hours)
    if (waCancelDue || genericCancelDue) {
      try {
        // El estado se escribe condicionalmente sobre el que se leyó: si dos
        // ejecuciones del cron se solapan, solo una gana y la cascada no se
        // aplica dos veces.
        const { data: cancelledRows, error: cancelError } = await supabase
          .from("orders")
          .update({ status: "cancelled", updated_at: now.toISOString() })
          .eq("id", order.id)
          .eq("status", order.status)
          .select("id")

        if (cancelError) throw new Error(cancelError.message)
        if (!cancelledRows || cancelledRows.length === 0) continue

        // Misma cascada que usan la cancelación del admin y la del cliente:
        // devuelve el inventario reservado (migración 00143) y el uso del
        // cupón. Antes esta ruta liberaba el stock a mano y se saltaba el
        // cupón, así que un pedido abandonado consumía una unidad del cupón
        // para siempre aunque nunca se hubiera cobrado.
        await applyOrderCancellationEffects(supabase, {
          orderId: order.id,
          oldStatus: order.status,
          couponCode: order.coupon_code,
        })

        // Notify customer about cancellation: con la regla propia el
        // aviso dice el motivo ("por falta de pago"); con la general,
        // el aviso de cancelación de siempre.
        if (waCancelDue) {
          await notifyWhatsAppUnpaidCancellation(order.id)
        } else {
          await notifyCustomerStatusUpdate(order.id, "cancelled")
        }
        cancelled++
      } catch (err) {
        errors.push(`Failed to cancel order ${order.id}: ${err instanceof Error ? err.message : "Unknown"}`)
      }
      continue
    }

    // ¿Toca recordatorio en alguno de los niveles configurados?
    if (isReminderDue(hoursSinceCreation, reminderLevels)) {
      try {
        await sendPaymentReminder(order.id)
        reminded++
      } catch (err) {
        errors.push(`Failed to remind order ${order.id}: ${err instanceof Error ? err.message : "Unknown"}`)
      }
    }
  }

  return {
    checked: (orders || []).length,
    reminded,
    cancelled,
    errors,
  }
}

/**
 * Run all workflows for a newly created order.
 * Called immediately after order creation.
 */
export async function runNewOrderWorkflows(orderId: number): Promise<{
  staff: WorkflowLog[]
  customer: WorkflowLog | null
}> {
  const [staff, customer] = await Promise.all([
    notifyStaffNewOrder(orderId),
    confirmOrderToCustomer(orderId),
  ])

  // Email transaccional de confirmación (best-effort, con dedupe).
  await sendOrderConfirmationEmail(orderId)

  return { staff, customer }
}

// ============================================================
// Order Lifecycle Hook
// ============================================================

/**
 * Called when an order status changes to determine which workflows to run.
 */
export async function onOrderStatusChange(
  orderId: number,
  oldStatus: OrderStatus,
  newStatus: OrderStatus
): Promise<WorkflowLog[]> {
  const results: WorkflowLog[] = []

  // Skip if status didn't actually change
  if (oldStatus === newStatus) return results

  logger.info("workflow.order_status", { orderId, from: oldStatus, to: newStatus })

  // Always notify customer of status change
  const statusResult = await notifyCustomerStatusUpdate(orderId, newStatus)
  if (statusResult) results.push(statusResult)

  // Email transaccional del hito (confirmed / out_for_delivery / delivered).
  await sendOrderStatusEmail(orderId, newStatus)

  // If newly confirmed, check if payment is pending and schedule reminder
  if (newStatus === "confirmed") {
    // Payment reminder will be handled by the CRON job
  }

  return results
}
