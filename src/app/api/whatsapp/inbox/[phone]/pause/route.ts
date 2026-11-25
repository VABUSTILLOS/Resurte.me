/**
 * Bandeja de WhatsApp de la tienda — pausa del bot por conversación (Ola 6)
 * POST /api/whatsapp/inbox/[phone]/pause — Body: { paused: boolean }
 *
 * Pausar apaga solo lo conversacional del bot (palabras clave,
 * asistente con IA, menú); lo transaccional sigue su curso. La
 * pausa vive en whatsapp_conversation_controls (migración
 * 00235): sin ella, esta ruta responde 409 declarándolo.
 */

import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/admin-auth"
import { createServiceClient } from "@/lib/supabase/service"
import { setBotPaused } from "@/lib/whatsapp-conversation-controls"
import { logAdminAction } from "@/lib/audit-log"
import { phoneKey } from "@/lib/crm-core"
import { logger } from "@/lib/logger"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ phone: string }> }
) {
  const { user, response: adminDenied } = await requireAdmin({
    permission: "marketing",
  })
  if (adminDenied) return adminDenied

  const { phone } = await params
  const key = phoneKey(phone)
  if (!key) {
    return NextResponse.json({ error: "Teléfono inválido" }, { status: 400 })
  }

  let payload: { paused?: unknown }
  try {
    payload = (await req.json()) as typeof payload
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 })
  }
  if (typeof payload.paused !== "boolean") {
    return NextResponse.json(
      { error: "Falta el campo paused (true/false)" },
      { status: 400 }
    )
  }

  try {
    const supabase = await createServiceClient()
    const result = await setBotPaused(supabase, key, payload.paused, user?.id ?? null)
    if (!result.ok) {
      if (result.reason === "missing_schema") {
        return NextResponse.json(
          {
            error:
              "La pausa por conversación necesita la migración 00235, que aún no se aplica.",
          },
          { status: 409 }
        )
      }
      return NextResponse.json(
        { error: "No se pudo guardar la pausa" },
        { status: 500 }
      )
    }

    await logAdminAction(supabase, {
      actorId: user?.id ?? null,
      actorEmail: user?.email ?? null,
      action: payload.paused
        ? "whatsapp_inbox_bot_paused"
        : "whatsapp_inbox_bot_resumed",
      entity: "whatsapp_conversation_controls",
      entityId: key,
      detail: { paused: payload.paused },
    })

    return NextResponse.json({ ok: true, paused: payload.paused })
  } catch (err) {
    logger.error("whatsapp inbox: pause failed", {
      error: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json(
      { error: "No se pudo guardar la pausa" },
      { status: 500 }
    )
  }
}
