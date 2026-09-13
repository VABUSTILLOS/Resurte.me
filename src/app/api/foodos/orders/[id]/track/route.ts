import { NextResponse, type NextRequest } from "next/server"
import { createServiceClient } from "@/lib/supabase/service"
import { logger } from "@/lib/logger"
import { rateLimited, clientIp, rateLimitResponse } from "@/lib/rate-limit"

const RATE_LIMIT_MAX = 30
const RATE_LIMIT_WINDOW_SECONDS = 60

/**
 * GET /api/foodos/orders/[id]/track?slug=<restaurante>
 *
 * Estado público de un pedido FoodOS (tracking para el cliente final).
 * Solo expone campos mínimos y exige que el slug coincida con el
 * restaurante del pedido (el id UUID actúa como capability URL,
 * igual que los links de factura de take.app).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createServiceClient()

    const rate = await rateLimited(supabase, `foodos_track:${clientIp(request)}`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_SECONDS)
    if (!rate.allowed) {
      return rateLimitResponse(rate)
    }

    const { id } = await params
    const slug = request.nextUrl.searchParams.get("slug")
    if (!id || !slug) {
      return NextResponse.json({ error: "Faltan parámetros" }, { status: 400 })
    }

    const { data: restaurant } = await supabase
      .from("foodos_restaurants")
      .select("id")
      .eq("slug", slug)
      .eq("status", "active")
      .maybeSingle()
    if (!restaurant) {
      return NextResponse.json({ error: "Restaurante no encontrado" }, { status: 404 })
    }

    const { data: order } = await supabase
      .from("foodos_orders")
      .select("id, status, payment_status, fulfillment, table_number, created_at, branch_id, total, items")
      .eq("id", id)
      .eq("restaurant_id", restaurant.id)
      .maybeSingle()
    if (!order) {
      return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 })
    }

    let branchName: string | null = null
    if (order.branch_id) {
      const { data: branch } = await supabase
        .from("foodos_branches")
        .select("name")
        .eq("id", order.branch_id)
        .maybeSingle()
      branchName = branch?.name ?? null
    }

    return NextResponse.json({
      id: order.id,
      status: order.status,
      payment_status: order.payment_status,
      fulfillment: order.fulfillment,
      table_number: order.table_number,
      created_at: order.created_at,
      branch_name: branchName,
      total: order.total,
      items: order.items,
    })
  } catch (error) {
    logger.error("FoodOS track error:", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
