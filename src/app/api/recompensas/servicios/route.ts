import { NextResponse } from "next/server"
import { getRewardServices } from "@/lib/reward-services"

export const runtime = "nodejs"

/**
 * GET /api/recompensas/servicios — catálogo público de la Tienda de
 * Crecimiento (reward_services activos; fallback al catálogo estático).
 */
export async function GET() {
  const services = await getRewardServices()
  return NextResponse.json(
    { services },
    { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } }
  )
}
