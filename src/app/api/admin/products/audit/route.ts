import { createServiceClient } from "@/lib/supabase/service"
import { requireAdmin } from "@/lib/admin-auth"
import { NextResponse, type NextRequest } from "next/server"

const MAX_ROWS = 50

/**
 * GET /api/admin/products/audit?productId=123
 * Últimas N acciones de la bitácora sobre un producto (timeline del modal
 * de historial en /admin/productos).
 */
export async function GET(request: NextRequest) {
  const { response: adminDenied } = await requireAdmin()
  if (adminDenied) return adminDenied

  try {
    const productId = Number(request.nextUrl.searchParams.get("productId"))
    if (!Number.isInteger(productId) || productId <= 0) {
      return NextResponse.json({ error: "Se requiere productId" }, { status: 400 })
    }

    const supabase = await createServiceClient()
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
