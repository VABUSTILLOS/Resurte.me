import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import { sanitizeStoredBumps } from "@/lib/bumps-sync"
import { MAX_STORED_BUMPS } from "@/lib/checkout-config"

export const runtime = "nodejs"

/**
 * PUT /api/cart/bumps/selection — bumps seleccionados del usuario con sesión.
 *
 * Endpoint dedicado (en vez de un campo opcional en `PUT /api/cart`) para que
 * carrito y bumps tengan cada uno su propio last-write-wins: el carrito es
 * replace-all de `items`/`coupon` y comparte `updated_at`, así que un push del
 * carrito podría pisar una selección de bumps recién hecha (y viceversa). Aquí
 * el timestamp independiente es `bumps_updated_at`.
 *
 * Body: { bumps: SelectedBump[] }
 *   - replace-all: `bumps` ES la selección completa (no un diff).
 *   - `[]` limpia la selección (estado válido e intencional).
 *   - Cap de MAX_STORED_BUMPS y validación de forma (ruleId, productId,
 *     quantity 0..999, unitPrice >= 0). Los precios NO se confían a ciegas: el
 *     servidor los recalcula al crear el pedido (`POST /api/orders`).
 */
export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    }

    const body = await request.json().catch(() => null)
    const bumps = sanitizeStoredBumps(body?.bumps)
    if (!bumps) {
      return NextResponse.json(
        {
          error: `bumps debe ser un arreglo de {ruleId, productId, quantity, unitPrice} (máx. ${MAX_STORED_BUMPS})`,
        },
        { status: 400 }
      )
    }

    const { data, error } = await supabase
      .from("user_carts")
      .upsert(
        { user_id: user.id, bumps, bumps_updated_at: new Date().toISOString() },
        { onConflict: "user_id" }
      )
      .select("bumps_updated_at")
      .single()

    if (error) {
      logger.error("[CART_BUMPS] PUT error:", error)
      return NextResponse.json(
        { error: "No se pudieron guardar los artículos especiales" },
        { status: 500 }
      )
    }

    return NextResponse.json({ ok: true, updated_at: data.bumps_updated_at })
  } catch (err) {
    logger.error("[CART_BUMPS] PUT unexpected:", err)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
