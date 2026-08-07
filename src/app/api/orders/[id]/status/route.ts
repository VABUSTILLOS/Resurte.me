/**
 * PATCH /api/orders/[id]/status
 * 
 * Updates an order's status and triggers WhatsApp workflow notifications.
 * Used by the admin panel when changing order status.
 * 
 * Body: { status?: OrderStatus, payment_status?: PaymentStatus }
 *   - status: nuevo estado del pedido (opcional).
 *   - payment_status: confirmación manual de pago para métodos sin cobro
 *     en línea (COD, SPEI, OXXO, Mercado Pago). El único valor permitido
 *     aquí es "paid"; al aplicarlo, el trigger trg_credit_cashback_on_payment
 *     abona el cashback a la wallet del usuario.
 * Authentication: Requires service role (admin only)
 */

import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/service"
import { requireAdmin } from "@/lib/admin-auth"
import { onOrderStatusChange } from "@/lib/workflows"
import type { OrderStatus, PaymentStatus } from "@/types"

const VALID_STATUSES: OrderStatus[] = [
  "pending", "confirmed", "preparing", "out_for_delivery", "delivered", "cancelled",
]

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Solo administradores pueden cambiar el estado de una orden o
    // confirmar el pago manualmente (esto dispara el abono de cashback).
    const { response: adminDenied } = await requireAdmin()
    if (adminDenied) {
      return adminDenied
    }

    const { id } = await params
    const orderId = parseInt(id, 10)

    if (isNaN(orderId)) {
      return NextResponse.json({ error: "Invalid order ID" }, { status: 400 })
    }

    const body = await req.json()
    const { status, payment_status } = body

    // Se requiere al menos uno de los dos campos
    if (!status && !payment_status) {
      return NextResponse.json(
        { error: "Se requiere status o payment_status" },
        { status: 400 }
      )
    }

    if (status && !VALID_STATUSES.includes(status)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}` },
        { status: 400 }
      )
    }

    // Confirmación manual de pago: solo se permite marcar como "paid".
    // Cualquier otro valor no se acepta por este endpoint (el flujo de
    // tarjeta lo controla el webhook de Stripe).
    const VALID_PAYMENT_STATUSES: PaymentStatus[] = ["paid"]
    if (payment_status && !VALID_PAYMENT_STATUSES.includes(payment_status)) {
      return NextResponse.json(
        { error: "payment_status solo puede ser 'paid' (confirmación manual de pago)" },
        { status: 400 }
      )
    }

    const supabase = await createServiceClient()

    // Fetch current order to get old status
    const { data: currentOrder, error: fetchError } = await supabase
      .from("orders")
      .select("status, payment_status, customer_phone, coupon_code")
      .eq("id", orderId)
      .single()

    if (fetchError || !currentOrder) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 })
    }

    const oldStatus = currentOrder.status as OrderStatus
    const oldPaymentStatus = currentOrder.payment_status as PaymentStatus

    // Don't update if nothing changed
    if ((!status || oldStatus === status) && (!payment_status || oldPaymentStatus === payment_status)) {
      return NextResponse.json({
        success: true,
        order: {
          id: orderId,
          ...(status ? { status } : {}),
          ...(payment_status ? { payment_status } : {}),
        },
        message: "Status unchanged",
      })
    }

    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }

    if (status) {
      updatePayload.status = status
      // If cancelling, set payment to failed if pending
      if (status === "cancelled" && currentOrder.payment_status === "pending") {
        updatePayload.payment_status = "failed"
      }
    }

    if (payment_status === "paid") {
      updatePayload.payment_status = "paid"
    }

    // Update the order
    const { data: updatedOrder, error: updateError } = await supabase
      .from("orders")
      .update(updatePayload)
      .eq("id", orderId)
      .select("*")
      .single()

    if (updateError) {
      return NextResponse.json(
        { error: "Failed to update order", details: updateError.message },
        { status: 500 }
      )
    }

    // Trigger WhatsApp workflow notifications (solo si cambió el status)
    let workflowResults: unknown[] = []
    if (status && oldStatus !== status) {
      try {
        workflowResults = await onOrderStatusChange(orderId, oldStatus, status as OrderStatus)
      } catch (workflowErr) {
        console.error("[API] Workflow error (non-blocking):", workflowErr)
      }
    }

    // Revertir la reserva del cupón si la orden se cancela.
    // El cupón incrementó used_count al crearse la orden; cancelarla
    // debe liberarlo para que otro pedido pueda usarlo.
    if (status === "cancelled" && oldStatus !== "cancelled" && currentOrder.coupon_code) {
      const { data: coupon } = await supabase
        .from("coupons")
        .select("id, used_count")
        .ilike("code", currentOrder.coupon_code)
        .maybeSingle()

      if (coupon && coupon.used_count > 0) {
        await supabase
          .from("coupons")
          .update({ used_count: coupon.used_count - 1 })
          .eq("id", coupon.id)
          .eq("used_count", coupon.used_count)
      }
    }

    return NextResponse.json({
      success: true,
      order: updatedOrder,
      workflow: workflowResults,
    })
  } catch (err) {
    console.error("[API] Error updating order status:", err)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
