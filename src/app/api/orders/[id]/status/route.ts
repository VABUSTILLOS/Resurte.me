import { logger } from "@/lib/logger"
/**
 * PATCH /api/orders/[id]/status
 * 
 * Updates an order's status and triggers WhatsApp workflow notifications.
 * Used by the admin panel when changing order status.
 * 
 * Body: { status?: OrderStatus, payment_status?: PaymentStatus, driver_id?: number | null }
 *   - status: nuevo estado del pedido (opcional).
 *   - payment_status: confirmación manual de pago para métodos sin cobro
 *     en línea (COD, SPEI, OXXO, Mercado Pago). El único valor permitido
 *     aquí es "paid"; al aplicarlo, el trigger trg_credit_cashback_on_payment
 *     abona el cashback a la wallet del usuario.
 *   - driver_id: repartidor asignado (delivery_drivers, migración 00076);
 *     null explícito lo desasigna. Se valida que exista y esté activo.
 * Authentication: Requires service role (admin only)
 */

import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/service"
import { requireAdmin } from "@/lib/admin-auth"
import { logAdminAction } from "@/lib/audit"
import { onOrderStatusChange } from "@/lib/workflows"
import { notifyUser } from "@/lib/notifications"
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
    const { user: adminUser, response: adminDenied } = await requireAdmin()
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
    // driver_id: undefined = no tocar; null = desasignar; número = asignar.
    const hasDriverField = "driver_id" in body
    const driverId: number | null | undefined = hasDriverField
      ? body.driver_id === null
        ? null
        : Number(body.driver_id)
      : undefined

    // Se requiere al menos uno de los campos
    if (!status && !payment_status && !hasDriverField) {
      return NextResponse.json(
        { error: "Se requiere status, payment_status o driver_id" },
        { status: 400 }
      )
    }

    if (
      hasDriverField &&
      driverId !== null &&
      driverId !== undefined &&
      (!Number.isInteger(driverId) || driverId <= 0)
    ) {
      return NextResponse.json({ error: "driver_id inválido" }, { status: 400 })
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
    if (
      (!status || oldStatus === status) &&
      (!payment_status || oldPaymentStatus === payment_status) &&
      !hasDriverField
    ) {
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

    // Validar el repartidor (existencia + activo) antes de asignar.
    if (hasDriverField && driverId !== null && driverId !== undefined) {
      const { data: driver } = await supabase
        .from("delivery_drivers")
        .select("id, is_active")
        .eq("id", driverId)
        .maybeSingle()
      if (!driver) {
        return NextResponse.json({ error: "Repartidor no encontrado" }, { status: 404 })
      }
      if (!driver.is_active) {
        return NextResponse.json({ error: "El repartidor está inactivo" }, { status: 400 })
      }
    }

    const updatePayload = {
      updated_at: new Date().toISOString(),
      ...(status ? { status } : {}),
      // If cancelling, set payment to failed if pending
      ...(status === "cancelled" && currentOrder.payment_status === "pending" ? { payment_status: "failed" as const } : {}),
      ...(payment_status === "paid" ? { payment_status: "paid" as const } : {}),
      ...(hasDriverField ? { driver_id: driverId ?? null } : {}),
    }

    // Update the order
    const { data: updatedOrder, error: updateError } = await supabase
      .from("orders")
      .update(updatePayload)
      .eq("id", orderId)
      .select("*")
      .single()

    if (updateError) {
      // 42703 = columna driver_id inexistente (migración 00076 sin aplicar)
      if (updateError.code === "42703" && hasDriverField) {
        return NextResponse.json(
          { error: "La asignación de repartidor requiere aplicar la migración 00076" },
          { status: 409 }
        )
      }
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
        logger.error("[API] Workflow error (non-blocking):", workflowErr)
      }
    }

    // Cashback abonado (trigger trg_credit_cashback_on_payment): notificar
    // al usuario en su campana persistente.
    if (
      payment_status === "paid" &&
      oldPaymentStatus !== "paid" &&
      updatedOrder.user_id &&
      Number(updatedOrder.cashback_credits ?? 0) > 0
    ) {
      void notifyUser({
        userId: updatedOrder.user_id,
        type: "cashback_credited",
        title: `Cashback abonado: +$${Number(updatedOrder.cashback_credits).toFixed(2)}`,
        body: `Pedido #${orderId}${updatedOrder.cashback_tier ? ` · Nivel ${updatedOrder.cashback_tier}` : ""} — ya está en tu monedero`,
        actionUrl: "/recompensas",
        orderId,
      })
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

    // Bitácora admin (best-effort): qué cambió y quién lo cambió.
    if (adminUser) {
      if (status && oldStatus !== status) {
        void logAdminAction({
          actorId: adminUser.id,
          action: "order_status_changed",
          orderId,
          detail: `${oldStatus} → ${status}`,
        })
      }
      if (payment_status === "paid" && oldPaymentStatus !== "paid") {
        void logAdminAction({
          actorId: adminUser.id,
          action: "order_payment_confirmed",
          orderId,
          detail: `${oldPaymentStatus} → paid`,
        })
      }
      if (hasDriverField) {
        void logAdminAction({
          actorId: adminUser.id,
          action: driverId ? "order_driver_assigned" : "order_driver_unassigned",
          orderId,
          detail: driverId ? `driver_id=${driverId}` : "driver_id=null",
        })
      }
    }

    return NextResponse.json({
      success: true,
      order: updatedOrder,
      workflow: workflowResults,
    })
  } catch (err) {
    logger.error("[API] Error updating order status:", err)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
