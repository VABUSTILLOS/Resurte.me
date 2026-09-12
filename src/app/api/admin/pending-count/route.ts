import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/admin-auth"
import { getPendingOrdersCount } from "@/app/admin/actions"

/**
 * GET /api/admin/pending-count
 *
 * Fase 3 — Conteo ligero de pedidos pendientes para el badge de la subnav
 * admin (polling cada 30 s). Requiere sesión admin.
 */
export async function GET() {
  try {
    const { response: adminDenied } = await requireAdmin()
    if (adminDenied) {
      return adminDenied
    }
    const count = await getPendingOrdersCount()
    return NextResponse.json({ count })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error interno del servidor"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
