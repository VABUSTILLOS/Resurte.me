import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/service"
import { requireAdmin } from "@/lib/admin-auth"
import { logAdminAction } from "@/lib/audit-log"
import { readJsonBody } from "@/lib/api-body"
import { logger } from "@/lib/logger"
import { notifyCashbackCredited } from "@/lib/notifications"
import { toCents } from "@/lib/payment-validation"
import {
  ORDER_PAYMENT_METHODS,
  getOrderPaymentSummary,
  recordOrderPayment,
  type OrderPaymentMethod,
} from "@/lib/order-payments"
import { readPersistedOrderPaymentLink } from "@/lib/stripe-payment-link"

export const runtime = "nodejs"

/**
 * Libro de pagos del pedido (Ola 4, migración 00233).
 *
 * GET  — resumen: total, abonado, saldo, las filas del libro y el
 *        último link de pago generado. Sin la migración responde
 *        `available: false` y el panel lo declara en vez de romperse.
 * POST — registra un pago manual (el SPEI que el staff ya confirmó
 *        en el banco, un abono en efectivo…). El monto se valida
 *        contra el saldo de la BD; si el libro cubre el total, el
 *        pedido pasa a pagado aquí mismo. Registrar un pago NO es
 *        lo mismo que el botón «Confirmar pago» histórico: aquel
 *        voltea el estado sin dejar fila; este deja el asiento.
 */

async function fetchOrder(supabase: Awaited<ReturnType<typeof createServiceClient>>, orderId: number) {
  const { data, error } = await supabase
    .from("orders")
    .select("id, total, payment_status, status")
    .eq("id", orderId)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { response: adminDenied } = await requireAdmin({ permission: "pedidos" })
  if (adminDenied) return adminDenied

  const { id } = await params
  const orderId = Number(id)
  if (!Number.isInteger(orderId) || orderId <= 0) {
    return NextResponse.json({ error: "ID de pedido inválido" }, { status: 400 })
  }

  try {
    const supabase = await createServiceClient()
    const order = await fetchOrder(supabase, orderId)
    if (!order) {
      return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 })
    }

    const summary = await getOrderPaymentSummary(supabase, order)
    const persisted = await readPersistedOrderPaymentLink(supabase, orderId)

    return NextResponse.json({
      available: summary.available,
      total: summary.total,
      paidAmount: summary.paidAmount,
      balance: summary.balance,
      coveredByPayments: summary.coveredByPayments,
      isPaidStatus: summary.isPaidStatus,
      paymentStatus: order.payment_status,
      payments: summary.payments,
      paymentLink: persisted?.url
        ? {
            url: persisted.url,
            amount: persisted.amount,
            createdAt: persisted.createdAt,
          }
        : null,
    })
  } catch (err) {
    logger.error("[ADMIN-PAYMENTS] GET failed:", err)
    return NextResponse.json({ error: "No se pudieron leer los pagos" }, { status: 500 })
  }
}

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

  const bodyResult = await readJsonBody<{
    amount?: unknown
    method?: unknown
    note?: unknown
  }>(request)
  if (!bodyResult.ok) {
    return NextResponse.json({ error: bodyResult.error }, { status: bodyResult.status })
  }
  const { amount, method, note } = bodyResult.data

  if (typeof amount !== "number" || !Number.isFinite(amount) || toCents(amount) <= 0) {
    return NextResponse.json(
      { error: "El monto debe ser un número mayor a cero" },
      { status: 400 }
    )
  }
  if (
    typeof method !== "string" ||
    !(ORDER_PAYMENT_METHODS as readonly string[]).includes(method)
  ) {
    return NextResponse.json(
      { error: `Método inválido. Usa uno de: ${ORDER_PAYMENT_METHODS.join(", ")}` },
      { status: 400 }
    )
  }
  if (note != null && (typeof note !== "string" || note.length > 300)) {
    return NextResponse.json({ error: "La nota es demasiado larga" }, { status: 400 })
  }

  try {
    const supabase = await createServiceClient()
    const order = await fetchOrder(supabase, orderId)
    if (!order) {
      return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 })
    }
    if (order.status === "cancelled") {
      return NextResponse.json(
        { error: "Un pedido cancelado no admite pagos" },
        { status: 409 }
      )
    }

    const before = await getOrderPaymentSummary(supabase, order)
    if (!before.available) {
      return NextResponse.json(
        {
          error:
            "El libro de pagos aún no está activo: falta aplicar la migración 00233 en Supabase.",
        },
        { status: 409 }
      )
    }
    if (before.isPaidStatus) {
      return NextResponse.json({ error: "Este pedido ya está pagado" }, { status: 409 })
    }
    if (toCents(amount) > toCents(before.balance)) {
      return NextResponse.json(
        {
          error: `El monto pasa del saldo del pedido ($${before.balance.toFixed(2)})`,
        },
        { status: 400 }
      )
    }

    const result = await recordOrderPayment(supabase, order, {
      amount,
      method: method as OrderPaymentMethod,
      origin: "manual",
      note: typeof note === "string" && note.trim() ? note.trim() : null,
      createdBy: adminUser?.id ?? null,
    })
    if (!result.recorded || !result.summary) {
      return NextResponse.json(
        { error: "No se pudo registrar el pago" },
        { status: 500 }
      )
    }

    await logAdminAction(supabase, {
      actorId: adminUser?.id ?? null,
      actorEmail: adminUser?.email ?? null,
      action: "order_payment",
      entity: "orders",
      entityId: orderId,
      detail: {
        amount,
        method,
        origin: "manual",
        via: "order_payments",
        partial: result.summary.balance > 0,
        became_paid: result.becamePaid,
      },
    })

    // Cashback abonado por el trigger al pasar a pagado: avisar al
    // cliente en su campana, como hace la confirmación manual.
    if (result.becamePaid) {
      void notifyCashbackCredited(orderId).catch((e) =>
        logger.error("[ADMIN-PAYMENTS] cashback notify failed:", e)
      )
    }

    return NextResponse.json({
      success: true,
      becamePaid: result.becamePaid,
      total: result.summary.total,
      paidAmount: result.summary.paidAmount,
      balance: result.summary.balance,
      payments: result.summary.payments,
    })
  } catch (err) {
    logger.error("[ADMIN-PAYMENTS] POST failed:", err)
    return NextResponse.json({ error: "No se pudo registrar el pago" }, { status: 500 })
  }
}
