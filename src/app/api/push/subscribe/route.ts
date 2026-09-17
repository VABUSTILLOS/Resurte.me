import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"
import { logger } from "@/lib/logger"
import { pushSubscriptionToRow } from "@/lib/push"

export const runtime = "nodejs"

/**
 * /api/push/subscribe — alta y baja de suscripciones Web Push (W9).
 *
 * POST   → body { endpoint, keys: { p256dh, auth } } — registra este navegador.
 * DELETE → body { endpoint } — lo da de baja.
 *
 * La escritura va por service_role a propósito: la tabla tiene RLS con SELECT
 * y DELETE propios, pero sin política de INSERT, así que la clave anónima no
 * puede reclamar el endpoint de otra persona en un dispositivo compartido.
 * Aquí la identidad la aporta la sesión, no el cliente.
 */

function parseEndpoint(raw: unknown): string | null {
  if (typeof raw !== "string") return null
  const endpoint = raw.trim()
  return endpoint.length > 0 ? endpoint : null
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
    const row = pushSubscriptionToRow({
      endpoint: body?.endpoint,
      keys: { p256dh: body?.keys?.p256dh, auth: body?.keys?.auth },
    })
    if (!row) {
      return NextResponse.json({ error: "Suscripción inválida" }, { status: 400 })
    }

    const service = await createServiceClient()
    const { error } = await service.from("push_subscriptions").upsert(
      {
        user_id: user.id,
        endpoint: row.endpoint,
        p256dh: row.p256dh,
        auth: row.auth,
        user_agent: request.headers.get("user-agent")?.slice(0, 300) ?? null,
        failure_count: 0,
        last_used_at: new Date().toISOString(),
      },
      { onConflict: "endpoint" }
    )

    if (error) {
      if (error.code === "42P01") {
        return NextResponse.json({ error: "Push no disponible" }, { status: 503 })
      }
      logger.error("[PUSH] POST error:", error)
      return NextResponse.json({ error: "No se pudo activar los avisos" }, { status: 500 })
    }

    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } })
  } catch (err) {
    logger.error("[PUSH] POST unexpected:", err)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    }

    const body = await request.json().catch(() => null)
    const endpoint = parseEndpoint(body?.endpoint)
    if (!endpoint) {
      return NextResponse.json({ error: "endpoint inválido" }, { status: 400 })
    }

    // Filtrado por user_id: nadie da de baja el navegador de otra persona.
    const service = await createServiceClient()
    const { error } = await service
      .from("push_subscriptions")
      .delete()
      .eq("endpoint", endpoint)
      .eq("user_id", user.id)

    if (error && error.code !== "42P01") {
      logger.error("[PUSH] DELETE error:", error)
      return NextResponse.json({ error: "No se pudieron desactivar los avisos" }, { status: 500 })
    }

    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } })
  } catch (err) {
    logger.error("[PUSH] DELETE unexpected:", err)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
