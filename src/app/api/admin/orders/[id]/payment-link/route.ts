import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/service"
import { requireAdmin } from "@/lib/admin-auth"
import { logAdminAction } from "@/lib/audit-log"
import { readJsonBody } from "@/lib/api-body"
import { logger } from "@/lib/logger"
import { sendTextMessage } from "@/lib/whatsapp"
import {
  getOrCreateOrderPaymentLink,
  PaymentLinkError,
} from "@/lib/stripe-payment-link"

export const runtime = "nodejs"

/**
 * POST /api/admin/orders/[id]/payment-link   body: { amount?, send? }
 *
 * Genera (o reutiliza) el link de pago con tarjeta del pedido desde
 * el panel: por el saldo completo o por un abono (`amount`). Con
 * `send: true` además lo manda por WhatsApp al teléfono del pedido
 * en texto libre — eso solo se entrega dentro de la ventana de
 * servicio de 24 h; fuera de ella la respuesta lo declara
 * (`sent: false`) y el link queda listo para copiarse y pegarse
 * donde el staff esté hablando con el cliente.
 *
 * El monto sale de la BD (total − abonado), nunca del panel: el
 * `amount` del body solo puede pedir un abono menor o igual al
 * saldo, y el generador lo revalida contra el libro.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { response: adminDenied, user: adminUser } = await requireAdmin({ permission: "pedidos" })
  if (adminDenied) return adminDenied

  const { id } = await params
  const orderId = Number(id)
  if (!Number.isInteger(orderId) || orderId <= 0) {
    return NextResponse.json({ error: "ID de pedido inválido" }, { status: 400 })
  }

  const bodyResult = await readJsonBody<{ amount?: unknown; send?: unknown }>(request)
  if (!bodyResult.ok) {
    return NextResponse.json({ error: bodyResult.error }, { status: bodyResult.status })
  }
  const amount =
    typeof bodyResult.data.amount === "number" && Number.isFinite(bodyResult.data.amount)
      ? bodyResult.data.amount
      : undefined
  const send = bodyResult.data.send === true

  try {
    const supabase = await createServiceClient()
    const { data: order, error } = await supabase
      .from("orders")
      .select(
        "id, total, payment_status, status, customer_email, customer_phone, restore_token, cities(slug)"
      )
      .eq("id", orderId)
      .maybeSingle()
    if (error) throw error
    if (!order) {
      return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 })
    }
    if (order.status === "cancelled") {
      return NextResponse.json(
        { error: "Un pedido cancelado no admite link de pago" },
        { status: 409 }
      )
    }

    const city = Array.isArray(order.cities) ? order.cities[0] : order.cities
    const link = await getOrCreateOrderPaymentLink(
      supabase,
      {
        id: order.id,
        total: order.total,
        payment_status: order.payment_status,
        status: order.status,
        customer_email: order.customer_email ?? null,
        restore_token: order.restore_token ?? null,
        city_slug: city?.slug ?? null,
      },
      { amount }
    )

    let sent = false
    let sendError: string | null = null
    if (send) {
      if (!order.customer_phone) {
        sendError = "El pedido no tiene teléfono para enviarle el link"
      } else {
        try {
          await sendTextMessage({
            to: order.customer_phone,
            text:
              `💳 Paga tu pedido #${order.id} de Resurte.me con tarjeta aquí:\n${link.url}\n` +
              `Es un link seguro de Stripe por $${link.amount.toFixed(2)} MXN. ¡Gracias por surtirte con nosotros!`,
          })
          sent = true
        } catch (sendErr) {
          sendError =
            sendErr instanceof Error ? sendErr.message : "No se pudo enviar por WhatsApp"
          logger.warn("admin.payment_link_send_failed", { orderId: id, error: sendError })
        }
      }
    }

    await logAdminAction(supabase, {
      actorId: adminUser?.id ?? null,
      actorEmail: adminUser?.email ?? null,
      action: "order_payment_link",
      entity: "orders",
      entityId: orderId,
      detail: { amount: link.amount, reused: link.reused, sent },
    })

    return NextResponse.json({
      url: link.url,
      amount: link.amount,
      balance: link.balance,
      reused: link.reused,
      sent,
      sendError,
    })
  } catch (err) {
    if (err instanceof PaymentLinkError) {
      if (err.code === "stripe_not_configured") {
        return NextResponse.json(
          { error: "Stripe no está configurado en este entorno" },
          { status: 503 }
        )
      }
      if (err.code === "no_balance") {
        return NextResponse.json({ error: "Este pedido ya está pagado" }, { status: 409 })
      }
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    logger.error("[ADMIN-PAYMENT-LINK] failed:", err)
    return NextResponse.json(
      { error: "No se pudo generar el link de pago" },
      { status: 500 }
    )
  }
}
