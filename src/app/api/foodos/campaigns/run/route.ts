/**
 * GET /api/foodos/campaigns/run
 *
 * Cron diario (Vercel) que ejecuta las campañas FoodOS programadas
 * cuya fecha ya venció: envía los mensajes de WhatsApp a los
 * clientes objetivo y marca cada campaña como sent | failed.
 *
 * Protegido con el header Authorization: ******
 */

import { NextRequest, NextResponse } from "next/server"
import { runDueFoodosCampaigns } from "@/lib/foodos-campaigns"

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization")
    const cronSecret = process.env.CRON_SECRET
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const result = await runDueFoodosCampaigns()
    return NextResponse.json({ success: true, ...result })
  } catch (err) {
    console.error("[FOODOS-CAMPAIGNS] Fatal error:", err)
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Internal error",
      },
      { status: 500 }
    )
  }
}
