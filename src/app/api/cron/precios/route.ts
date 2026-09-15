import { NextRequest, NextResponse } from "next/server"
import { revalidateTag } from "next/cache"
import { isIsoDate, refreshPriceIndex } from "@/lib/price-index-refresh"
import { logger } from "@/lib/logger"

/**
 * GET /api/cron/precios
 *
 * Recalcula el snapshot del índice de precios (`refresh_price_index`,
 * migración 00091). Protegido con CRON_SECRET (fail closed).
 *
 * La corrida programada vive en el cron diario consolidado
 * (/api/cron/daily → job "price-index"): el plan Hobby de Vercel solo
 * permite crons diarios, así que un `0 6 * * 1` no se puede registrar.
 * Este endpoint queda para ejecución manual y para backfill de una fecha
 * concreta con ?fecha=YYYY-MM-DD.
 */

export const maxDuration = 120

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization")
  const cronSecret = process.env.CRON_SECRET
  // Fail closed: sin CRON_SECRET configurado el endpoint no se expone.
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const fecha = req.nextUrl.searchParams.get("fecha") ?? undefined
  if (fecha && !isIsoDate(fecha)) {
    return NextResponse.json(
      { error: "Parámetro fecha inválido (se espera YYYY-MM-DD)." },
      { status: 400 }
    )
  }

  try {
    const result = await refreshPriceIndex(fecha ? { fecha } : undefined)
    if (result.status === "ok") {
      // Las páginas /precios* están cacheadas con el tag "price-index".
      revalidateTag("price-index", "max")
    }
    return NextResponse.json(result)
  } catch (err) {
    logger.error("[CRON-PRECIOS] error:", err)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}
