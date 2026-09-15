import { createServiceClient } from "@/lib/supabase/service"
import { requireAdmin } from "@/lib/admin-auth"
import { NextResponse, type NextRequest } from "next/server"

const MAX_IDS = 200

/**
 * GET /api/admin/products/row-meta?ids=1,2,3
 * Metadatos por fila para el panel de productos:
 * - waPending: ids con cambios pendientes en whatsapp_sync_queue.
 * - lastEdit: última edición registrada en admin_audit_log por producto.
 */
export async function GET(request: NextRequest) {
  const { response: adminDenied } = await requireAdmin()
  if (adminDenied) return adminDenied

  try {
    const idsParam = request.nextUrl.searchParams.get("ids") ?? ""
    const ids = idsParam
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isInteger(n) && n > 0)
      .slice(0, MAX_IDS)
    if (ids.length === 0) {
      return NextResponse.json({ waPending: [], lastEdit: {} })
    }

    const supabase = await createServiceClient()

    const [queueRes, auditRes, salesRes] = await Promise.all([
      supabase
        .from("whatsapp_sync_queue")
        .select("product_id")
        .in("product_id", ids)
        .is("processed_at", null),
      supabase
        .from("admin_audit_log")
        .select("entity_id,actor_email,created_at")
        .eq("entity", "products")
        .in("entity_id", ids.map(String))
        .order("created_at", { ascending: false })
        .limit(500),
      supabase
        .from("order_items")
        .select("product_id,quantity,unit_price")
        .in("product_id", ids),
    ])

    const waPending = [...new Set((queueRes.data ?? []).map((r) => r.product_id as number))]

    const lastEdit: Record<string, { at: string; email: string | null }> = {}
    for (const row of auditRes.data ?? []) {
      // La consulta viene ordenada desc: la primera fila por id es la última.
      if (!(row.entity_id in lastEdit)) {
        lastEdit[row.entity_id] = { at: row.created_at, email: row.actor_email }
      }
    }

    // Unidades y monto vendido por producto (columna Ventas).
    const sales: Record<string, number> = {}
    const salesAmount: Record<string, number> = {}
    for (const row of salesRes.data ?? []) {
      sales[row.product_id] = (sales[row.product_id] ?? 0) + (row.quantity ?? 0)
      salesAmount[row.product_id] =
        (salesAmount[row.product_id] ?? 0) + (row.quantity ?? 0) * Number(row.unit_price ?? 0)
    }

    return NextResponse.json({ waPending, lastEdit, sales, salesAmount })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error interno del servidor"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
