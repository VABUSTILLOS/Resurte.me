import { NextResponse, type NextRequest } from "next/server"
import { requireAdmin } from "@/lib/admin-auth"
import { createServiceClient } from "@/lib/supabase/service"
import { logger } from "@/lib/logger"
import { validateCouponInput } from "@/lib/admin-marketing-validation"

export const runtime = "nodejs"

/**
 * GET /api/admin/coupons — lista cupones (más recientes primero).
 * POST /api/admin/coupons — crea un cupón público (user_id NULL).
 */
export async function GET() {
  const { response: adminDenied } = await requireAdmin()
  if (adminDenied) return adminDenied

  try {
    const supabase = await createServiceClient()
    const { data, error } = await supabase
      .from("coupons")
      .select("id, code, discount_type, discount_value, min_order, max_uses, used_count, expires_at, origin, created_at")
      .order("created_at", { ascending: false })
      .limit(200)
    // 42703 = columna origin aún no migrada → listado básico
    if (error?.code === "42703") {
      const retry = await supabase
        .from("coupons")
        .select("id, code, discount_type, discount_value, min_order, max_uses, used_count, expires_at, created_at")
        .order("created_at", { ascending: false })
        .limit(200)
      if (retry.error) throw retry.error
      return NextResponse.json({ coupons: retry.data ?? [] })
    }
    if (error) throw error
    return NextResponse.json({ coupons: data ?? [] })
  } catch (error) {
    logger.error("[ADMIN-COUPONS] list error:", error)
    return NextResponse.json({ error: "Error al cargar cupones" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const { response: adminDenied } = await requireAdmin()
  if (adminDenied) return adminDenied

  try {
    const body = (await request.json()) as Record<string, unknown>
    const parsed = validateCouponInput(body)
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 })
    }

    const supabase = await createServiceClient()
    const { data, error } = await supabase
      .from("coupons")
      .insert(parsed.value)
      .select("id")
      .single()
    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({ error: "Ya existe un cupón con ese código" }, { status: 409 })
      }
      throw error
    }
    return NextResponse.json({ id: data.id }, { status: 201 })
  } catch (error) {
    logger.error("[ADMIN-COUPONS] create error:", error)
    return NextResponse.json({ error: "Error al crear el cupón" }, { status: 500 })
  }
}
