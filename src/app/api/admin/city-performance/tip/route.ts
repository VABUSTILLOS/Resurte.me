import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/admin-auth"
import { getAdminCityTip } from "@/app/admin/actions"
import { KieAiError, isKieAiConfigured } from "@/lib/ai/kie-ai"
import { logger } from "@/lib/logger"

export const runtime = "nodejs"
// El LLM tarda más que una lectura normal: se le da margen antes de que la
// plataforma corte la función.
export const maxDuration = 60

/**
 * POST /api/admin/city-performance/tip
 * Tip de IA bajo demanda para una ciudad. Body: { cityId, days }.
 * Las métricas se recalculan en el servidor: el cliente nunca manda números.
 */
export async function POST(request: Request) {
  try {
    const { response: adminDenied } = await requireAdmin()
    if (adminDenied) return adminDenied

    if (!isKieAiConfigured()) {
      return NextResponse.json(
        {
          error: "KIE_AI_API_KEY no está configurada. Ver docs/KIE_AI.md.",
        },
        { status: 503 }
      )
    }

    const json = (await request.json().catch(() => null)) as {
      cityId?: unknown
      days?: unknown
    } | null

    const cityId = Number(json?.cityId)
    if (!Number.isInteger(cityId) || cityId <= 0) {
      return NextResponse.json({ error: "Se requiere cityId válido" }, { status: 400 })
    }

    const rawDays = Number(json?.days)
    const days = rawDays === 7 || rawDays === 30 || rawDays === 90 ? rawDays : 30

    const tip = await getAdminCityTip({ cityId, days })
    return NextResponse.json(tip, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    if (error instanceof KieAiError) {
      logger.error("[CITY-PERFORMANCE] Kie.ai error:", error)
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    if (error instanceof Error && error.message === "Ciudad no encontrada") {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }
    logger.error("[CITY-PERFORMANCE] tip unexpected:", error)
    return NextResponse.json({ error: "No se pudo generar el tip" }, { status: 500 })
  }
}
