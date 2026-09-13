import { NextResponse, type NextRequest } from "next/server"
import { createServiceClient } from "@/lib/supabase/service"
import { normalizePhone } from "@/lib/foodos"
import { logger } from "@/lib/logger"
import { rateLimited, clientIp, rateLimitResponse } from "@/lib/rate-limit"

const RATE_LIMIT_MAX = 10
const RATE_LIMIT_WINDOW_SECONDS = 60

/**
 * POST /api/foodos/reviews
 * Reseña pública post-entrega desde la página de tracking.
 * Exige que el pedido exista, pertenezca al restaurante y esté entregado.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServiceClient()

    const rate = await rateLimited(supabase, `foodos_review:${clientIp(request)}`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_SECONDS)
    if (!rate.allowed) {
      return rateLimitResponse(rate)
    }

    const body = await request.json()
    const { order_id, rating, comment, customer_name } = body as {
      order_id?: string
      rating?: number
      comment?: string
      customer_name?: string
    }
    const ratingNum = Math.round(Number(rating))
    if (!order_id || !(ratingNum >= 1 && ratingNum <= 5)) {
      return NextResponse.json({ error: "Pedido y calificación (1-5) son requeridos" }, { status: 400 })
    }

    const { data: order } = await supabase
      .from("foodos_orders")
      .select("id, restaurant_id, status, customer_phone")
      .eq("id", order_id)
      .maybeSingle()
    if (!order || order.status !== "delivered") {
      return NextResponse.json({ error: "Solo puedes reseñar pedidos entregados" }, { status: 400 })
    }

    // Una reseña por pedido
    const { data: existing } = await supabase
      .from("foodos_reviews")
      .select("id")
      .eq("order_id", order_id)
      .maybeSingle()
    if (existing) {
      return NextResponse.json({ error: "Este pedido ya tiene reseña" }, { status: 409 })
    }

    const { error } = await supabase.from("foodos_reviews").insert({
      restaurant_id: order.restaurant_id,
      order_id,
      customer_name: customer_name?.trim() || null,
      customer_phone: order.customer_phone ? normalizePhone(order.customer_phone) : null,
      rating: ratingNum,
      comment: comment?.trim().slice(0, 500) || null,
    })
    if (error) {
      logger.error("FoodOS review insert error:", error)
      return NextResponse.json({ error: "No se pudo guardar la reseña" }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    logger.error("FoodOS review error:", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
