import { NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/service"
import { requireAdmin } from "@/lib/admin-auth"
import { logger } from "@/lib/logger"

export const runtime = "nodejs"

/**
 * GET /api/admin/email-logs — bitácora de emails transaccionales y de
 * marketing (email_logs): confirmaciones de pedido, hitos logísticos,
 * carrito abandonado, reactivación. Solo admin.
 */
export async function GET() {
  try {
    const { response: adminDenied } = await requireAdmin()
    if (adminDenied) return adminDenied

    const supabase = await createServiceClient()
    const { data, error } = await supabase
      .from("email_logs")
      .select("id, email_to, email_type, order_id, sent_at, status, error")
      .order("sent_at", { ascending: false })
      .limit(200)

    if (error) {
      logger.error("[ADMIN EMAIL-LOGS] list error:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ logs: data ?? [] })
  } catch (err) {
    logger.error("[ADMIN EMAIL-LOGS] unexpected:", err)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
