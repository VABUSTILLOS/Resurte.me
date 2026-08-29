import { NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/service"
import { logger } from "@/lib/logger"

export const runtime = "nodejs"

/**
 * GET /api/social-proof
 * Prueba social para el checkout: número de pedidos entregados en los
 * últimos 7 días. Dato agregado (sin PII), cacheado 1 hora en CDN.
 * Fail-open: ante cualquier error devuelve 0 para que el badge se oculte.
 */
export async function GET() {
  try {
    const supabase = await createServiceClient()
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

    const { count, error } = await supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("status", "delivered")
      .gte("created_at", weekAgo)

    if (error) {
      logger.error("[SOCIAL-PROOF] count error:", error)
      return NextResponse.json(
        { deliveredLast7Days: 0 },
        { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=300" } },
      )
    }

    return NextResponse.json(
      { deliveredLast7Days: count ?? 0 },
      { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=300" } },
    )
  } catch (err) {
    logger.error("[SOCIAL-PROOF] unexpected error:", err)
    return NextResponse.json({ deliveredLast7Days: 0 }, { status: 200 })
  }
}
