import { NextResponse, type NextRequest } from "next/server"
import { requireAdmin } from "@/lib/admin-auth"
import { createServiceClient } from "@/lib/supabase/service"
import { logger } from "@/lib/logger"

export const runtime = "nodejs"

const EDITABLE_FIELDS = [
  "title",
  "description",
  "discount_pct",
  "subtotal_min",
  "is_active",
  "display_order",
  "product_id",
  "category_slugs",
] as const

/**
 * PATCH /api/admin/bump-rules/[id] — actualización parcial (toggle
 * is_active, editar copy, descuento, producto, orden…).
 * DELETE /api/admin/bump-rules/[id] — elimina la regla.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { response: adminDenied } = await requireAdmin()
  if (adminDenied) return adminDenied

  try {
    const { id } = await params
    const ruleId = Number(id)
    if (!Number.isInteger(ruleId) || ruleId <= 0) {
      return NextResponse.json({ error: "id inválido" }, { status: 400 })
    }

    const body = (await request.json()) as Record<string, unknown>
    const patch: Record<string, unknown> = {}
    for (const field of EDITABLE_FIELDS) {
      if (field in body) patch[field] = body[field]
    }
    if ("discount_pct" in patch) {
      const pct = Number(patch.discount_pct)
      if (!Number.isFinite(pct) || pct < 0 || pct > 1) {
        return NextResponse.json({ error: "discount_pct debe estar entre 0 y 1" }, { status: 400 })
      }
      patch.discount_pct = pct
    }
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "Sin campos para actualizar" }, { status: 400 })
    }

    const supabase = await createServiceClient()
    const { error } = await supabase.from("bump_rules").update(patch).eq("id", ruleId)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (error) {
    logger.error("[ADMIN-BUMPS] update error:", error)
    return NextResponse.json({ error: "Error al actualizar la regla" }, { status: 500 })
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
    const ruleId = Number(id)
    if (!Number.isInteger(ruleId) || ruleId <= 0) {
      return NextResponse.json({ error: "id inválido" }, { status: 400 })
    }

    const supabase = await createServiceClient()
    const { error } = await supabase.from("bump_rules").delete().eq("id", ruleId)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (error) {
    logger.error("[ADMIN-BUMPS] delete error:", error)
    return NextResponse.json({ error: "Error al eliminar la regla" }, { status: 500 })
  }
}
