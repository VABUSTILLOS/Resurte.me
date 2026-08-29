import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/admin-auth"
import {
  getAdminOrders,
  getActiveStoresCount,
} from "@/app/admin/actions"

/**
 * GET /api/admin/orders?limit=50&before=ISO
 *
 * Pedidos recientes para el dashboard admin (con paginación por cursor
 * opcional). Incluye el número de tiendas activas para las tarjetas de
 * resumen. Requiere sesión admin (requireAdmin).
 */
export async function GET(request: Request) {
  try {
    const { response: adminDenied } = await requireAdmin()
    if (adminDenied) {
      return adminDenied
    }

    const { searchParams } = new URL(request.url)
    const limit = Math.min(
      Math.max(parseInt(searchParams.get("limit") ?? "50", 10) || 50, 1),
      100
    )
    const before = searchParams.get("before") ?? undefined

    const [{ orders, hasMore }, activeStores] = await Promise.all([
      getAdminOrders(limit, before),
      getActiveStoresCount(),
    ])

    return NextResponse.json({ orders, hasMore, activeStores })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error interno del servidor"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
