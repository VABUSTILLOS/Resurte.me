/**
 * WhatsApp Send Template API
 * POST /api/whatsapp/send-template
 * 
 * Sends a pre-approved WhatsApp message template to a recipient.
 * Used by automations, broadcast, and manual admin triggers.
 * 
 * Body: { to, template_name, language_code?, components? }
 */

import { NextRequest, NextResponse } from "next/server"
import { sendTemplate } from "@/lib/whatsapp"
import { createServiceClient } from "@/lib/supabase/service"
import { requireAdmin } from "@/lib/admin-auth"
import type { WhatsAppMessage, WhatsAppTemplate, WhatsAppTemplateStatus } from "@/types"

export async function POST(req: NextRequest) {
  try {
    // Solo administradores pueden enviar templates de WhatsApp (evita spam/abuso).
    const { response: adminDenied } = await requireAdmin()
    if (adminDenied) {
      return adminDenied
    }

    const body = await req.json()

    const { to, template_name, language_code, components } = body

    if (!to || !template_name) {
      return NextResponse.json(
        { error: "to and template_name are required" },
        { status: 400 }
      )
    }

    // Verificar que el template existe y está aprobado antes de enviarlo.
    const supabase = await createServiceClient()
    const { data: template, error: templateError } = await supabase
      .from("whatsapp_templates")
      .select("template_name, status")
      .eq("template_name", template_name)
      .maybeSingle<Pick<WhatsAppTemplate, "template_name" | "status">>()

    if (templateError) {
      console.error("WhatsApp template lookup error:", templateError)
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

    const status: WhatsAppTemplateStatus = template.status
    if (status !== "approved") {
      return NextResponse.json(
        { error: `Template "${template.template_name}" is not approved (status: ${status})` },
        { status: 400 }
      )
    }

    const result = await sendTemplate({
      to,
      templateName: template_name,
      languageCode: language_code || "es_MX",
      components,
    })

    // Registrar el envío en whatsapp_messages (log de auditoría).
    const messageLog: Pick<
      WhatsAppMessage,
      "from_number" | "message_type" | "content" | "direction"
    > = {
      from_number: to,
      message_type: `template:${template_name}`,
      content: JSON.stringify({
        template_name,
        language_code: language_code || "es_MX",
        message_id: result.messages[0]?.id || null,
        components: components || [],
      }),
      direction: "outbound",
    }
    try {
      await supabase.from("whatsapp_messages").insert(messageLog)
    } catch (logErr) {
      // El log no debe romper el envío ya realizado.
      console.error("Failed to log whatsapp template message:", logErr)
    }

    return NextResponse.json({
      success: true,
      message_id: result.messages[0]?.id,
    })
  } catch (err) {
    console.error("WhatsApp send template error:", err)
    return NextResponse.json(
      {
        error: "Failed to send template",
        detail: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 }
    )
  }
}
