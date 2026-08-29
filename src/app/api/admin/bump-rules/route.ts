import { NextResponse, type NextRequest } from "next/server"
import { requireAdmin } from "@/lib/admin-auth"
import { createServiceClient } from "@/lib/supabase/service"
import { logger } from "@/lib/logger"
import { validateBumpRuleInput } from "@/lib/admin-marketing-validation"

export const runtime = "nodejs"

/**
 * GET /api/admin/bump-rules — lista todas las reglas (activas e inactivas).
 * POST /api/admin/bump-rules — crea una regla nueva.
 * Requiere sesión admin; escribe con service_role.
 */
export async function GET() {
  const { response: adminDenied } = await requireAdmin()
  if (adminDenied) return adminDenied

  try {
    const supabase = await createServiceClient()
    const { data, error } = await supabase
      .from("bump_rules")
      .select("id, trigger_type, category_slugs, subtotal_min, product_id, title, description, discount_pct, is_active, display_order")
      .order("display_order", { ascending: true })
    if (error) throw error
    return NextResponse.json({ rules: data ?? [] })
  } catch (error) {
    logger.error("[ADMIN-BUMPS] list error:", error)
    return NextResponse.json({ error: "Error al cargar reglas" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const { response: adminDenied } = await requireAdmin()
  if (adminDenied) return adminDenied

  try {
    const body = (await request.json()) as Record<string, unknown>
    const parsed = validateBumpRuleInput(body)
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 })
    }

    const supabase = await createServiceClient()
    const { data, error } = await supabase
      .from("bump_rules")
      .insert(parsed.value)
      .select("id")
      .single()
    if (error) throw error
    return NextResponse.json({ id: data.id }, { status: 201 })
  } catch (error) {
    logger.error("[ADMIN-BUMPS] create error:", error)
    return NextResponse.json({ error: "Error al crear la regla" }, { status: 500 })
  }
}
