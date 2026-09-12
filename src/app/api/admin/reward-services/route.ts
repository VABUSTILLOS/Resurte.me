import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/service"
import { requireAdmin } from "@/lib/admin-auth"
import { logger } from "@/lib/logger"

export const runtime = "nodejs"

/**
 * /api/admin/reward-services — CRUD del catálogo canjeable (reward_services,
 * migración 00075). La tienda pública lee solo activos vía RLS; aquí el
 * admin ve todos y edita con service_role.
 *
 * GET  → { services: [...] } (todos, incluidos inactivos)
 * POST → upsert { id, name, tier, cost, category, description?, icon?,
 *        is_active?, display_order? } — id nuevo crea, existente edita.
 */

const VALID_TIERS = ["verde", "plata", "oro", "diamante"]
const VALID_CATEGORIES = ["presencia", "trafico", "infraestructura"]

export async function GET() {
  try {
    const { response: adminDenied } = await requireAdmin()
    if (adminDenied) return adminDenied

    const supabase = await createServiceClient()
    const { data, error } = await supabase
      .from("reward_services")
      .select("*")
      .order("display_order")

    if (error) {
      logger.error("[ADMIN REWARD-SERVICES] list error:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ services: data ?? [] })
  } catch (err) {
    logger.error("[ADMIN REWARD-SERVICES] GET unexpected:", err)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { response: adminDenied } = await requireAdmin()
    if (adminDenied) return adminDenied

    const body = await request.json().catch(() => null)
    const id = typeof body?.id === "string" ? body.id.trim() : ""
    const name = typeof body?.name === "string" ? body.name.trim() : ""
    const cost = Number(body?.cost)

    if (!id || !/^[a-z0-9-]{2,60}$/.test(id)) {
      return NextResponse.json(
        { error: "id inválido (minúsculas, números y guiones, 2-60)" },
        { status: 400 }
      )
    }
    if (!name) {
      return NextResponse.json({ error: "name es requerido" }, { status: 400 })
    }
    if (!Number.isFinite(cost) || cost <= 0) {
      return NextResponse.json({ error: "cost debe ser mayor a 0" }, { status: 400 })
    }

    const tier = VALID_TIERS.includes(body?.tier) ? body.tier : "verde"
    const category = VALID_CATEGORIES.includes(body?.category) ? body.category : "presencia"

    const supabase = await createServiceClient()
    const { error } = await supabase.from("reward_services").upsert(
      {
        id,
        name,
        tier,
        cost,
        category,
        description: typeof body?.description === "string" ? body.description : null,
        icon: typeof body?.icon === "string" ? body.icon : null,
        is_active: body?.is_active !== false,
        display_order: Number.isInteger(body?.display_order) ? body.display_order : 99,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    )

    if (error) {
      logger.error("[ADMIN REWARD-SERVICES] upsert error:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    logger.error("[ADMIN REWARD-SERVICES] POST unexpected:", err)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
