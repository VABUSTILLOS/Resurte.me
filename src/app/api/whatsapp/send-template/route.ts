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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    const { to, template_name, language_code, components } = body

    if (!to || !template_name) {
      return NextResponse.json(
        { error: "to and template_name are required" },
        { status: 400 }
      )
    }

    // TODO: Verify admin authentication
    // TODO: Check template exists and is approved in Supabase

    const result = await sendTemplate({
      to,
      templateName: template_name,
      languageCode: language_code || "es_MX",
      components,
    })

    // TODO: Log message to whatsapp_messages table in Supabase

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
