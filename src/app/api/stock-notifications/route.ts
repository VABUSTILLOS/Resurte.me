import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"
import { logger } from "@/lib/logger"
import { rateLimited, clientIp, rateLimitResponse } from "@/lib/rate-limit"
import { isMissingRelationError } from "@/lib/sale-window"
import { normalizeMxPhoneForApi } from "@/lib/stock-notifications"

/**
 * POST /api/stock-notifications
 *
 * Suscribe un WhatsApp al aviso «ya hay de nuevo» de un producto
 * agotado (botón de la ficha). La suscripción queda pendiente en
 * `stock_notifications` (migración 00230) y la dispara
 * processStockNotifications cuando el stock vuelve a ser > 0.
 *
 * Body: { product_id, phone }
 * - Con sesión, el teléfono puede omitirse si el perfil lo tiene.
 * - Idempotente: el índice único parcial de la migración hace que
 *   suscribirse dos veces al mismo aviso pendiente sea un no-op.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServiceClient()

    const rate = await rateLimited(supabase, `stocknotify:${clientIp(request)}`, 20, 60)
    if (!rate.allowed) {
      return rateLimitResponse(rate)
    }

    const body = (await request.json().catch(() => null)) as {
      product_id?: unknown
      phone?: unknown
    } | null
    const productId = Number(body?.product_id)
    if (!Number.isInteger(productId) || productId <= 0) {
      return NextResponse.json({ error: "Producto inválido" }, { status: 400 })
    }

    // Usuario con sesión (opcional): liga la suscripción a su
    // cuenta y puede aportar el teléfono de su perfil.
    const supabaseAuth = await createClient()
    const {
      data: { user },
    } = await supabaseAuth.auth.getUser()

    let rawPhone = typeof body?.phone === "string" ? body.phone : ""
    if (!rawPhone.trim() && user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("phone")
        .eq("id", user.id)
        .maybeSingle()
      rawPhone = (profile as { phone?: string | null } | null)?.phone ?? ""
    }
    const phone = normalizeMxPhoneForApi(rawPhone)
    if (!phone) {
      return NextResponse.json(
        { error: "Escribe tu WhatsApp a 10 dígitos para avisarte" },
        { status: 400 }
      )
    }

    const { data: product, error: productError } = await supabase
      .from("products")
      .select("id, stock_status")
      .eq("id", productId)
      .maybeSingle()
    if (productError) {
      logger.error("Stock notification: product fetch error:", productError)
      return NextResponse.json({ error: "Error al registrar el aviso" }, { status: 500 })
    }
    if (!product) {
      return NextResponse.json({ error: "El producto no existe" }, { status: 404 })
    }

    const { error: insertError } = await supabase.from("stock_notifications").insert({
      product_id: productId,
      phone,
      user_id: user?.id ?? null,
    })
    if (insertError) {
      if (isMissingRelationError(insertError)) {
        // Migración 00230 pendiente: la función aún no está activa.
        return NextResponse.json(
          { error: "Los avisos de disponibilidad aún no están activos" },
          { status: 503 }
        )
      }
      // 23505 = ya estaba suscrito a este aviso pendiente: éxito.
      if ((insertError as { code?: string }).code !== "23505") {
        logger.error("Stock notification: insert error:", insertError)
        return NextResponse.json({ error: "Error al registrar el aviso" }, { status: 500 })
      }
    }

    return NextResponse.json({ ok: true }, { status: 201 })
  } catch (error) {
    logger.error("Stock notification error:", error)
    return NextResponse.json({ error: "Error interno al registrar el aviso" }, { status: 500 })
  }
}
