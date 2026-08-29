import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/service"
import { logger } from "@/lib/logger"

export const runtime = "nodejs"

/**
 * GET /api/address/colonias?cp=XXXXX
 * Autocompletado de dirección: colonias + municipio/estado para un CP.
 * Catálogo público (sin PII). Fail-open: si la tabla postal_codes aún
 * no existe o no hay datos, devuelve lista vacía y el formulario sigue
 * funcionando en modo manual.
 */
export async function GET(request: NextRequest) {
  const cp = (request.nextUrl.searchParams.get("cp") ?? "").replace(/\D/g, "").slice(0, 5)
  if (cp.length !== 5) {
    return NextResponse.json({ neighborhoods: [] }, { status: 400 })
  }

  const empty = NextResponse.json(
    { neighborhoods: [], municipality: null, state: null },
    { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=3600" } },
  )

  try {
    const supabase = await createServiceClient()
    const { data, error } = await supabase
      .from("postal_codes")
      .select("neighborhood, municipality, state")
      .eq("zip_code", cp)
      .order("neighborhood")
      .limit(80)

    if (error) {
      // 42P01 = tabla inexistente (migración pendiente): degradar en silencio
      if (error.code !== "42P01") {
        logger.error("[COLONIAS] query error:", error)
      }
      return empty
    }

    const rows = data ?? []
    return NextResponse.json(
      {
        neighborhoods: rows.map((r: { neighborhood: string }) => r.neighborhood),
        municipality: rows[0]?.municipality ?? null,
        state: rows[0]?.state ?? null,
      },
      { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=3600" } },
    )
  } catch (err) {
    logger.error("[COLONIAS] unexpected error:", err)
    return empty
  }
}
