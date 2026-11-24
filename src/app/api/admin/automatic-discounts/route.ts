import { NextResponse, type NextRequest } from "next/server"
import { requireAdmin } from "@/lib/admin-auth"
import { createServiceClient } from "@/lib/supabase/service"
import { logger } from "@/lib/logger"
import { validateAutomaticDiscountRuleInput } from "@/lib/admin-marketing-validation"
import { isMissingRelationError } from "@/lib/sale-window"
import { logAdminAction } from "@/lib/audit-log"

export const runtime = "nodejs"

/**
 * GET /api/admin/automatic-discounts — lista las reglas de
 * descuento automático (paquetes y compra-X-llévate-Y).
 * POST /api/admin/automatic-discounts — crea una regla.
 *
 * Tabla `automatic_discount_rules` (migración 00231): si aún no se
 * aplica, GET degrada a lista vacía con `migration_pending` y POST
 * responde 503 — el panel lo muestra en vez de tronar.
 */
export async function GET() {
  const { response: adminDenied } = await requireAdmin({ permission: "marketing" })
  if (adminDenied) return adminDenied

  try {
    const supabase = await createServiceClient()
    const { data, error } = await supabase
      .from("automatic_discount_rules")
      .select("id, name, rule_type, is_active, config, created_at, updated_at")
      .order("created_at", { ascending: false })
      .limit(200)
    if (error) {
      if (isMissingRelationError(error)) {
        return NextResponse.json({ rules: [], migration_pending: true })
      }
      throw error
    }
    return NextResponse.json({ rules: data ?? [] })
  } catch (error) {
    logger.error("[ADMIN-AUTO-DISCOUNTS] list error:", error)
    return NextResponse.json({ error: "Error al cargar las reglas" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const { response: adminDenied, user: adminUser } = await requireAdmin({ permission: "marketing" })
  if (adminDenied) return adminDenied

  try {
    const body = (await request.json()) as Record<string, unknown>
    const parsed = validateAutomaticDiscountRuleInput(body)
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 })
    }

    const supabase = await createServiceClient()
    const { data, error } = await supabase
      .from("automatic_discount_rules")
      .insert({
        name: parsed.value.name,
        rule_type: parsed.value.rule_type,
        is_active: parsed.value.is_active,
        config: parsed.value.config,
      })
      .select("id")
      .single()
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
      action: "automatic_discount_create",
      entity: "automatic_discount_rules",
      entityId: data.id,
      detail: { name: parsed.value.name, rule_type: parsed.value.rule_type },
    })
    return NextResponse.json({ id: data.id }, { status: 201 })
  } catch (error) {
    logger.error("[ADMIN-AUTO-DISCOUNTS] create error:", error)
    return NextResponse.json({ error: "Error al crear la regla" }, { status: 500 })
  }
}
