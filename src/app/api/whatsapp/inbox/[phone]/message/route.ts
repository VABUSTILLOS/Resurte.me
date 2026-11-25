/**
 * Bandeja de WhatsApp de la tienda — responder desde el panel (Ola 6)
 * POST /api/whatsapp/inbox/[phone]/message
 * Body: { body } para texto libre (solo dentro de la ventana de
 * 24 h) o { templateName } para una plantilla aprobada (la única
 * vía fuera de ventana). La ventana se revalida en el servidor
 * (src/lib/whatsapp-inbox.ts), no en la interfaz.
 */

import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/admin-auth"
import { createServiceClient } from "@/lib/supabase/service"
import { sendWhatsAppInboxMessage } from "@/lib/whatsapp-inbox"
import { phoneKey } from "@/lib/crm-core"
import { logger } from "@/lib/logger"

const ERROR_MESSAGES: Record<string, { status: number; error: string }> = {
  requires_template: {
    status: 409,
    error:
      "La ventana de 24 h está cerrada: fuera de ella solo se puede enviar una plantilla aprobada.",
  },
  empty_message: { status: 400, error: "El mensaje está vacío." },
  template_not_found: { status: 404, error: "Esa plantilla no existe." },
  template_not_approved: {
    status: 409,
    error: "Esa plantilla aún no está aprobada por Meta.",
  },
  send_failed: {
    status: 502,
    error: "No se pudo enviar el mensaje. Inténtalo de nuevo.",
  },
}

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

  let payload: { body?: unknown; templateName?: unknown }
  try {
    payload = (await req.json()) as typeof payload
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 })
  }

  try {
    const supabase = await createServiceClient()
    const result = await sendWhatsAppInboxMessage(supabase, {
      key,
      body: typeof payload.body === "string" ? payload.body : undefined,
      templateName:
        typeof payload.templateName === "string" ? payload.templateName : undefined,
      actor: { id: user?.id ?? null, email: user?.email ?? null },
    })
    if (!result.ok) {
      const mapped =
        ERROR_MESSAGES[result.error] ??
        ({ status: 502, error: "No se pudo enviar el mensaje." } as const)
      return NextResponse.json({ error: mapped.error }, { status: mapped.status })
    }
    return NextResponse.json({ ok: true, messageId: result.messageId })
  } catch (err) {
    logger.error("whatsapp inbox: send failed", {
      error: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json(
      { error: "No se pudo enviar el mensaje" },
      { status: 500 }
    )
  }
}
