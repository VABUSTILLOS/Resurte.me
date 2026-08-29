import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/admin-auth"
import { getAdminMetrics } from "@/app/admin/actions"

/**
 * GET /api/admin/metrics?period=daily|weekly|monthly&from=ISO&to=ISO
 *
 * Métricas agregadas para el dashboard admin. Requiere sesión admin
 * (requireAdmin). Reutiliza la server action getAdminMetrics que consulta
 * con service_role y agrega por día/semana/mes.
 */
export async function GET(request: Request) {
  try {
    const { response: adminDenied } = await requireAdmin()
    if (adminDenied) {
      return adminDenied
    }

    const { searchParams } = new URL(request.url)
    const rawPeriod = searchParams.get("period") ?? "daily"
    const period = ["daily", "weekly", "monthly"].includes(rawPeriod)
      ? (rawPeriod as "daily" | "weekly" | "monthly")
      : "daily"
    const from = searchParams.get("from") ?? undefined
    const to = searchParams.get("to") ?? undefined

    const metrics = await getAdminMetrics({ period, from, to })
    return NextResponse.json(metrics)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error interno del servidor"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
