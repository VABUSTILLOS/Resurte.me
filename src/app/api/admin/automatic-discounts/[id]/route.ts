import { NextResponse, type NextRequest } from "next/server"
import { requireAdmin } from "@/lib/admin-auth"
import { createServiceClient } from "@/lib/supabase/service"
import { logger } from "@/lib/logger"
import { validateAutomaticDiscountRulePatch } from "@/lib/admin-marketing-validation"
import { isMissingRelationError } from "@/lib/sale-window"
import { logAdminAction } from "@/lib/audit-log"

export const runtime = "nodejs"

/**
 * PATCH /api/admin/automatic-discounts/[id] — actualización parcial
 * (name, is_active, config). El tipo de regla no cambia: el config
 * se valida contra el tipo de la regla existente.
 * DELETE /api/admin/automatic-discounts/[id] — elimina la regla.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { response: adminDenied, user: adminUser } = await requireAdmin({ permission: "marketing" })
  if (adminDenied) return adminDenied

  try {
    const { id } = await params
    if (!id || typeof id !== "string") {
      return NextResponse.json({ error: "id inválido" }, { status: 400 })
    }
    const body = (await request.json()) as Record<string, unknown>

    const supabase = await createServiceClient()
    const { data: existing, error: readError } = await supabase
      .from("automatic_discount_rules")
      .select("id, rule_type")
      .eq("id", id)
      .maybeSingle()
    if (readError) {
      if (isMissingRelationError(readError)) {
        return NextResponse.json(
          { error: "Falta aplicar la migración 00231 (automatic_discount_rules)" },
          { status: 503 }
        )
      }
      throw readError
    }
    if (!existing) {
      return NextResponse.json({ error: "La regla no existe" }, { status: 404 })
    }

    const parsed = validateAutomaticDiscountRulePatch(
      body,
      (existing as { rule_type: string }).rule_type
    )
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 })
    }

    const { error } = await supabase
      .from("automatic_discount_rules")
      .update({ ...parsed.value, updated_at: new Date().toISOString() })
      .eq("id", id)
    if (error) throw error

    await logAdminAction(supabase, {
      actorId: adminUser?.id ?? null,
      actorEmail: adminUser?.email ?? null,
      action: "automatic_discount_update",
      entity: "automatic_discount_rules",
      entityId: id,
      detail: { ...parsed.value },
    })
    return NextResponse.json({ ok: true })
  } catch (error) {
    logger.error("[ADMIN-AUTO-DISCOUNTS] update error:", error)
    return NextResponse.json({ error: "Error al actualizar la regla" }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { response: adminDenied, user: adminUser } = await requireAdmin({ permission: "marketing" })
  if (adminDenied) return adminDenied

  try {
    const { id } = await params
    if (!id || typeof id !== "string") {
      return NextResponse.json({ error: "id inválido" }, { status: 400 })
    }

    const supabase = await createServiceClient()
    const { error } = await supabase.from("automatic_discount_rules").delete().eq("id", id)
    if (error) {
      if (isMissingRelationError(error)) {
        return NextResponse.json(
          { error: "Falta aplicar la migración 00231 (automatic_discount_rules)" },
          { status: 503 }
        )
      }
      throw error
    }

    await logAdminAction(supabase, {
      actorId: adminUser?.id ?? null,
      actorEmail: adminUser?.email ?? null,
      action: "automatic_discount_delete",
      entity: "automatic_discount_rules",
      entityId: id,
    })
    return NextResponse.json({ ok: true })
  } catch (error) {
    logger.error("[ADMIN-AUTO-DISCOUNTS] delete error:", error)
    return NextResponse.json({ error: "Error al eliminar la regla" }, { status: 500 })
  }
}
