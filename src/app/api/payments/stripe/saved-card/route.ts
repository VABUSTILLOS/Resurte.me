import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"
import { getStripe } from "@/lib/stripe"
import { logger } from "@/lib/logger"
import { rateLimited, rateLimitResponse, clientIp } from "@/lib/rate-limit"

/**
 * GET /api/payments/stripe/saved-card
 *
 * Devuelve si el usuario autenticado tiene una tarjeta guardada (de una orden
 * pagada previa) y, cuando es posible, los últimos 4 dígitos y la marca para
 * mostrarlos en el botón de Express Checkout.
 *
 * Respuestas:
 *  · 401 → sin sesión activa.
 *  · { hasSavedCard: false } → sin tarjeta guardada (oculta el botón Express).
 *  · { hasSavedCard: true, last4, brand } → tarjeta reutilizable.
 *
 * Nunca lanza: si Stripe no puede resolver los detalles de la tarjeta, se
 * devuelve hasSavedCard: true sin last4/brand (el botón sigue funcionando).
 */
export async function GET(request: NextRequest) {
  const supabaseClient = await createClient()
  const {
    data: { user },
  } = await supabaseClient.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  // Rate limit: 20 requests per minute per user
  const ip = clientIp(request)
  const rlKey = `saved-card:${user.id}:${ip}`
  const rl = await rateLimited(await createServiceClient(), rlKey, 20, 60)
  if (!rl.allowed) {
    return rateLimitResponse(rl)
  }

  try {
    const supabase = await createServiceClient()
    const { data: prior } = await supabase
      .from("orders")
      .select("stripe_payment_method_id")
      .eq("user_id", user.id)
      .eq("payment_status", "paid")
      .not("stripe_payment_method_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!prior?.stripe_payment_method_id) {
      return NextResponse.json({ hasSavedCard: false })
    }

    // Detalles de la tarjeta (opcionales, fail-open).
    try {
      const pm = await getStripe().paymentMethods.retrieve(
        prior.stripe_payment_method_id
      )
      if (pm.type === "card" && pm.card) {
        return NextResponse.json({
          hasSavedCard: true,
          last4: pm.card.last4,
          brand: pm.card.brand,
        })
      }
    } catch {
      // Fail-open: el botón Express funciona aunque no se puedan mostrar los
      // detalles de la tarjeta.
      logger.warn("saved-card: no se pudieron resolver los detalles del PM")
    }

    return NextResponse.json({ hasSavedCard: true })
  } catch (error) {
    logger.error("saved-card error:", error)
    return NextResponse.json({ hasSavedCard: false })
  }
}
