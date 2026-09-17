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
      .select("id, status, payment_status, fulfillment, table_number, created_at, branch_id, total, items, scheduled_for")
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

    // Estado de la entrega (Flotilla). Solo se expone si el pedido es a
    // domicilio: es información operativa del restaurante, no del cliente.
    let delivery: {
      status: string
      zone_name: string | null
      courier_name: string | null
      eta_minutes: number | null
      tracking_url: string | null
      provider: string
      proof_pin: string | null
      proof_verified: boolean
    } | null = null
    if (order.fulfillment === "delivery") {
      const { data: row } = await supabase
        .from("foodos_deliveries")
        .select(
          "status, zone_name, eta_minutes, provider, provider_tracking_url, courier_id, proof_pin, proof_verified"
        )
        .eq("order_id", order.id)
        .maybeSingle()
      if (row) {
        let courierName: string | null = null
        if (row.courier_id) {
          const { data: courier } = await supabase
            .from("foodos_couriers")
            .select("name")
            .eq("id", row.courier_id)
            .maybeSingle()
          courierName = courier?.name ?? null
        }
        delivery = {
          status: row.status,
          zone_name: row.zone_name,
          courier_name: courierName,
          eta_minutes: row.eta_minutes,
          tracking_url: row.provider_tracking_url,
          provider: row.provider,
          // El PIN es del comensal: lo muestra al repartidor al recibir.
          // Deja de exponerse cuando la entrega ya se cerró.
          proof_pin: row.proof_verified ? null : (row.proof_pin ?? null),
          proof_verified: row.proof_verified === true,
        }
      }
    }

    return NextResponse.json({
      id: order.id,
      status: order.status,
      payment_status: order.payment_status,
      fulfillment: order.fulfillment,
      table_number: order.table_number,
      created_at: order.created_at,
      scheduled_for: order.scheduled_for,
      branch_name: branchName,
      total: order.total,
      items: order.items,
      delivery,
    })
  } catch (error) {
    logger.error("FoodOS track error:", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
