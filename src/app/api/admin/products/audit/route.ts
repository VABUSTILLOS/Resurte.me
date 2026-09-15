import { createServiceClient } from "@/lib/supabase/service"
import { requireAdmin } from "@/lib/admin-auth"
import { NextResponse, type NextRequest } from "next/server"

const MAX_ROWS = 50

/**
 * GET /api/admin/products/audit?productId=123
 * Últimas N acciones de la bitácora sobre un producto (timeline del modal
 * de historial en /admin/productos). Sin productId devuelve las últimas 30
 * acciones de products en general (drawer de actividad reciente).
 */
export async function GET(request: NextRequest) {
  const { response: adminDenied } = await requireAdmin()
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
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      return NextResponse.json({ entries: data ?? [] })
    }

    const { data, error } = await supabase
      .from("admin_audit_log")
      .select("action,actor_email,created_at,detail")
      .eq("entity", "products")
      .eq("entity_id", String(productId))
      .order("created_at", { ascending: false })
      .limit(MAX_ROWS)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ entries: data ?? [] })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error interno del servidor"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
