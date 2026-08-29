import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"
import { rateLimited, clientIp, rateLimitResponse } from "@/lib/rate-limit"
import { logger } from "@/lib/logger"

/**
 * Aceptación de invitación al panel (Fase 4.6).
 *
 * POST /api/panel/members/accept { token }
 *   → vincula la invitación (invite_token) con el usuario autenticado:
 *     member_user_id = user.id, status = "activo". El correo de la sesión
 *     debe coincidir con el invitado. Un usuario solo puede ser miembro
 *     activo de un panel a la vez.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user || !user.email) {
      return NextResponse.json({ error: "Debes iniciar sesión para aceptar la invitación" }, { status: 401 })
    }

    const service = await createServiceClient()
    const rate = await rateLimited(service, `panel-members-accept:${user.id ?? clientIp(req)}`, 10, 60)
    if (!rate.allowed) return rateLimitResponse(rate)

    const body = (await req.json()) as { token?: unknown }
    const token = typeof body.token === "string" ? body.token.trim() : ""
    if (!UUID_RE.test(token)) {
      return NextResponse.json({ error: "Token inválido" }, { status: 400 })
    }

    const { data: inviteRows, error: inviteError } = await service
      .from("panel_members")
      .select("id, owner_user_id, member_email, status")
      .eq("invite_token", token)
      .limit(1)
    if (inviteError) {
      logger.error("Panel members accept lookup error:", inviteError)
      return NextResponse.json({ error: "Error al aceptar la invitación" }, { status: 500 })
    }
    const invite = Array.isArray(inviteRows) ? inviteRows[0] : inviteRows
    if (!invite || typeof invite.id !== "string") {
      return NextResponse.json({ error: "Invitación no encontrada o ya revocada" }, { status: 404 })
    }
    if (invite.member_email !== user.email.toLowerCase()) {
      return NextResponse.json(
        { error: "Esta invitación fue enviada a otro correo" },
        { status: 403 },
      )
    }
    if (invite.owner_user_id === user.id) {
      return NextResponse.json({ error: "No puedes ser miembro de tu propio panel" }, { status: 400 })
    }

    // Un usuario solo puede ser miembro activo de un panel a la vez.
    const { data: activeRows } = await service
      .from("panel_members")
      .select("id")
      .eq("member_user_id", user.id)
      .eq("status", "activo")
      .limit(1)
    const alreadyActive = Array.isArray(activeRows) ? activeRows[0] : activeRows
    if (alreadyActive && alreadyActive.id !== invite.id) {
      return NextResponse.json(
        { error: "Ya eres miembro activo de otro panel; pide que te revoquen primero" },
        { status: 409 },
      )
    }

    const { error: updateError } = await service
      .from("panel_members")
      .update({
        member_user_id: user.id,
        status: "activo",
        updated_at: new Date().toISOString(),
      })
      .eq("id", invite.id)
    if (updateError) {
      logger.error("Panel members accept update error:", updateError)
      return NextResponse.json({ error: "Error al aceptar la invitación" }, { status: 500 })
    }

    return NextResponse.json({ accepted: true })
  } catch (err) {
    logger.error("Panel members accept POST error:", err)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
