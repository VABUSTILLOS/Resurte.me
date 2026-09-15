import { NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/service"
import { requireAdmin } from "@/lib/admin-auth"
import { logger } from "@/lib/logger"

export const runtime = "nodejs"

export interface AuditLogEntry {
  id: number
  title: string
  body: string | null
  action_url: string | null
  created_at: string
}

/**
 * GET /api/admin/audit-log — feed de la bitácora administrativa.
 *
 * Devuelve las últimas 20 acciones admin registradas (type = 'admin_audit'
 * en notifications) para el admin autenticado. Solo administradores.
 */
export async function GET() {
  try {
    const { user, response } = await requireAdmin()
    if (response || !user) return response ?? NextResponse.json({ error: "No autenticado" }, { status: 401 })

    const supabase = await createServiceClient()
    const { data, error } = await supabase
      .from("notifications")
      .select("id, title, body, action_url, created_at")
      .eq("type", "admin_audit")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20)

    if (error) {
      logger.error("[AUDIT] feed error:", error)
      return NextResponse.json({ error: "No se pudo cargar la bitácora" }, { status: 500 })
    }

    return NextResponse.json(
      { entries: (data ?? []) as AuditLogEntry[] },
      { headers: { "Cache-Control": "no-store" } }
    )
  } catch (err) {
    logger.error("[AUDIT] feed unexpected:", err)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
