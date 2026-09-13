import { NextResponse, type NextRequest } from "next/server"
import { requireAdmin } from "@/lib/admin-auth"
import { createServiceClient } from "@/lib/supabase/service"
import { logger } from "@/lib/logger"
import { validateCouponPatch } from "@/lib/admin-marketing-validation"

export const runtime = "nodejs"

/**
 * PATCH /api/admin/coupons/[id] — actualización parcial: discount_value,
 * min_order, max_uses, expires_at (p.ej. expirar ya: expires_at=ahora).
 * DELETE /api/admin/coupons/[id] — elimina el cupón.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { response: adminDenied } = await requireAdmin()
  if (adminDenied) return adminDenied

  try {
    const { id } = await params
    const couponId = Number(id)
    if (!Number.isInteger(couponId) || couponId <= 0) {
      return NextResponse.json({ error: "id inválido" }, { status: 400 })
    }

    const body = (await request.json()) as Record<string, unknown>
    // Fase 11 — validación extraída a lib para cubrirla con tests
    const parsed = validateCouponPatch(body)
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 })
    }
    const patch = parsed.value

    const supabase = await createServiceClient()
    const { error } = await supabase.from("coupons").update(patch).eq("id", couponId)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (error) {
    logger.error("[ADMIN-COUPONS] update error:", error)
    return NextResponse.json({ error: "Error al actualizar el cupón" }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { response: adminDenied } = await requireAdmin()
  if (adminDenied) return adminDenied

  try {
    const { id } = await params
    const couponId = Number(id)
    if (!Number.isInteger(couponId) || couponId <= 0) {
      return NextResponse.json({ error: "id inválido" }, { status: 400 })
    }

    const supabase = await createServiceClient()
    const { error } = await supabase.from("coupons").delete().eq("id", couponId)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (error) {
    logger.error("[ADMIN-COUPONS] delete error:", error)
    return NextResponse.json({ error: "Error al eliminar el cupón" }, { status: 500 })
  }
}
