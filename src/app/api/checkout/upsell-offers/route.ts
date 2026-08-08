import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import { resolveUpsellOffers } from "@/lib/upsell-offers"
import { rateLimited, clientIp, rateLimitResponse } from "@/lib/rate-limit"
import { createServiceClient } from "@/lib/supabase/service"

/**
 * POST /api/checkout/upsell-offers
 *
 * Devuelve las ofertas 1-click post-compra (upsell + downsell) elegibles para
 * una orden YA pagada. Body: { order_id, guest_token? }
 *
 * El cliente solo envía order_id/guest_token; el servidor deriva producto,
 * descuento y precios de `bump_rules` + `products` (nunca acepta montos).
 * Fail-open: si la orden no admite upsell o hay cualquier error, responde
 * `{ upsell: null, downsell: null }` — el modal cae a la confirmación final
 * sin bloquear nada.
 *
 * Respuestas:
 *  200 { upsell: UpsellOffer | null, downsell: UpsellOffer | null }
 *  429 rate limited
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { order_id, guest_token } = body as {
      order_id?: number | string
      guest_token?: string
    }

    const orderId = Number(order_id)
    if (!Number.isInteger(orderId) || orderId <= 0) {
      return NextResponse.json({ upsell: null, downsell: null })
    }

    const supabase = await createServiceClient()
    const rateKey = `upsell-offers:${clientIp(request)}`
    const rate = await rateLimited(supabase, rateKey, 30, 60)
    if (!rate.allowed) {
      return rateLimitResponse(rate)
    }

    const authClient = await createClient()
    const {
      data: { user },
    } = await authClient.auth.getUser()

    const offers = await resolveUpsellOffers({
      orderId,
      userId: user?.id ?? null,
      guestToken: typeof guest_token === "string" && guest_token ? guest_token : null,
    })

    return NextResponse.json(offers)
  } catch (error) {
    // Fail-open: nunca bloquear la confirmación por errores de ofertas.
    logger.warn("upsell-offers error, fail-open", {
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json({ upsell: null, downsell: null })
  }
}
