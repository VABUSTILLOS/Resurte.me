import { logger } from "@/lib/logger"
/**
 * GET /api/workflows/payment-reminders
 * 
 * CRON endpoint: Check all pending-payment orders and send reminders.
 * Called by Vercel Cron every hour.
 * 
 * Vercel Cron config:
 *   vercel.json → "crons": [{ "path": "/api/workflows/payment-reminders", "schedule": "0 * * * *" }]
 * 
 * Protected by CRON_SECRET header.
 */

import { NextRequest, NextResponse } from "next/server"
import { checkAndSendPaymentReminders } from "@/lib/workflows"

export async function GET(req: NextRequest) {
  try {
    // Protect with CRON secret (fail closed: sin secreto no se expone)
    const authHeader = req.headers.get("authorization")
    const cronSecret = process.env.CRON_SECRET

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const result = await checkAndSendPaymentReminders()

    return NextResponse.json({
      success: true,
      ...result,
    })
  } catch (err) {
    logger.error("[CRON] Payment reminder error:", err)
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Internal error",
      },
      { status: 500 }
    )
  }
}
