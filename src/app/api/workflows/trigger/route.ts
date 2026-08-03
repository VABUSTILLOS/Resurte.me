/**
 * POST /api/workflows/trigger
 * 
 * Manually trigger a workflow for an order.
 * Used by the admin panel for manual workflow execution.
 * 
 * Body: { orderId: number, workflowType: WorkflowType }
 */

import { NextRequest, NextResponse } from "next/server"
import {
  notifyStaffNewOrder,
  confirmOrderToCustomer,
  notifyCustomerStatusUpdate,
  sendPaymentReminder,
  confirmPaymentToCustomer,
  notifyFulfillmentUpdate,
  type WorkflowType,
} from "@/lib/workflows"
import { createServiceClient } from "@/lib/supabase/service"

const VALID_WORKFLOWS: WorkflowType[] = [
  "new_order_staff",
  "new_order_customer",
  "status_update",
  "payment_reminder",
  "payment_confirmed",
  "fulfillment_update",
]

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { orderId, workflowType, fulfillmentStatus } = body

    if (!orderId || !workflowType) {
      return NextResponse.json(
        { error: "orderId and workflowType are required" },
        { status: 400 }
      )
    }

    if (!VALID_WORKFLOWS.includes(workflowType)) {
      return NextResponse.json(
        { error: `Invalid workflowType. Must be one of: ${VALID_WORKFLOWS.join(", ")}` },
        { status: 400 }
      )
    }

    // Verify order exists
    const supabase = await createServiceClient()
    const { data: order, error: fetchError } = await supabase
      .from("orders")
      .select("id, status, customer_phone")
      .eq("id", orderId)
      .single()

    if (fetchError || !order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 })
    }

    let result

    switch (workflowType as WorkflowType) {
      case "new_order_staff":
        result = await notifyStaffNewOrder(orderId)
        break

      case "new_order_customer":
        result = await confirmOrderToCustomer(orderId)
        break

      case "status_update":
        result = await notifyCustomerStatusUpdate(orderId, (order as any).status)
        break

      case "payment_reminder":
        result = await sendPaymentReminder(orderId)
        break

      case "payment_confirmed":
        result = await confirmPaymentToCustomer(orderId)
        break

      case "fulfillment_update":
        if (!fulfillmentStatus) {
          return NextResponse.json(
            { error: "fulfillmentStatus is required for fulfillment_update workflow" },
            { status: 400 }
          )
        }
        result = await notifyFulfillmentUpdate(orderId, fulfillmentStatus)
        break

      default:
        return NextResponse.json({ error: "Unknown workflow type" }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      workflow_type: workflowType,
      order_id: orderId,
      result,
    })
  } catch (err) {
    console.error("[API] Error triggering workflow:", err)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
