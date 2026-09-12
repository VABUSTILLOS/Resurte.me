import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import { rateLimited, clientIp, rateLimitResponse } from "@/lib/rate-limit"
import { createServiceClient } from "@/lib/supabase/service"

export const runtime = "nodejs"

/**
 * /api/recompensas/facturas — captura real de facturas/tickets.
 *
 * POST { image_path, total_amount?, notes? } → registra el envío para
 *   revisión admin (la imagen ya se subió a Storage bucket `facturas`,
 *   carpeta del usuario, con RLS). Valida que el path pertenece al usuario.
 * GET → envíos del usuario con sesión (más recientes primero).
 *
 * La acreditación de créditos ocurre al aprobar en /admin/facturas
 * (grant_wallet_credit, migración 00074).
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json(
        { error: "Inicia sesión para subir tu factura" },
        { status: 401 }
      )
    }

    const service = await createServiceClient()
    const rate = await rateLimited(service, `facturas:${user.id ?? clientIp(request)}`, 10, 60)
    if (!rate.allowed) return rateLimitResponse(rate)

    const body = await request.json().catch(() => null)
    const imagePath = typeof body?.image_path === "string" ? body.image_path.trim() : ""
    const totalAmount =
      typeof body?.total_amount === "number" && body.total_amount > 0
        ? Math.round(body.total_amount * 100) / 100
        : null
    const notes = typeof body?.notes === "string" ? body.notes.trim().slice(0, 500) : null

    // El path debe vivir en la carpeta del propio usuario (<uid>/...).
    if (!imagePath || !imagePath.startsWith(`${user.id}/`) || imagePath.includes("..")) {
      return NextResponse.json({ error: "image_path inválido" }, { status: 400 })
    }

    const { data, error } = await supabase
      .from("invoice_submissions")
      .insert({
        user_id: user.id,
        image_path: imagePath,
        total_amount: totalAmount,
        notes,
      })
      .select("id, status, created_at")
      .single()

    if (error) {
      logger.error("[FACTURAS] insert error:", error)
      return NextResponse.json({ error: "No se pudo registrar la factura" }, { status: 500 })
    }

    return NextResponse.json({ submission: data }, { status: 201 })
  } catch (err) {
    logger.error("[FACTURAS] POST unexpected:", err)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}

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
      .from("invoice_submissions")
      .select("id, image_path, total_amount, notes, status, credits_granted, created_at, reviewed_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20)

    if (error) {
      logger.error("[FACTURAS] GET error:", error)
      return NextResponse.json({ error: "No se pudieron cargar" }, { status: 500 })
    }

    return NextResponse.json(
      { submissions: data ?? [] },
      { headers: { "Cache-Control": "no-store" } }
    )
  } catch (err) {
    logger.error("[FACTURAS] GET unexpected:", err)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
