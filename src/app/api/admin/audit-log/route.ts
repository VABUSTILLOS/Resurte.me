import { NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/service"
import { requireAdmin } from "@/lib/admin-auth"
import { AUDIT_ACTION_LABEL, type AuditAction } from "@/lib/audit-log"
import { logger } from "@/lib/logger"

export const runtime = "nodejs"

export interface AuditLogEntry {
  id: number
  title: string
  body: string | null
  created_at: string
}

/** Fila cruda de `admin_audit_log` tal como la devuelve PostgREST. */
interface AuditRow {
  id: number
  actor_email: string | null
  action: string
  entity: string
  entity_id: string | null
  created_at: string
}

/**
 * GET /api/admin/audit-log — feed corto de la bitácora administrativa.
 *
 * Lee `admin_audit_log` (el libro real, migración 00072) y lo aplana al
 * formato que pinta el dashboard: `title` es la etiqueta legible de la acción
 * y `body` el sujeto afectado más quién lo hizo. Solo administradores.
 */
export async function GET() {
  try {
    const { user, response } = await requireAdmin()
    if (response || !user) return response ?? NextResponse.json({ error: "No autenticado" }, { status: 401 })

    const supabase = await createServiceClient()
    const { data, error } = await supabase
      .from("admin_audit_log")
      .select("id, actor_email, action, entity, entity_id, created_at")
      .order("created_at", { ascending: false })
      .limit(20)

    if (error) {
      logger.error("[AUDIT] feed error:", error)
      return NextResponse.json({ error: "No se pudo cargar la bitácora" }, { status: 500 })
    }

    const entries: AuditLogEntry[] = ((data ?? []) as AuditRow[]).map((row) => ({
      id: row.id,
      title: AUDIT_ACTION_LABEL[row.action as AuditAction] ?? row.action,
      body: [row.entity_id ? `#${row.entity_id}` : row.entity, row.actor_email]
        .filter(Boolean)
        .join(" · "),
      created_at: row.created_at,
    }))

    return NextResponse.json({ entries }, { headers: { "Cache-Control": "no-store" } })
  } catch (err) {
    logger.error("[AUDIT] feed unexpected:", err)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
