import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/service"
import { logger } from "@/lib/logger"

/**
 * GET /api/cron/cleanup-guest-addresses
 *
 * CRON endpoint: borra direcciones anónimas huérfanas (guest_token
 * sin user_id) más viejas de `days` (default 30). Llama al RPC
 * cleanup_orphan_guest_addresses(days).
 *
 * Vercel Cron config (opcional — no añadido a vercel.json para no
 * consumir el plan gratuito sin necesidad):
 *   vercel.json → "crons": [{ "path": "/api/cron/cleanup-guest-addresses", "schedule": "0 4 * * *" }]
 *
 * Protected by CRON_SECRET header (fail closed).
 */

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization")
    const cronSecret = process.env.CRON_SECRET

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const daysParam = req.nextUrl.searchParams.get("days")
    const days = daysParam ? parseInt(daysParam, 10) : 30
    if (Number.isNaN(days) || days < 1 || days > 3650) {
      return NextResponse.json({ error: "days must be between 1 and 3650" }, { status: 400 })
    }

    const supabase = await createServiceClient()
    const { data, error } = await supabase.rpc("cleanup_orphan_guest_addresses", {
      p_days: days,
    })

    if (error) {
      logger.error("[CRON] Guest address cleanup failed:", error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      deleted: data ?? 0,
      days,
    })
  } catch (err) {
    logger.error("[CRON] Guest address cleanup error:", err)
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Internal error",
      },
      { status: 500 }
    )
  }
}
