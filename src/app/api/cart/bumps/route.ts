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
  // ?debug=1: página /diagnostico-bumps agrega el motivo real del fail-open
  // (o de un resultado vacío) al JSON, para cerrar el misterio "0 bumps
  // logueado". El contrato normal NO cambia (sin query param, sin campo extra).
  const debug = request.nextUrl.searchParams.get("debug") === "1"
  const debugResult = { reason: "" as string, detail: null as unknown }

  const failOpen = (reason: string, detail?: unknown) => {
    if (debug) {
      debugResult.reason = reason
      debugResult.detail = detail ?? null
    }
    return NextResponse.json({ bumps: [], ...(debug ? { _debug: debugResult } : {}) })
  }

  try {
    const body = await request.json()
    const { items } = body as {
      city_id?: number
      items?: { product_id: number; quantity: number }[]
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return failOpen("items_vacio_o_no_array", { itemsType: typeof items, isArray: Array.isArray(items), length: Array.isArray(items) ? items.length : null })
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
      return failOpen("items_invalidos", { recibidos: items })
    }

    const supabase = await createServiceClient()

    // Rate limit por IP (lectura ligera; no bloquear abusos de scraping).
    // 120/60s: el cliente re-consulta por cada cambio de carrito y el cliente
    // reintenta una vez con backoff ante 429, así que el límite no debe ser
    // tan bajo que un uso normal de revisión del carrito lo dispare.
    const rateKey = `bumps:${clientIp(request)}`
    const rate = await rateLimited(supabase, rateKey, 120, 60)
    if (!rate.allowed) {
      if (debug) {
        return NextResponse.json(
          { bumps: [], _debug: { reason: "rate_limit", detail: { remaining: rate.remaining, retry_after_seconds: rate.retry_after_seconds } } },
          { status: 429, headers: { "Retry-After": String(rate.retry_after_seconds) } },
        )
      }
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
    if (debug && bumps.length === 0) {
      return NextResponse.json({
        bumps: [],
        _debug: { reason: "resolveBumps_vacio", detail: { items: validItems } },
      })
    }
    return NextResponse.json({ bumps })
  } catch (error) {
    // Fail-open: nunca bloquear el checkout por errores de bumps.
    logger.warn("bumps error, fail-open", { error: error instanceof Error ? error.message : String(error) })
    return failOpen("excepcion_en_ruta", { error: error instanceof Error ? error.message : String(error) })
  }
}
