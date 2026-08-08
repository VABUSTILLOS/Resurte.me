/**
 * WhatsApp Broadcast API
 * POST /api/whatsapp/broadcast
 * 
 * Sends a template message to multiple recipients — filtered by city.
 * Used for promotions, restock alerts, and event campaigns.
 * 
 * Body: { city_slug?, recipients, template_name, language_code?, components? }
 */

import { NextRequest, NextResponse } from "next/server"
import { sendBroadcast } from "@/lib/whatsapp"
import { MEXICO_CITIES } from "@/lib/cities"
import { requireAdmin } from "@/lib/admin-auth"
import { createServiceClient } from "@/lib/supabase/service"

export async function POST(req: NextRequest) {
  try {
    // Solo administradores pueden enviar broadcasts (evita spam/abuso masivo).
    const { response: adminDenied } = await requireAdmin()
    if (adminDenied) {
      return adminDenied
    }

    const body = await req.json()
    const { city_slug, recipients, template_name, language_code, components } = body

    if (!template_name) {
      return NextResponse.json(
        { error: "template_name is required" },
        { status: 400 }
      )
    }

    // Validate city if provided
    if (city_slug) {
      const city = MEXICO_CITIES.find((c) => c.slug === city_slug)
      if (!city) {
        return NextResponse.json(
          { error: `Invalid city: ${city_slug}` },
          { status: 400 }
        )
      }
    }

    // Verificar que el template existe y está aprobado antes de un envío masivo.
    const supabase = await createServiceClient()
    const { data: template, error: templateError } = await supabase
      .from("whatsapp_templates")
      .select("template_name, status")
      .eq("template_name", template_name)
      .maybeSingle()

    if (templateError) {
      console.error("WhatsApp broadcast template lookup error:", templateError)
      return NextResponse.json(
        { error: "Failed to verify template" },
        { status: 500 }
      )
    }
    if (!template) {
      return NextResponse.json(
        { error: `Template "${template_name}" does not exist` },
        { status: 404 }
      )
    }
    if (template.status !== "approved") {
      return NextResponse.json(
        { error: `Template "${template_name}" is not approved (status: ${template.status})` },
        { status: 400 }
      )
    }

    // Si no hay recipients explícitos, obtenerlos de Supabase filtrando
    // por ciudad (profiles con teléfono y consentimiento de marketing).
    let targetRecipients: string[] = recipients || []

    if (city_slug && (!recipients || recipients.length === 0)) {
      const { data: cityRow } = await supabase
        .from("cities")
        .select("id")
        .eq("slug", city_slug)
        .maybeSingle()

      if (cityRow) {
        const { data: profiles, error: profilesError } = await supabase
          .from("profiles")
          .select("phone")
          .eq("default_city_id", cityRow.id as number)
          .eq("marketing_consent", true)
          .not("phone", "is", null)

        if (profilesError) {
          console.error("WhatsApp broadcast recipients lookup error:", profilesError)
          return NextResponse.json(
            { error: "Failed to load recipients" },
            { status: 500 }
          )
        }

        targetRecipients = (profiles || [])
          .map((p) => (p as { phone: string }).phone)
          .filter(Boolean)
      } else {
        return NextResponse.json(
          { error: `City "${city_slug}" not found` },
          { status: 404 }
        )
      }
    }

    if (targetRecipients.length === 0) {
      return NextResponse.json(
        { error: "No recipients found" },
        { status: 400 }
      )
    }

    const result = await sendBroadcast({
      recipients: targetRecipients,
      templateName: template_name,
      languageCode: language_code || "es_MX",
      components,
    })

    // Log del broadcast en whatsapp_messages (auditoría). Usamos la misma
    // tabla que el resto del flujo para no añadir tablas innecesarias.
    try {
      const { error: logError } = await supabase.from("whatsapp_messages").insert({
        from_number: "system",
        message_type: `broadcast:${template_name}`,
        content: JSON.stringify({
          template_name,
          city_slug: city_slug || "all",
          recipients_count: targetRecipients.length,
          sent: result.sent,
          failed: result.failed,
          errors: result.errors.slice(0, 20),
          triggered_at: new Date().toISOString(),
        }),
        direction: "outbound",
      })
      if (logError) {
        console.error("WhatsApp broadcast log error:", logError)
      }
    } catch (logErr) {
      console.error("WhatsApp broadcast log unexpected error:", logErr)
    }

    return NextResponse.json({
      success: true,
      city: city_slug || "all",
      recipients: targetRecipients.length,
      sent: result.sent,
      failed: result.failed,
      errors: result.errors,
    })
  } catch (err) {
    console.error("WhatsApp broadcast error:", err)
    return NextResponse.json(
      {
        error: "Failed to send broadcast",
        detail: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 }
    )
  }
}
