import { NextResponse, type NextRequest } from "next/server"
import { createServiceClient } from "@/lib/supabase/service"
import { normalizePhone } from "@/lib/foodos"
import { logger } from "@/lib/logger"
import { rateLimited, clientIp, rateLimitResponse } from "@/lib/rate-limit"

const RATE_LIMIT_MAX = 30
const RATE_LIMIT_WINDOW_SECONDS = 60

/**
 * GET /api/foodos/loyalty?restaurant_id=…&phone=…
 * Consulta puntos de lealtad y store credit del cliente para el checkout.
 * No expone datos si el programa está inactivo.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServiceClient()

    const rate = await rateLimited(supabase, `foodos_loyalty:${clientIp(request)}`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_SECONDS)
    if (!rate.allowed) {
      return rateLimitResponse(rate)
    }

    const restaurantId = request.nextUrl.searchParams.get("restaurant_id")
    const phone = normalizePhone(request.nextUrl.searchParams.get("phone") ?? "")
    if (!restaurantId || phone.length < 10) {
      return NextResponse.json({ error: "Faltan parámetros" }, { status: 400 })
    }

    const { data: program } = await supabase
      .from("foodos_loyalty_programs")
      .select("points_per_100, point_value, is_active")
      .eq("restaurant_id", restaurantId)
      .eq("is_active", true)
      .maybeSingle()
    if (!program) {
      return NextResponse.json({ active: false, points: 0, credit: 0, points_value: 0 })
    }

    const { data: customer } = await supabase
      .from("foodos_customers")
      .select("loyalty_points, store_credit")
      .eq("restaurant_id", restaurantId)
      .eq("phone", phone)
      .maybeSingle()

    const points = customer?.loyalty_points ?? 0
    const credit = Number(customer?.store_credit ?? 0)

    return NextResponse.json({
      active: true,
      points,
      credit,
      points_value: points * Number(program.point_value),
      point_value: Number(program.point_value),
    })
  } catch (error) {
    logger.error("FoodOS loyalty error:", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
