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
 *  - All messages use sendTextMessage() for now (template-free for dev)
 *    Production should use sendTemplate() with Meta-approved templates
 */

import { sendTextMessage, sendTemplate } from "@/lib/whatsapp"
import { createServiceClient } from "@/lib/supabase/service"
import type { OrderStatus, PaymentStatus } from "@/types"

// ============================================================
// Types
// ============================================================

export type WorkflowType =
  | "new_order_staff"
  | "new_order_customer"
  | "status_update"
  | "payment_reminder"
  | "payment_confirmed"
  | "fulfillment_update"

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

export interface OrderWithDetails {
  id: number
  user_id: string
  store_id: number
  status: OrderStatus
  payment_status: PaymentStatus
  payment_method: string
  total: number
  subtotal: number
  delivery_fee: number
  scheduled_for: string | null
  source: "web" | "whatsapp"
  created_at: string
  // Joined fields
  store_name?: string
  store_slug?: string
  store_whatsapp?: string
  customer_name?: string
  customer_phone?: string
  staff_phones?: string[]
  items?: { name: string; quantity: number }[]
}

/** Raw shape of order joined with store and profile from Supabase */
interface RawOrderRow {
  id: number
  user_id: string
  store_id: number
  status: string
  payment_status: string
  payment_method: string
  total: number
  subtotal: number
  delivery_fee: number
  scheduled_for: string | null
  source: string
  created_at: string
  store: { name: string; slug: string; whatsapp_number: string | null }
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
      store_id: 1, // Will be overridden with actual store_id when available
      from_number: recipient,
      message_type: `workflow:${workflowType}`,
      content: JSON.stringify({ order_id: orderId, workflow_type: workflowType, message_id: messageId, status, error }),
      order_id: orderId,
      direction: "outbound",
    })
  } catch (err) {
    console.error(`[Workflow] Failed to log ${workflowType}:`, err)
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
      store:stores(name, slug, whatsapp_number),
      profile:profiles!orders_user_id_fkey(full_name, phone)
    `)
    .eq("id", orderId)
    .single()

  if (error || !order) {
    console.error(`[Workflow] Order ${orderId} not found:`, error)
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

  // Fetch staff phones for this store
  // For now, use the store's whatsapp_number as staff contact
  // In production, you'd have a staff/team table
  const storeWhatsapp = rawOrder.store?.whatsapp_number || null
  const staffPhones = storeWhatsapp ? [storeWhatsapp] : []

  return {
    id: rawOrder.id,
    user_id: rawOrder.user_id,
    store_id: rawOrder.store_id,
    status: rawOrder.status as OrderStatus,
    payment_status: rawOrder.payment_status as PaymentStatus,
    payment_method: rawOrder.payment_method,
    total: rawOrder.total,
    subtotal: rawOrder.subtotal,
    delivery_fee: rawOrder.delivery_fee,
    scheduled_for: rawOrder.scheduled_for,
    source: rawOrder.source as "web" | "whatsapp",
    created_at: rawOrder.created_at,
    store_name: rawOrder.store?.name || "Resurte.me",
    store_slug: rawOrder.store?.slug || "",
    store_whatsapp: storeWhatsapp ?? undefined,
    customer_name: rawOrder.profile?.full_name || "Cliente",
    customer_phone: rawOrder.profile?.phone ?? undefined,
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

const STATUS_LABELS: Record<string, string> = {
  pending: "Pendiente",
  confirmed: "Confirmado",
  preparing: "Preparando",
  out_for_delivery: "En camino",
  delivered: "Entregado",
  cancelled: "Cancelado",
}

const STATUS_EMOJI: Record<string, string> = {
  pending: "⏳",
  confirmed: "✅",
  preparing: "👨‍🍳",
  out_for_delivery: "🛵",
  delivered: "📦",
  cancelled: "❌",
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
    `*Tienda:* ${order.store_name}`,
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

function buildNewOrderCustomerMessage(order: OrderWithDetails): string {
  const items = buildOrderItemsText(order.items)

  return [
    `👋 ¡Hola ${order.customer_name}!`,
    ``,
    `Gracias por tu compra en *${order.store_name}*.`,
    ``,
    `📋 *Pedido #${order.id}*`,
    items ? `\n${items}\n` : "",
    `💰 Total: $${order.total.toFixed(2)} MXN`,
    `💳 Pago: ${order.payment_status === "paid" ? "Pagado ✅" : "Pendiente ⏳"}`,
    order.scheduled_for ? `🕐 Entrega estimada: ${new Date(order.scheduled_for).toLocaleString("es-MX")}` : "",
    ``,
    `Te notificaremos cuando tu pedido esté listo.`,
    `Si tienes dudas, responde a este mensaje.`,
  ].filter(Boolean).join("\n")
}

function buildStatusUpdateMessage(order: OrderWithDetails): string {
  const emoji = STATUS_EMOJI[order.status] || "📋"
  const label = STATUS_LABELS[order.status] || order.status

  const messages: Record<string, string> = {
    confirmed: `✅ Tu pedido #${order.id} ha sido *confirmado* y lo estamos preparando.`,
    preparing: `👨‍🍳 Tu pedido #${order.id} está siendo *preparado*.`,
    out_for_delivery: `🛵 ¡Tu pedido #${order.id} va *en camino*! Llega pronto.`,
    delivered: `📦 Tu pedido #${order.id} ha sido *entregado*. ¡Buen provecho!`,
    cancelled: `❌ Tu pedido #${order.id} ha sido *cancelado*. Si fue un error, contáctanos.`,
    pending: `⏳ Tu pedido #${order.id} está *pendiente* de confirmación.`,
  }

  const specificMessage = messages[order.status]
  const baseMessage = `${emoji} Actualización de tu pedido #${order.id} en *${order.store_name}*.\n\nEstado: *${label}*`

  return specificMessage || baseMessage
}

function buildPaymentReminderMessage(order: OrderWithDetails, hoursAgo: number): string {
  const paymentMethod = order.payment_method === "spei" ? "SPEI" :
    order.payment_method === "oxxo" ? "OXXO" :
    order.payment_method === "mercado_pago" ? "Mercado Pago" :
    order.payment_method.toUpperCase()

  const urgencia = hoursAgo >= 48 ? "⚠️ ÚLTIMO AVISO" : hoursAgo >= 24 ? "⏰ Recordatorio importante" : "💡 Recordatorio"

  return [
    `${urgencia}`,
    ``,
    `Hola ${order.customer_name},`,
    ``,
    `El pago de tu pedido #${order.id} por *$${order.total.toFixed(2)} MXN* en ${order.store_name} sigue pendiente.`,
    ``,
    `Método de pago: *${paymentMethod}*`,
    ``,
    `Por favor completa tu pago para que procesemos tu pedido.`,
    ``,
    hoursAgo >= 48 ? `_Si no se recibe el pago, el pedido será cancelado en las próximas horas._` : "",
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
    `¡Gracias por tu compra en ${order.store_name}! 🎉`,
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
    console.log(`[Workflow] No staff phones configured for store ${order.store_id}`)
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
      console.error(`[Workflow] Failed to notify staff ${phone}:`, errorMsg)
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
 */
export async function confirmOrderToCustomer(orderId: number): Promise<WorkflowLog | null> {
  const order = await getOrderDetails(orderId)
  if (!order || !order.customer_phone) return null

  try {
    const message = buildNewOrderCustomerMessage(order)
    const res = await sendTextMessage({ to: order.customer_phone, text: message })
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
    console.error(`[Workflow] Failed to confirm order to customer:`, errorMsg)
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
 */
export async function notifyCustomerStatusUpdate(orderId: number, newStatus: OrderStatus): Promise<WorkflowLog | null> {
  const order = await getOrderDetails(orderId)
  if (!order || !order.customer_phone) return null

  // Update the status in the order object for the message
  order.status = newStatus

  try {
    const message = buildStatusUpdateMessage(order)
    const res = await sendTextMessage({ to: order.customer_phone, text: message })
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
    console.error(`[Workflow] Failed to send status update:`, errorMsg)
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
 */
export async function sendPaymentReminder(orderId: number): Promise<WorkflowLog | null> {
  const order = await getOrderDetails(orderId)
  if (!order || !order.customer_phone) return null

  // Only send reminders for pending payments
  if (order.payment_status !== "pending") return null

  // Calculate hours since order was created
  const created = new Date(order.created_at)
  const now = new Date()
  const hoursAgo = Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60))

  try {
    const message = buildPaymentReminderMessage(order, hoursAgo)
    const res = await sendTextMessage({ to: order.customer_phone, text: message })
    const messageId = res.messages?.[0]?.id || null

    await logWorkflow("payment_reminder", orderId, order.customer_phone, messageId, "sent")

    return {
      workflow_type: "payment_reminder",
      order_id: orderId,
      recipient: order.customer_phone,
      message_id: messageId,
      status: "sent",
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unknown error"
    console.error(`[Workflow] Failed to send payment reminder:`, errorMsg)
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
    console.error(`[Workflow] Failed to confirm payment:`, errorMsg)
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
    console.error(`[Workflow] Failed to send fulfillment update:`, errorMsg)
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

const REMINDER_INTERVALS = [1, 24, 48] // hours

/**
 * Check all pending-payment orders and send reminders at the right intervals.
 * Called by Vercel Cron every hour.
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

  // Get all pending payment orders
  const { data: orders, error } = await supabase
    .from("orders")
    .select("*")
    .eq("payment_status", "pending")
    .neq("status", "cancelled")

  if (error) {
    console.error("[Workflow] Failed to fetch pending orders:", error)
    return { checked: 0, reminded: 0, cancelled: 0, errors: [error.message] }
  }

  const now = new Date()

  for (const order of orders || []) {
    const created = new Date(order.created_at)
    const hoursSinceCreation = Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60))

    // Check if we should cancel very old unpaid orders (>72 hours)
    if (hoursSinceCreation >= 72) {
      try {
        await supabase
          .from("orders")
          .update({ status: "cancelled", updated_at: now.toISOString() })
          .eq("id", order.id)

        // Notify customer about cancellation
        await notifyCustomerStatusUpdate(order.id, "cancelled")
        cancelled++
      } catch (err) {
        errors.push(`Failed to cancel order ${order.id}: ${err instanceof Error ? err.message : "Unknown"}`)
      }
      continue
    }

    // Check if it's time for a reminder at this interval
    // We check if hoursSinceCreation is "close enough" to one of our intervals
    // Since the CRON runs hourly, we target ±30 minutes around the interval
    for (const interval of REMINDER_INTERVALS) {
      if (Math.abs(hoursSinceCreation - interval) <= 0.5) {
        try {
          await sendPaymentReminder(order.id)
          reminded++
        } catch (err) {
          errors.push(`Failed to remind order ${order.id}: ${err instanceof Error ? err.message : "Unknown"}`)
        }
        break // Only send one reminder per check
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

  console.log(`[Workflow] Order #${orderId} status: ${oldStatus} → ${newStatus}`)

  // Always notify customer of status change
  const statusResult = await notifyCustomerStatusUpdate(orderId, newStatus)
  if (statusResult) results.push(statusResult)

  // If newly confirmed, check if payment is pending and schedule reminder
  if (newStatus === "confirmed") {
    // Payment reminder will be handled by the CRON job
  }

  return results
}
