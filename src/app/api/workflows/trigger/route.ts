/**
 * POST /api/workflows/trigger
 * 
 * Manually trigger a workflow for an order or user onboarding.
 * Used by the admin panel for manual workflow execution and auth flow.
 * 
 * Body (order workflows): { orderId: number, workflowType: WorkflowType }
 * Body (onboarding): { workflow_type: "onboarding", user_id: string, email: string, full_name: string }
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
    const { orderId, workflowType, workflow_type, user_id, email, full_name, fulfillmentStatus } = body

    // Handle onboarding workflow (triggered on registration)
    const resolvedType = workflowType || workflow_type
    if (resolvedType === "onboarding") {
      return await handleOnboarding(user_id, email, full_name)
    }

    if (!orderId || !resolvedType) {
      return NextResponse.json(
        { error: "orderId and workflowType are required" },
        { status: 400 }
      )
    }

    if (!VALID_WORKFLOWS.includes(resolvedType)) {
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

    switch (resolvedType as WorkflowType) {
      case "new_order_staff":
        result = await notifyStaffNewOrder(orderId)
        break

      case "new_order_customer":
        result = await confirmOrderToCustomer(orderId)
        break

      case "status_update":
        result = await notifyCustomerStatusUpdate(orderId, order.status)
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
      workflow_type: resolvedType,
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

/**
 * Handle onboarding workflow — triggered when a new user registers.
 * Sends a welcome WhatsApp message with a 10% first-order coupon
 * if the user has a phone number on file.
 */
async function handleOnboarding(
  userId: string,
  email: string,
  fullName: string
): Promise<NextResponse> {
  if (!userId) {
    return NextResponse.json({ error: "user_id is required for onboarding" }, { status: 400 })
  }

  try {
    const supabase = await createServiceClient()

    // Look up user's phone from profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("phone, full_name")
      .eq("id", userId)
      .single()

    // If user has a phone, send onboarding WhatsApp message
    if (profile?.phone) {
      const { sendTextMessage } = await import("@/lib/whatsapp")
      await sendTextMessage({
        to: profile.phone,
        text: `¡${profile.full_name || fullName || "Bienvenid@"} a Resurte.me! 🎉\n\nGracias por registrarte. Usa el código *BIENVENIDO10* en tu primer pedido para recibir 10% de descuento.\n\nExplora nuestro catálogo: https://resurte.me`,
      })
    }

    // Log onboarding event to workflow logs
    await supabase.from("whatsapp_messages").insert({
      store_id: 1,
      from_number: profile?.phone || "N/A",
      message_type: "workflow:onboarding",
      content: JSON.stringify({
        user_id: userId,
        email,
        full_name: fullName || profile?.full_name,
        status: profile?.phone ? "sent" : "skipped_no_phone",
      }),
      direction: "outbound",
    })

    return NextResponse.json({
      success: true,
      workflow_type: "onboarding",
      user_id: userId,
      message_sent: !!profile?.phone,
    })
  } catch (err) {
    console.error("[API] Onboarding workflow error:", err)
    // Don't block registration on workflow failure
    return NextResponse.json({
      success: true,
      workflow_type: "onboarding",
      user_id: userId,
      message_sent: false,
      error: err instanceof Error ? err.message : "Unknown error",
    })
  }
}
