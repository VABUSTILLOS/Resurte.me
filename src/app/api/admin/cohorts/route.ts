import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/admin-auth"
import { createServiceClient } from "@/lib/supabase/service"
import { buildCohorts, type OrderRow } from "@/lib/admin-cohorts"
import { logger } from "@/lib/logger"

export const runtime = "nodejs"

export async function GET(request: Request) {
  try {
    const { response: adminDenied } = await requireAdmin()
    if (adminDenied) return adminDenied

    const { searchParams } = new URL(request.url)
    const months = Math.min(24, Math.max(3, Number(searchParams.get("months")) || 12))
    const since = new Date()
    since.setMonth(since.getMonth() - months)

    const supabase = await createServiceClient()
    const { data, error } = await supabase
      .from("orders")
      .select("user_id, created_at")
      .eq("payment_status", "paid")
      .gte("created_at", since.toISOString())
      .order("created_at", { ascending: true })

    if (error) {
      logger.error("[COHORTS] query error:", error)
      return NextResponse.json({ error: "No se pudieron cargar las cohortes" }, { status: 500 })
    }

    const cohorts = buildCohorts((data ?? []) as OrderRow[])
    return NextResponse.json(
      { months, cohorts },
      { headers: { "Cache-Control": "no-store" } }
    )
  } catch (err) {
    logger.error("[COHORTS] unexpected:", err)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
