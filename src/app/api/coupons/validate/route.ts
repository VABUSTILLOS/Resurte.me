import { NextResponse, type NextRequest } from "next/server"
import { createServiceClient } from "@/lib/supabase/service"
import type { AppliedCoupon } from "@/types"
import { logger } from "@/lib/logger"

/**
 * POST /api/coupons/validate
 *
 * Valida un cupón para mostrarlo en el carrito SIN consumirlo (el incremento
 * de used_count se hace únicamente al crear la orden en /api/orders).
 *
 * Body: { code: string, subtotal: number }
 * Respuesta: { code, discount_type, discount_value, min_order } | { error }
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { code?: string; subtotal?: number }
    const code = body.code?.trim()
    const subtotal = Number(body.subtotal ?? 0)

    if (!code) {
      return NextResponse.json({ error: "Escribe un código de cupón" }, { status: 400 })
    }
    if (!Number.isFinite(subtotal) || subtotal < 0) {
      return NextResponse.json({ error: "Subtotal inválido" }, { status: 400 })
    }

    const supabase = await createServiceClient()

    const { data: coupon, error } = await supabase
      .from("coupons")
      .select("id, code, discount_type, discount_value, min_order, max_uses, used_count, expires_at")
      .ilike("code", code) // case-insensitive: "BIENVENIDO" == "bienvenido"
      .maybeSingle()

    if (error) {
      logger.error("Coupon validation error:", error)
      return NextResponse.json({ error: "Error al validar el cupón" }, { status: 500 })
    }

    if (!coupon) {
      return NextResponse.json({ error: "El cupón no existe" }, { status: 400 })
    }
    if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
      return NextResponse.json({ error: "El cupón ha expirado" }, { status: 400 })
    }
    if (subtotal < Number(coupon.min_order)) {
      return NextResponse.json(
        { error: `Este cupón requiere un pedido mínimo de $${Number(coupon.min_order).toFixed(2)}` },
        { status: 400 }
      )
    }
    if (coupon.max_uses > 0 && coupon.used_count >= coupon.max_uses) {
      return NextResponse.json({ error: "El cupón ya fue utilizado el máximo de veces" }, { status: 400 })
    }

    const appliedCoupon: AppliedCoupon = {
      code: coupon.code,
      discount_type: coupon.discount_type,
      discount_value: Number(coupon.discount_value),
      min_order: Number(coupon.min_order),
    }

    return NextResponse.json(appliedCoupon)
  } catch (error) {
    logger.error("Coupon validate error:", error)
    return NextResponse.json({ error: "Error interno al validar el cupón" }, { status: 500 })
  }
}
