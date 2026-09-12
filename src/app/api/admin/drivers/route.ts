import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/service"
import { requireAdmin } from "@/lib/admin-auth"
import { logger } from "@/lib/logger"

export const runtime = "nodejs"

/**
 * /api/admin/drivers — repartidores (migración 00076).
 *
 * GET   → { drivers: [...] } (activos primero)
 * POST  → { name, phone? } crea
 * PATCH → { id, is_active } activa/desactiva
 */
export async function GET() {
  try {
    const { response: adminDenied } = await requireAdmin()
    if (adminDenied) return adminDenied

    const supabase = await createServiceClient()
    const { data, error } = await supabase
      .from("delivery_drivers")
      .select("id, name, phone, is_active")
      .order("is_active", { ascending: false })
      .order("name")

    if (error) {
      logger.error("[ADMIN DRIVERS] list error:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ drivers: data ?? [] })
  } catch (err) {
    logger.error("[ADMIN DRIVERS] GET unexpected:", err)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { response: adminDenied } = await requireAdmin()
    if (adminDenied) return adminDenied

    const body = await request.json().catch(() => null)
    const name = typeof body?.name === "string" ? body.name.trim() : ""
    const phone = typeof body?.phone === "string" ? body.phone.trim() : null
    if (!name || name.length > 80) {
      return NextResponse.json({ error: "name requerido (máx. 80)" }, { status: 400 })
    }

    const supabase = await createServiceClient()
    const { data, error } = await supabase
      .from("delivery_drivers")
      .insert({ name, phone })
      .select("id, name, phone, is_active")
      .single()

    if (error) {
      logger.error("[ADMIN DRIVERS] create error:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ driver: data }, { status: 201 })
  } catch (err) {
    logger.error("[ADMIN DRIVERS] POST unexpected:", err)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { response: adminDenied } = await requireAdmin()
    if (adminDenied) return adminDenied

    const body = await request.json().catch(() => null)
    const id = Number(body?.id)
    if (!Number.isInteger(id) || typeof body?.is_active !== "boolean") {
      return NextResponse.json({ error: "Parámetros inválidos" }, { status: 400 })
    }

    const supabase = await createServiceClient()
    const { error } = await supabase
      .from("delivery_drivers")
      .update({ is_active: body.is_active })
      .eq("id", id)

    if (error) {
      logger.error("[ADMIN DRIVERS] patch error:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    logger.error("[ADMIN DRIVERS] PATCH unexpected:", err)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
