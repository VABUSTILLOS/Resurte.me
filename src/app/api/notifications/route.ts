import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"

export const runtime = "nodejs"

/**
 * /api/notifications — campana persistente del usuario.
 *
 * GET  → { notifications: [...] } (últimas 30, más recientes primero)
 * POST → body { ids: number[] } marca esas notificaciones como leídas
 *        (read_at = now). RLS: solo las propias.
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    }

    const { data, error } = await supabase
      .from("notifications")
      .select("id, type, title, body, action_url, order_id, read_at, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(30)

    if (error) {
      logger.error("[NOTIFICATIONS] GET error:", error)
      return NextResponse.json({ error: "No se pudieron cargar" }, { status: 500 })
    }

    return NextResponse.json(
      { notifications: data ?? [] },
      { headers: { "Cache-Control": "no-store" } }
    )
  } catch (err) {
    logger.error("[NOTIFICATIONS] GET unexpected:", err)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    }

    const body = await request.json().catch(() => null)
    const ids: unknown = body?.ids
    if (!Array.isArray(ids) || ids.length === 0 || ids.length > 100) {
      return NextResponse.json({ error: "ids inválidos" }, { status: 400 })
    }
    const clean = ids.map(Number).filter((n) => Number.isInteger(n) && n > 0)
    if (clean.length === 0) {
      return NextResponse.json({ ok: true, marked: 0 })
    }

    const { error } = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .in("id", clean)
      .is("read_at", null)

    if (error) {
      logger.error("[NOTIFICATIONS] mark-read error:", error)
      return NextResponse.json({ error: "No se pudieron marcar" }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    logger.error("[NOTIFICATIONS] POST unexpected:", err)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
