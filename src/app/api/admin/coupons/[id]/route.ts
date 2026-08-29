import { NextResponse, type NextRequest } from "next/server"
import { requireAdmin } from "@/lib/admin-auth"
import { createServiceClient } from "@/lib/supabase/service"
import { logger } from "@/lib/logger"

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
    const patch: Record<string, unknown> = {}
    if ("discount_value" in body) {
      const v = Number(body.discount_value)
      if (!Number.isFinite(v) || v <= 0) {
        return NextResponse.json({ error: "discount_value debe ser positivo" }, { status: 400 })
      }
      patch.discount_value = v
    }
    if ("min_order" in body) {
      const v = Number(body.min_order)
      if (!Number.isFinite(v) || v < 0) {
        return NextResponse.json({ error: "min_order inválido" }, { status: 400 })
      }
      patch.min_order = v
    }
    if ("max_uses" in body) {
      const v = Math.trunc(Number(body.max_uses))
      if (!Number.isFinite(v) || v < 0) {
        return NextResponse.json({ error: "max_uses inválido" }, { status: 400 })
      }
      patch.max_uses = v
    }
    if ("expires_at" in body) {
      if (body.expires_at === null) {
        patch.expires_at = null
      } else {
        const d = new Date(String(body.expires_at))
        if (Number.isNaN(d.getTime())) {
          return NextResponse.json({ error: "expires_at inválido" }, { status: 400 })
        }
        patch.expires_at = d.toISOString()
      }
    }
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "Sin campos para actualizar" }, { status: 400 })
    }

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
