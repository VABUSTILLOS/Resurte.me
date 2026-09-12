import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/service"
import { logger } from "@/lib/logger"

export const runtime = "nodejs"

/**
 * POST /api/favorites/resolve — { ids: number[] } → productos visibles.
 *
 * La página /[ciudad]/favoritos del invitado guarda solo ids en
 * localStorage; este endpoint los resuelve contra el catálogo público
 * (solo productos is_visible) para pintar las cards. Sin auth: los ids
 * de producto no son datos privados y el listado es del propio cliente.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null)
    const ids: unknown = body?.ids
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ products: [] })
    }
    const clean = ids
      .map((v) => Number(v))
      .filter((n) => Number.isInteger(n) && n > 0)
      .slice(0, 100)

    if (clean.length === 0) {
      return NextResponse.json({ products: [] })
    }

    const supabase = await createServiceClient()
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .in("id", clean)
      .eq("is_visible", true)

    if (error) {
      logger.error("[FAVORITES-RESOLVE] query error:", error)
      return NextResponse.json({ error: "No se pudieron cargar los productos" }, { status: 500 })
    }

    return NextResponse.json(
      { products: data ?? [] },
      { headers: { "Cache-Control": "no-store" } }
    )
  } catch (err) {
    logger.error("[FAVORITES-RESOLVE] unexpected:", err)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
