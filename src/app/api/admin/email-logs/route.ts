import { NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/service"
import { requireAdmin } from "@/lib/admin-auth"
import { isIntegrationConfigured } from "@/lib/integration-status"
import { logger } from "@/lib/logger"
import { EMAIL_LOG_CAP, paginaCapada } from "@/lib/bitacora"

export const runtime = "nodejs"

/**
 * GET /api/admin/email-logs — bitácora de emails transaccionales y de
 * marketing (email_logs): confirmaciones de pedido, hitos logísticos,
 * carrito abandonado, reactivación. Solo admin.
 *
 * `configured` viaja en la respuesta porque la bitácora es inútil sin él:
 * si el proveedor de correo no tiene credenciales, cada fila sale `failed`
 * y el admin necesita la causa arriba, no fila por fila.
 */
export async function GET() {
  try {
    const { response: adminDenied } = await requireAdmin({ permission: "sistema" })
    if (adminDenied) return adminDenied

    const supabase = await createServiceClient()
    // `cap + 1` filas: la de más es la sonda de "¿hay más?". `count: "exact"`
    // da el total real del filtro para que la UI pueda decir "de N" en vez de
    // presentar la página como si fuera el universo.
    const { data, error, count } = await supabase
      .from("email_logs")
      .select("id, email_to, email_type, order_id, sent_at, status, error", { count: "exact" })
      .order("sent_at", { ascending: false })
      .limit(EMAIL_LOG_CAP + 1)

    if (error) {
      logger.error("[ADMIN EMAIL-LOGS] list error:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    const pagina = paginaCapada(data ?? [], EMAIL_LOG_CAP, count ?? null)
    return NextResponse.json({
      logs: pagina.entries,
      configured: isIntegrationConfigured("email"),
      cap: pagina.cap,
      truncated: pagina.truncated,
      total: pagina.total,
    })
  } catch (err) {
    logger.error("[ADMIN EMAIL-LOGS] unexpected:", err)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
