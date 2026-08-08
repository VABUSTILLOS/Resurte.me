import { NextResponse, type NextRequest } from "next/server"
import { createServiceClient } from "@/lib/supabase/service"
import { createClient } from "@/lib/supabase/server"
import { rateLimited, clientIp, rateLimitResponse } from "@/lib/rate-limit"
import { logger } from "@/lib/logger"

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const SOURCES = new Set(["checkout_drawer", "exit_intent"])

/**
 * POST /api/leads
 *
 * Captura leads del checkout drawer sin interrumpir el flujo de compra:
 *   · source 'checkout_drawer' → email capturado con onBlur en el paso de
 *     dirección (el usuario aún no ha pagado).
 *   · source 'exit_intent'     → email + cupón capturados en el modal de
 *     abandono.
 * Body: { email, phone?, source?, coupon_code? }
 *
 * Fail-open: si la BD falla se responde 200 de todas formas — la captura de
 * leads nunca debe bloquear el checkout.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : ""
    const phone = typeof body?.phone === "string" ? body.phone.trim() : ""
    const source = typeof body?.source === "string" ? body.source : "checkout_drawer"
    const couponCode = typeof body?.coupon_code === "string" ? body.coupon_code.trim() : ""

    if (!EMAIL_RE.test(email)) {
      return NextResponse.json({ error: "Email inválido" }, { status: 400 })
    }
    if (!SOURCES.has(source)) {
      return NextResponse.json({ error: "source inválido" }, { status: 400 })
    }

    const supabase = await createServiceClient()

    const rateKey = `leads:${clientIp(request)}`
    const rate = await rateLimited(supabase, rateKey, 10, 60)
    if (!rate.allowed) {
      return rateLimitResponse(rate)
    }

    // user_id se llena si hay sesión activa (opcional; el lead puede ser
    // visitante anónimo). Se hace con el cliente de sesión para no confiar
    // en el body para identificar usuarios.
    let userId: string | null = null
    const authClient = await createClient()
    const {
      data: { user },
    } = await authClient.auth.getUser()
    if (user) userId = user.id

    const insert: Record<string, unknown> = { email, source }
    if (phone) insert.phone = phone
    if (couponCode) insert.coupon_code = couponCode
    if (userId) insert.user_id = userId

    const { error } = await supabase.from("leads").insert(insert)
    if (error) {
      logger.warn("leads insert failed, fail-open", { error: error.message })
    }

    // La recuperación del carrito abandonado es responsabilidad de un
    // workflow externo (webhook/email-workflows) que consulta `leads`;
    // aquí solo registramos el lead.
    return NextResponse.json({ ok: true })
  } catch (error) {
    // Fail-open: nunca bloquear el checkout por la captura de leads.
    logger.warn("leads error, fail-open", { error: error instanceof Error ? error.message : String(error) })
    return NextResponse.json({ ok: true })
  }
}
