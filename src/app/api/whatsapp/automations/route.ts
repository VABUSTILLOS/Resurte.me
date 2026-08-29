import { logger } from "@/lib/logger"
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
import { requireAdmin } from "@/lib/admin-auth"
import { createServiceClient } from "@/lib/supabase/service"
import type { WhatsAppAutomation, AutomationType } from "@/types"

// ============================================================
// Defaults (semilla). Se insertan solo si la tabla está vacía,
// para que el panel funcione sin requerir migración manual.
// ============================================================

const DEFAULT_AUTOMATIONS: Array<Omit<WhatsAppAutomation, "id" | "template_id"> & { template_id: number | null }> = [
  {
    automation_type: "payment_recovery",
    trigger_delay_hours: 1,
    template_id: null,
    is_active: true,
    config: { levels: [1, 24, 48], discount_code: null },
  },
  {
    automation_type: "cart_abandonment",
    trigger_delay_hours: 2,
    template_id: null,
    is_active: true,
    config: { discount_code: null },
  },
  {
    automation_type: "birthday",
    trigger_delay_hours: 0,
    template_id: null,
    is_active: false,
    config: { discount_percent: 15, coupon_code: "CUMPLE15", send_at_hour: 10 },
  },
  {
    automation_type: "reactivation",
    trigger_delay_hours: 720,
    template_id: null,
    is_active: false,
    config: { inactive_days: 30, discount_amount: 50, coupon_code: "TEAMO50" },
  },
  {
    automation_type: "post_delivery_rating",
    trigger_delay_hours: 24,
    template_id: null,
    is_active: true,
    config: { rating_link: "https://resurte.me/calificar" },
  },
  {
    automation_type: "onboarding",
    trigger_delay_hours: 0,
    template_id: null,
    is_active: true,
    config: { discount_percent: 10, coupon_code: "BIENVENIDO10" },
  },
]

// ============================================================
// GET — List automations
// ============================================================

export async function GET() {
  // Solo administradores pueden consultar las automatizaciones.
  const { response: adminDenied } = await requireAdmin()
  if (adminDenied) {
    return adminDenied
  }

  const supabase = await createServiceClient()

  // Primera visita: sembrar defaults si la tabla está vacía.
  const { count, error: countError } = await supabase
    .from("whatsapp_automations")
    .select("id", { count: "exact", head: true })

  if (countError) {
    logger.error("WhatsApp automations count error:", countError)
    return NextResponse.json(
      { error: "Failed to load automations" },
      { status: 500 }
    )
  }

  if (count === 0) {
    const { error: seedError } = await supabase
      .from("whatsapp_automations")
      .insert(DEFAULT_AUTOMATIONS)
    if (seedError) {
      logger.error("WhatsApp automations seed error:", seedError)
      return NextResponse.json(
        { error: "Failed to initialize automations" },
        { status: 500 }
      )
    }
  }

  const { data, error } = await supabase
    .from("whatsapp_automations")
    .select("*")
    .order("id", { ascending: true })

  if (error) {
    logger.error("WhatsApp automations load error:", error)
    return NextResponse.json(
      { error: "Failed to load automations" },
      { status: 500 }
    )
  }

  const automations = (data || []) as WhatsAppAutomation[]

  // Nombre real de la plantilla asignada (si template_id resuelve a una
  // fila de whatsapp_templates); fallback al nombre del mapa por defecto.
  const templateIds = automations.map((a) => a.template_id).filter((id): id is number => id != null)
  const templateNames = new Map<number, string>()
  if (templateIds.length > 0) {
    const { data: templates } = await supabase
      .from("whatsapp_templates")
      .select("id, template_name")
      .in("id", templateIds)
    for (const t of (templates || []) as Array<{ id: number; template_name: string }>) {
      templateNames.set(t.id, t.template_name)
    }
  }

  return NextResponse.json({
    automations: automations.map((a) => ({
      ...a,
      template_name:
        (a.template_id != null ? templateNames.get(a.template_id) : undefined) ||
        AUTOMATION_TEMPLATE_MAP[a.automation_type]?.name ||
        "unknown",
    })),
  })
}

// ============================================================
// POST — Create/update automation
// ============================================================

export async function POST(req: NextRequest) {
  try {
    // Solo administradores pueden crear/modificar automatizaciones.
    const { response: adminDenied } = await requireAdmin()
    if (adminDenied) {
      return adminDenied
    }

    const body = await req.json()

    const { automation_type, trigger_delay_hours, is_active, config, template_name } = body

    if (!automation_type) {
      return NextResponse.json(
        { error: "automation_type is required" },
        { status: 400 }
      )
    }

    const supabase = await createServiceClient()

    // Resolver template_id: si el cliente envía template_name, debe existir
    // en whatsapp_templates (registrada/aprobada en Meta). Si no se envía,
    // se usa el nombre por defecto del mapa de automatizaciones.
    const templateName =
      typeof template_name === "string" && template_name.trim()
        ? template_name.trim()
        : AUTOMATION_TEMPLATE_MAP[automation_type]?.name
    let templateId: number | null = null
    if (templateName) {
      const { data: tpl } = await supabase
        .from("whatsapp_templates")
        .select("id")
        .eq("template_name", templateName)
        .maybeSingle()
      templateId = (tpl as { id?: number } | null)?.id ?? null
      if (templateId === null && typeof template_name === "string" && template_name.trim()) {
        return NextResponse.json(
          { error: `Template "${templateName}" no está registrada en whatsapp_templates` },
          { status: 400 }
        )
      }
    }

    // Upsert por automation_type (único por tienda).
    const upsertPayload = {
      automation_type: automation_type as AutomationType,
      trigger_delay_hours: trigger_delay_hours || 0,
      template_id: templateId,
      is_active: is_active ?? true,
      config: config || {},
      updated_at: new Date().toISOString(),
    }

    const { data: existing } = await supabase
      .from("whatsapp_automations")
      .select("id")
      .eq("automation_type", automation_type)
      .maybeSingle()

    let savedId: number
    if (existing) {
      const { error: updateError } = await supabase
        .from("whatsapp_automations")
        .update(upsertPayload)
        .eq("id", existing.id as number)
      if (updateError) {
        logger.error("WhatsApp automations update error:", updateError)
        return NextResponse.json(
          { error: "Failed to update automation" },
          { status: 500 }
        )
      }
      savedId = existing.id as number
    } else {
      const { data: inserted, error: insertError } = await supabase
        .from("whatsapp_automations")
        .insert({ ...upsertPayload, created_at: new Date().toISOString() })
        .select("id")
        .single()
      if (insertError) {
        logger.error("WhatsApp automations insert error:", insertError)
        return NextResponse.json(
          { error: "Failed to create automation" },
          { status: 500 }
        )
      }
      savedId = (inserted as { id: number }).id
    }

    return NextResponse.json({
      success: true,
      automation: {
        id: savedId,
        automation_type,
        trigger_delay_hours: trigger_delay_hours || 0,
        template_id: templateId,
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
