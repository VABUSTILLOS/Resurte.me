import { NextResponse, type NextRequest } from "next/server"
import { requireAdmin } from "@/lib/admin-auth"
import { createServiceClient } from "@/lib/supabase/service"
import { logger } from "@/lib/logger"

export const runtime = "nodejs"

/** Tope del buscador: alimenta un <select>, no una tabla de datos. */
const SEARCH_LIMIT = 20

/**
 * GET /api/admin/bump-affinity/products?q=limon — buscador ligero de
 * productos (id, name, slug) para el picker de pares de afinidad.
 * Requiere sesión admin.
 */
export async function GET(request: NextRequest) {
  const { response: adminDenied } = await requireAdmin({ permission: "marketing" })
  if (adminDenied) return adminDenied

  try {
    const q = (request.nextUrl.searchParams.get("q") ?? "").trim()
    const supabase = await createServiceClient()
    let query = supabase
      .from("products")
      .select("id, name, slug")
      .is("deleted_at", null)
      .order("name", { ascending: true })
      .limit(SEARCH_LIMIT)
    if (q) query = query.ilike("name", `%${q}%`)

    const { data, error } = await query
    if (error) throw error
    return NextResponse.json({ products: data ?? [] })
  } catch (error) {
    logger.error("[ADMIN-BUMP-AFFINITY] product search error:", error)
    return NextResponse.json({ error: "Error al buscar productos" }, { status: 500 })
  }
}
