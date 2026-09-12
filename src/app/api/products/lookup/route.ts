import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/service"
import { rateLimited, clientIp, rateLimitResponse } from "@/lib/rate-limit"
import { logger } from "@/lib/logger"

/**
 * GET /api/products/lookup?ids=1,2,3
 *
 * Devuelve el estado ACTUAL del catálogo (nombre, slug, imagen, precio,
 * oferta y stock) para una lista de productos. Lo usa "Repetir pedido"
 * del historial para rehidratar los items con los precios de hoy en vez
 * de los precios históricos congelados del pedido — el servidor
 * recalcula el subtotal con precios actuales y rechaza la orden si
 * difiere (C3). Son datos públicos del catálogo.
 */
export async function GET(req: NextRequest) {
  const supabase = await createServiceClient()

  const rate = await rateLimited(supabase, `products-lookup:${clientIp(req)}`, 30, 60)
  if (!rate.allowed) {
    return rateLimitResponse(rate)
  }

  const ids = (req.nextUrl.searchParams.get("ids") ?? "")
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0)
    .slice(0, 100)

  if (ids.length === 0) {
    return NextResponse.json({ products: [] })
  }

  const { data, error } = await supabase
    .from("products")
    .select("id, name, slug, image_url, price, sale_price, stock_status")
    .in("id", ids)

  if (error) {
    logger.error("products/lookup error:", error)
    return NextResponse.json({ error: "Error al consultar el catálogo" }, { status: 500 })
  }

  return NextResponse.json({ products: data ?? [] })
}
