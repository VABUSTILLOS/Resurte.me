/**
 * PATCH /api/orders/[id]/status
 * 
 * Updates an order's status and triggers WhatsApp workflow notifications.
 * Used by the admin panel when changing order status.
 * 
 * Body: { status: OrderStatus }
 * Authentication: Requires service role (admin only)
 */

import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/service"
import { onOrderStatusChange } from "@/lib/workflows"
import type { OrderStatus } from "@/types"

const VALID_STATUSES: OrderStatus[] = [
  "pending", "confirmed", "preparing", "out_for_delivery", "delivered", "cancelled",
]

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const orderId = parseInt(id, 10)

    if (isNaN(orderId)) {
      return NextResponse.json({ error: "Invalid order ID" }, { status: 400 })
    }

    const body = await req.json()
    const { status } = body

    if (!status || !VALID_STATUSES.includes(status)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}` },
        { status: 400 }
      )
    }

    const supabase = await createServiceClient()

    // Fetch current order to get old status
    const { data: currentOrder, error: fetchError } = await supabase
      .from("orders")
      .select("status, payment_status, customer_phone")
      .eq("id", orderId)
      .single()

    if (fetchError || !currentOrder) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 })
    }

    const oldStatus = currentOrder.status as OrderStatus

    // Don't update if status hasn't changed
    if (oldStatus === status) {
      return NextResponse.json({
        success: true,
        order: { id: orderId, status },
        message: "Status unchanged",
      })
    }

    // Update the order status
    const { data: updatedOrder, error: updateError } = await supabase
      .from("orders")
      .update({
        status,
        updated_at: new Date().toISOString(),
        // If cancelling, set payment to failed if pending
        ...(status === "cancelled" && currentOrder.payment_status === "pending"
          ? { payment_status: "failed" }
          : {}),
      })
      .eq("id", orderId)
      .select("*")
      .single()

    if (updateError) {
      return NextResponse.json(
        { error: "Failed to update order", details: updateError.message },
        { status: 500 }
      )
    }

    // Trigger WhatsApp workflow notifications
    let workflowResults: unknown[] = []
    try {
      workflowResults = await onOrderStatusChange(orderId, oldStatus, status as OrderStatus)
    } catch (workflowErr) {
      console.error("[API] Workflow error (non-blocking):", workflowErr)
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
