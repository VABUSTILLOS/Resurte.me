import { NextResponse, type NextRequest } from "next/server"
import { createServiceClient } from "@/lib/supabase/service"
import { validateCoupon } from "@/lib/foodos"
import type { FoodosCoupon } from "@/types/foodos"
import { logger } from "@/lib/logger"
import { rateLimited, clientIp, rateLimitResponse } from "@/lib/rate-limit"

const RATE_LIMIT_MAX = 30
const RATE_LIMIT_WINDOW_SECONDS = 60

/**
 * POST /api/foodos/coupons/validate
 * Valida un cupón del micrositio /r/[slug] contra el subtotal actual.
 * La autoridad final es POST /api/foodos/orders (re-valida en servidor).
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServiceClient()

    const rate = await rateLimited(supabase, `foodos_coupon:${clientIp(request)}`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_SECONDS)
    if (!rate.allowed) {
      return rateLimitResponse(rate)
    }

    const body = await request.json()
    const { restaurant_id, code, subtotal } = body as {
      restaurant_id?: string
      code?: string
      subtotal?: number
    }
    if (!restaurant_id || !code?.trim()) {
      return NextResponse.json({ error: "Faltan campos requeridos" }, { status: 400 })
    }

    const { data: coupon } = await supabase
      .from("foodos_coupons")
      .select("*")
      .eq("restaurant_id", restaurant_id)
      .ilike("code", code.trim())
      .maybeSingle()

    const result = validateCoupon(coupon as FoodosCoupon | null, Number(subtotal) || 0)
    if (!result.valid) {
      return NextResponse.json({ valid: false, error: result.error }, { status: 200 })
    }

    return NextResponse.json({
      valid: true,
      code: (coupon as FoodosCoupon).code.toUpperCase(),
      discount: result.discount,
    })
  } catch (error) {
    logger.error("FoodOS coupon validate error:", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
