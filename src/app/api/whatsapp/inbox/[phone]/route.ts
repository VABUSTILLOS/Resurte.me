/**
 * Bandeja de WhatsApp de la tienda — detalle de una conversación (Ola 6)
 * GET /api/whatsapp/inbox/[phone] — hilo completo con marcas de
 * autor (cliente / IA / bot / automático / equipo), estado de la
 * ventana de 24 h, pausa del bot y plantillas aprobadas.
 * [phone] es la llave de la conversación (últimos 10 dígitos).
 */

import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/admin-auth"
import { createServiceClient } from "@/lib/supabase/service"
import { getWhatsAppConversation } from "@/lib/whatsapp-inbox"
import { phoneKey } from "@/lib/crm-core"
import { logger } from "@/lib/logger"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ phone: string }> }
) {
  const { response: adminDenied } = await requireAdmin({ permission: "marketing" })
  if (adminDenied) return adminDenied

  const { phone } = await params
  const key = phoneKey(phone)
  if (!key) {
    return NextResponse.json({ error: "Teléfono inválido" }, { status: 400 })
  }

  try {
    const supabase = await createServiceClient()
    const conversation = await getWhatsAppConversation(supabase, key)
    if (!conversation) {
      return NextResponse.json(
        { error: "Conversación no encontrada" },
        { status: 404 }
      )
    }
    return NextResponse.json({ conversation })
  } catch (err) {
    logger.error("whatsapp inbox: detail failed", {
      error: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json(
      { error: "No se pudo cargar la conversación" },
      { status: 500 }
    )
  }
}
