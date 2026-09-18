import { createServiceClient } from "@/lib/supabase/service"
import { requireAdmin } from "@/lib/admin-auth"
import { logger } from "@/lib/logger"
import { NextResponse, type NextRequest } from "next/server"

const MAX_ROWS = 50

/**
 * GET /api/admin/products/audit?productId=123
 * Últimas N acciones de la bitácora sobre un producto (timeline del modal
 * de historial en /admin/productos). Sin productId devuelve las últimas 30
 * acciones de products en general (drawer de actividad reciente).
 *
 * B31 — el timeline es una lectura **decorativa**: si `admin_audit_log` no
 * existe todavía (PGRST205/42P01, p.ej. migración pendiente) o PostgREST
 * rechaza la consulta, se degrada a lista vacía con `degraded: true` en vez de
 * tumbar la vista con un 500. El panel distingue "sin historial" de "historial
 * no disponible". El 500 queda reservado a fallos reales del servidor (el
 * cliente de Supabase no se pudo crear).
 */
export async function GET(request: NextRequest) {
  const { response: adminDenied } = await requireAdmin({ permission: "productos" })
  if (adminDenied) return adminDenied

  try {
    const productId = Number(request.nextUrl.searchParams.get("productId"))
    const supabase = await createServiceClient()

    if (!Number.isInteger(productId) || productId <= 0) {
      const { data, error } = await supabase
        .from("admin_audit_log")
        .select("action,actor_email,created_at,detail,entity_id")
        .eq("entity", "products")
        .order("created_at", { ascending: false })
        .limit(30)
      if (error) {
        logger.warn("products.audit.degraded", { scope: "activity", error: error.message })
        return NextResponse.json({ entries: [], degraded: true })
      }
      return NextResponse.json({ entries: data ?? [], degraded: false })
    }

    const { data, error } = await supabase
      .from("admin_audit_log")
      .select("action,actor_email,created_at,detail")
      .eq("entity", "products")
      .eq("entity_id", String(productId))
      .order("created_at", { ascending: false })
      .limit(MAX_ROWS)

    if (error) {
      logger.warn("products.audit.degraded", {
        scope: "history",
        productId,
        error: error.message,
      })
      return NextResponse.json({ entries: [], degraded: true })
    }

    return NextResponse.json({ entries: data ?? [], degraded: false })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error interno del servidor"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
