/**
 * Bandeja de WhatsApp de la tienda — lista de conversaciones (Ola 6)
 * GET /api/whatsapp/inbox — conversaciones agrupadas por teléfono
 * desde whatsapp_messages, con estado de ventana, necesidad de
 * respuesta y pausa del bot. La lógica vive en
 * src/lib/whatsapp-inbox.ts; aquí solo auth + forma de respuesta.
 */

import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/admin-auth"
import { createServiceClient } from "@/lib/supabase/service"
import { listWhatsAppConversations } from "@/lib/whatsapp-inbox"
import { logger } from "@/lib/logger"

export async function GET() {
  const { response: adminDenied } = await requireAdmin({ permission: "marketing" })
  if (adminDenied) return adminDenied

  try {
    const supabase = await createServiceClient()
    const conversations = await listWhatsAppConversations(supabase)
    return NextResponse.json({ conversations })
  } catch (err) {
    logger.error("whatsapp inbox: list failed", {
      error: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json(
      { error: "No se pudieron cargar las conversaciones" },
      { status: 500 }
    )
  }
}
