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

export async function POST(req: NextRequest) {
  try {
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

    // If no explicit recipients, TODO: fetch them from Supabase by city_slug
    let targetRecipients: string[] = recipients || []

    if (city_slug && !recipients) {
      // TODO: Query profiles + whatsapp_messages for all users in city
      targetRecipients = []
    }

    if (targetRecipients.length === 0) {
      return NextResponse.json(
        { error: "No recipients found" },
        { status: 400 }
      )
    }

    // TODO: Verify admin authentication
    // TODO: Check template approved status

    const result = await sendBroadcast({
      recipients: targetRecipients,
      templateName: template_name,
      languageCode: language_code || "es_MX",
      components,
    })

    // TODO: Log broadcast to Supabase

    return NextResponse.json({
      success: true,
      city: city_slug || "all",
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
