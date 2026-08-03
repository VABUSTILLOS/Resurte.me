/**
 * WhatsApp Automations API
 * GET  /api/whatsapp/automations — List all automations
 * POST /api/whatsapp/automations — Create/update an automation
 * 
 * Manages WhatsApp message automations:
 * - Payment recovery (1h, 24h, 48h)
 * - Cart abandonment (2h)
 * - Birthday reminders (10 AM on birthday)
 * - Customer reactivation (30 days inactive)
 * - Post-delivery rating (24h after delivery)
 * - Onboarding coupon (after first order)
 */

import { NextRequest, NextResponse } from "next/server"
import { AUTOMATION_TEMPLATE_MAP } from "@/lib/whatsapp"
import type { AutomationType } from "@/types"

// ============================================================
// Mock automations store (TODO: Supabase)
// ============================================================

const MOCK_AUTOMATIONS = [
  {
    id: 1,
    store_id: 1,
    automation_type: "payment_recovery" as AutomationType,
    trigger_delay_hours: 1,
    template_id: 1,
    is_active: true,
    config: { levels: [1, 24, 48], discount_code: null },
  },
  {
    id: 2,
    store_id: 1,
    automation_type: "cart_abandonment" as AutomationType,
    trigger_delay_hours: 2,
    template_id: 2,
    is_active: true,
    config: { discount_code: null },
  },
  {
    id: 3,
    store_id: 1,
    automation_type: "birthday" as AutomationType,
    trigger_delay_hours: 0,
    template_id: 3,
    is_active: false,
    config: { discount_percent: 15, coupon_code: "CUMPLE15", send_at_hour: 10 },
  },
  {
    id: 4,
    store_id: 1,
    automation_type: "reactivation" as AutomationType,
    trigger_delay_hours: 720,
    template_id: 4,
    is_active: false,
    config: { inactive_days: 30, discount_amount: 50, coupon_code: "TEAMO50" },
  },
  {
    id: 5,
    store_id: 1,
    automation_type: "post_delivery_rating" as AutomationType,
    trigger_delay_hours: 24,
    template_id: 5,
    is_active: true,
    config: { rating_link: "https://resurte.me/calificar" },
  },
  {
    id: 6,
    store_id: 1,
    automation_type: "onboarding" as AutomationType,
    trigger_delay_hours: 0,
    template_id: 6,
    is_active: true,
    config: { discount_percent: 10, coupon_code: "BIENVENIDO10" },
  },
]

// ============================================================
// GET — List automations
// ============================================================

export async function GET(req: NextRequest) {
  const storeId = req.nextUrl.searchParams.get("store_id")

  let automations = MOCK_AUTOMATIONS
  if (storeId) {
    automations = automations.filter((a) => a.store_id === Number(storeId))
  }

  return NextResponse.json({
    automations: automations.map((a) => ({
      ...a,
      template_name: AUTOMATION_TEMPLATE_MAP[a.automation_type]?.name || "unknown",
    })),
  })
}

// ============================================================
// POST — Create/update automation
// ============================================================

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    const { store_id, automation_type, trigger_delay_hours, is_active, config } = body

    if (!store_id || !automation_type) {
      return NextResponse.json(
        { error: "store_id and automation_type are required" },
        { status: 400 }
      )
    }

    // TODO: Verify admin authentication
    // TODO: Upsert in Supabase whatsapp_automations table

    return NextResponse.json({
      success: true,
      automation: {
        id: Date.now(),
        store_id,
        automation_type,
        trigger_delay_hours: trigger_delay_hours || 0,
        is_active: is_active ?? true,
        config: config || {},
      },
    })
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to save automation", detail: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    )
  }
}
