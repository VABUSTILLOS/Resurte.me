import { NextRequest, NextResponse } from "next/server"

import { applePassImages, loadWalletCardByToken } from "@/lib/foodos-wallet/passes"
import { appleWalletConfig, buildApplePass } from "@/lib/foodos-wallet/apple"
import { createServiceClient } from "@/lib/supabase/service"
import { clientIp, rateLimitResponse, rateLimited } from "@/lib/rate-limit"
import { logger } from "@/lib/logger"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Descarga del pase de Apple.
 *
 * Sin certificados (`APPLE_WALLET_*`) responde 501 en vez de un pase roto: la
 * tarjeta web sigue funcionando y el botón simplemente no se ofrece.
 *
 * El token es una capability URL: quien lo tiene ve la tarjeta, pero no puede
 * hacer nada más. Aun así se limita por IP para que no sirva de oráculo.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params

    const config = appleWalletConfig()
    if (!config) {
      return NextResponse.json(
        { error: "Apple Wallet no está configurado" },
        { status: 501 }
      )
    }

    const supabase = await createServiceClient()
    const rate = await rateLimited(supabase, `wallet_apple:${clientIp(request)}`, 30, 60)
    if (!rate.allowed) return rateLimitResponse(rate)

    const context = await loadWalletCardByToken(supabase, token)
    if (!context) {
      return NextResponse.json({ error: "Tarjeta no encontrada" }, { status: 404 })
    }

    const bytes = await buildApplePass({
      card: context.card,
      config,
      images: applePassImages(context.card),
    })
    if (!bytes) {
      return NextResponse.json({ error: "No se pudo generar el pase" }, { status: 502 })
    }

    return new NextResponse(Buffer.from(bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.apple.pkpass",
        "Content-Disposition": `attachment; filename="${context.pass.serial}.pkpass"`,
        "Cache-Control": "private, no-store",
      },
    })
  } catch (err) {
    logger.error("[Wallet] Falló la descarga del pase de Apple", err)
    return NextResponse.json({ error: "Error inesperado" }, { status: 500 })
  }
}
