import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/service"
import { requireAdmin } from "@/lib/admin-auth"
import { logAdminAction } from "@/lib/audit-log"
import { logger } from "@/lib/logger"
import { voidOrderPayment } from "@/lib/order-payments"

export const runtime = "nodejs"

/**
 * DELETE /api/admin/orders/[id]/payments/[paymentId]
 *
 * Anula un pago del libro (error de captura: monto o pedido
 * equivocado). La fila no se borra — pasa a `voided` y deja de
 * sumar — y si el pedido figuraba pagado solo gracias al libro,
 * su estado de pago vuelve a `pending`. El estado del pedido
 * (confirmado, en preparación…) no se toca.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; paymentId: string }> }
) {
  const { response: adminDenied, user: adminUser } = await requireAdmin({ permission: "pedidos" })
  if (adminDenied) return adminDenied

  const { id, paymentId } = await params
  const orderId = Number(id)
  if (!Number.isInteger(orderId) || orderId <= 0 || !paymentId) {
    return NextResponse.json({ error: "Parámetros inválidos" }, { status: 400 })
  }

  try {
    const supabase = await createServiceClient()
    const { data: order, error } = await supabase
      .from("orders")
      .select("id, total, payment_status, status")
      .eq("id", orderId)
      .maybeSingle()
    if (error) throw error
    if (!order) {
      return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 })
    }

    const result = await voidOrderPayment(supabase, order, paymentId)
    if (!result.voided || !result.summary) {
      return NextResponse.json(
        { error: "Ese pago no existe o ya estaba anulado" },
        { status: 404 }
      )
    }

    await logAdminAction(supabase, {
      actorId: adminUser?.id ?? null,
      actorEmail: adminUser?.email ?? null,
      action: "order_payment_void",
      entity: "orders",
      entityId: orderId,
      detail: { payment_id: paymentId, reverted_paid: result.revertedPaid },
    })

    return NextResponse.json({
      success: true,
      revertedPaid: result.revertedPaid,
      total: result.summary.total,
      paidAmount: result.summary.paidAmount,
      balance: result.summary.balance,
      payments: result.summary.payments,
    })
  } catch (err) {
    logger.error("[ADMIN-PAYMENTS] DELETE failed:", err)
    return NextResponse.json({ error: "No se pudo anular el pago" }, { status: 500 })
  }
}
