import { logger } from "@/lib/logger"
/**
 * POST /api/workflows/trigger
 * GET  /api/workflows/trigger?job=abandoned-cart|reactivation
 *
 * POST — manually trigger a workflow for an order or user onboarding.
 * GET  — cron endpoint for email jobs (abandoned cart recovery, reactivation).
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

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization")
    const cronSecret = process.env.CRON_SECRET
    // Fail closed: sin CRON_SECRET configurado el endpoint no se expone.
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const job = req.nextUrl.searchParams.get("job")

    if (job === "abandoned-cart") {
      const { checkAbandonedCarts } = await import("@/lib/email-workflows")
      const result = await checkAbandonedCarts()
      return NextResponse.json(result)
    }

    if (job === "reactivation") {
      const { checkInactiveUsers } = await import("@/lib/email-workflows")
      const result = await checkInactiveUsers()
      return NextResponse.json(result)
    }

    return NextResponse.json(
      { error: "Missing or invalid job param. Use ?job=abandoned-cart or ?job=reactivation" },
      { status: 400 }
    )
  } catch (err) {
    logger.error("[CRON-EMAIL] Fatal error:", err)
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { orderId, workflowType, workflow_type, user_id, email, full_name, fulfillmentStatus } = body

    // Handle onboarding workflow (triggered on registration)
    const resolvedType = workflowType || workflow_type
    if (resolvedType === "onboarding" || resolvedType === "referral") {
      // Auto-servicio: el usuario debe estar autenticado y solo puede
      // disparar workflows para su PROPIO user_id (evita spam/IDOR).
      const { getCurrentUser } = await import("@/lib/auth")
      const user = await getCurrentUser()
      if (!user || user.id !== user_id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      }

      if (resolvedType === "onboarding") {
        return await handleOnboarding(user_id, email, full_name)
      }
      return await handleReferral(user_id, email, full_name, body.referral_code)
    }

    // El resto de workflows envían WhatsApp a clientes: solo admins.
    const { requireAdmin } = await import("@/lib/admin-auth")
    const { response: adminDenied } = await requireAdmin()
    if (adminDenied) {
      return adminDenied
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
    logger.error("[API] Error triggering workflow:", err)
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
    logger.error("[API] Onboarding workflow error:", err)
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

/**
 * Handle referral code application — links a new user to their referrer.
 * Called during registration when a referral code is provided.
 *
 * Un código `RESU-…` puede ser de dos tipos:
 *  1. Código de prospecto de vendedor (`crm_prospects.referral_code`, link de
 *     registro de Comercialización) → se vincula la cuenta al prospecto y el
 *     prospecto pasa a `cliente_activo`.
 *  2. Código de referido de perfil (`profiles.referral_code`, programa
 *     "Invitar amigos") → flujo actual de referidos.
 * Como ambos comparten prefijo, se busca SIEMPRE primero en `crm_prospects`.
 */
async function handleReferral(
  userId: string,
  email: string,
  fullName: string,
  referralCode: string
): Promise<NextResponse> {
  if (!userId || !referralCode) {
    return NextResponse.json(
      { error: "user_id and referral_code are required" },
      { status: 400 }
    )
  }

  try {
    const supabase = await createServiceClient()
    const code = String(referralCode).toUpperCase().trim()

    // 1) Código de prospecto de vendedor (link de registro de Comercialización)
    const { data: prospect } = await supabase
      .from("crm_prospects")
      .select("id, seller_id, referral_code, user_id, name")
      .eq("referral_code", code)
      .single()

    if (prospect) {
      if (prospect.user_id && prospect.user_id !== userId) {
        return NextResponse.json(
          { error: "Este código ya está vinculado a otra cuenta" },
          { status: 400 }
        )
      }

      // Vincular la cuenta al prospecto y marcarlo como cliente activo
      const { error: updateError } = await supabase
        .from("crm_prospects")
        .update({ user_id: userId, status: "cliente_activo", last_contact_at: new Date().toISOString() })
        .eq("id", prospect.id)

      if (updateError) throw updateError

      // Notificar al vendedor por WhatsApp
      try {
        const { data: seller } = await supabase
          .from("profiles")
          .select("phone, full_name")
          .eq("id", prospect.seller_id)
          .single()

        if (seller?.phone) {
          const { sendTextMessage } = await import("@/lib/whatsapp")
          await sendTextMessage({
            to: seller.phone,
            text: `🎉 ¡Nuevo cliente vinculado!\n\n${fullName || email} se registró con tu link de ${
              prospect.name || "prospecto"
            }.\n\nYa puede recibir pedidos asistidos desde Comercialización. 📦`,
          })
        }
      } catch {
        // Silent fail
      }

      return NextResponse.json({
        success: true,
        workflow_type: "referral",
        user_id: userId,
        prospect_id: prospect.id,
      })
    }

    // 2) Código de referido de perfil (programa "Invitar amigos")
    // Buscar al referidor por su código
    const { data: referrer } = await supabase
      .from("profiles")
      .select("id, referral_code, full_name")
      .eq("referral_code", code)
      .single()

    if (!referrer) {
      return NextResponse.json({ error: "Código de referido inválido" }, { status: 404 })
    }

    if (referrer.id === userId) {
      return NextResponse.json(
        { error: "No puedes usar tu propio código de referido" },
        { status: 400 }
      )
    }

    // Verificar que no tenga ya referidor
    const { data: currentProfile } = await supabase
      .from("profiles")
      .select("referred_by")
      .eq("id", userId)
      .single()

    if (currentProfile?.referred_by) {
      return NextResponse.json(
        { message: "Ya tienes un referidor — todo bien" },
        { status: 200 }
      )
    }

    // Asignar referidor
    const { error } = await supabase
      .from("profiles")
      .update({ referred_by: referrer.id })
      .eq("id", userId)

    if (error) throw error

    // Notificar al referidor por WhatsApp
    try {
      const { data: referrerProfile } = await supabase
        .from("profiles")
        .select("phone")
        .eq("id", referrer.id)
        .single()

      if (referrerProfile?.phone) {
        const { sendTextMessage } = await import("@/lib/whatsapp")
        await sendTextMessage({
          to: referrerProfile.phone,
          text: `🎉 ¡${referrer.full_name || "Alguien"} usó tu código de referido!\n\n${
            fullName || email
          } se registró con tu código *${referrer.referral_code}*.\n\nCuando haga su primera compra, recibirás $100 Créditos Resurte. 💰`,
        })
      }
    } catch {
      // Silent fail
    }

    return NextResponse.json({
      success: true,
      workflow_type: "referral",
      user_id: userId,
      referrer_id: referrer.id,
    })
  } catch (err) {
    logger.error("[API] Referral error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
