import { NextRequest, NextResponse } from "next/server"

import { loadWalletCardByToken } from "@/lib/foodos-wallet/passes"
import { buildGoogleSaveUrl, googleWalletConfig } from "@/lib/foodos-wallet/google"
import { createServiceClient } from "@/lib/supabase/service"
import { clientIp, rateLimitResponse, rateLimited } from "@/lib/rate-limit"
import { logger } from "@/lib/logger"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Guardado del pase en Google Wallet.
 *
 * Google no descarga archivos: se redirige a `pay.google.com/gp/v/save/<jwt>`,
 * donde el JWT **lleva la tarjeta dentro**. Por eso la URL no es cacheable ni
 * compartible: caduca y es específica de este comensal.
 *
 * Sin credenciales responde 501 y el botón no se ofrece.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params

    const config = googleWalletConfig()
    if (!config) {
      return NextResponse.json(
        { error: "Google Wallet no está configurado" },
        { status: 501 }
      )
    }

    const supabase = await createServiceClient()
    const rate = await rateLimited(supabase, `wallet_google:${clientIp(request)}`, 30, 60)
    if (!rate.allowed) return rateLimitResponse(rate)

    const context = await loadWalletCardByToken(supabase, token)
    if (!context) {
      return NextResponse.json({ error: "Tarjeta no encontrada" }, { status: 404 })
    }

    const url = buildGoogleSaveUrl(context.card, config)
    if (!url) {
      return NextResponse.json({ error: "No se pudo generar el pase" }, { status: 502 })
    }

    return NextResponse.redirect(url, 302)
  } catch (err) {
    logger.error("[Wallet] Falló el guardado en Google Wallet", err)
    return NextResponse.json({ error: "Error inesperado" }, { status: 500 })
  }
}
