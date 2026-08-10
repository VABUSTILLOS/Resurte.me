import { NextResponse, type NextRequest } from "next/server"
import { createServiceClient } from "@/lib/supabase/service"
import { resolveBumps } from "@/lib/order-bumps"
import { rateLimited, clientIp, rateLimitResponse } from "@/lib/rate-limit"
import { logger } from "@/lib/logger"

/**
 * POST /api/cart/bumps
 *
 * Devuelve hasta 3 order bumps condicionales para el carrito actual.
 * Body: { city_id?: number, items: [{ product_id, quantity }] }
 *
 * El cliente solo envía IDs/cantidades; el servidor deriva reglas, precios y
 * stock de la BD (nunca acepta precios del cliente). Fail-open: si la BD
 * falla devuelve bumps vacíos para no bloquear el checkout.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { items } = body as {
      city_id?: number
      items?: { product_id: number; quantity: number }[]
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ bumps: [] })
    }

    const validItems = items
      .filter(
        (i) =>
          typeof i?.product_id === "number" &&
          Number.isInteger(i.product_id) &&
          typeof i?.quantity === "number" &&
          i.quantity > 0
      )
      .map((i) => ({ product_id: i.product_id, quantity: i.quantity }))

    if (validItems.length === 0) {
      return NextResponse.json({ bumps: [] })
    }

    const supabase = await createServiceClient()

    // Rate limit por IP (lectura ligera; no bloquear abusos de scraping).
    // 120/60s: el cliente re-consulta por cada cambio de carrito y el cliente
    // reintenta una vez con backoff ante 429, así que el límite no debe ser
    // tan bajo que un uso normal de revisión del carrito lo dispare.
    const rateKey = `bumps:${clientIp(request)}`
    const rate = await rateLimited(supabase, rateKey, 120, 60)
    if (!rate.allowed) {
      return rateLimitResponse(rate)
    }

    const bumps = await resolveBumps({ items: validItems })
    // Log del resultado para poder correlacionar en Vercel si el navegador del
    // usuario recibe bumps (clave del diagnóstico "no veo bumps logueado").
    logger.info("[BUMPS] served", {
      items: validItems.map((i) => i.product_id),
      bumpCount: bumps.length,
      rules: bumps.map((b) => `${b.ruleId}:${b.trigger_type}`),
    })
    return NextResponse.json({ bumps })
  } catch (error) {
    // Fail-open: nunca bloquear el checkout por errores de bumps.
    logger.warn("bumps error, fail-open", { error: error instanceof Error ? error.message : String(error) })
    return NextResponse.json({ bumps: [] })
  }
}
