import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/admin-auth"
import { getAdminCityPerformance } from "@/app/admin/actions"
import { logger } from "@/lib/logger"

export const runtime = "nodejs"

const DEFAULT_DAYS = 30

/** Desempeño por ciudad del dashboard admin (ventana 7/30/90 días). */
export async function GET(request: Request) {
  try {
    const { response: adminDenied } = await requireAdmin()
    if (adminDenied) return adminDenied

    const { searchParams } = new URL(request.url)
    const raw = Number(searchParams.get("days"))
    // Cualquier valor fuera del allowlist cae al default en lugar de fallar:
    // es una vista de lectura y el selector solo manda 7/30/90.
    const days = raw === 7 || raw === 30 || raw === 90 ? raw : DEFAULT_DAYS

    const performance = await getAdminCityPerformance(days)
    return NextResponse.json(performance, {
      headers: { "Cache-Control": "no-store" },
    })
  } catch (err) {
    logger.error("[CITY-PERFORMANCE] unexpected:", err)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
