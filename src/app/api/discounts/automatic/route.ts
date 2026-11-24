import { NextResponse, type NextRequest } from "next/server"
import { createServiceClient } from "@/lib/supabase/service"
import { logger } from "@/lib/logger"
import { rateLimited, clientIp, rateLimitResponse } from "@/lib/rate-limit"
import { fetchActiveAutomaticDiscountRules } from "@/lib/automatic-discounts"
import {
  evaluateAutomaticDiscounts,
  type AutomaticDiscountLine,
} from "@/lib/coupon-rules"

/**
 * POST /api/discounts/automatic
 *
 * Cotiza los descuentos automáticos sin código (paquetes y
 * compra-X-llévate-Y) para el carrito. Es SOLO una cotización
 * para pintar el descuento en el carrito: al crear el pedido,
 * POST /api/orders RECALCULA con el mismo motor contra precios
 * de la BD y nunca confía en esta cifra.
 *
 * Body: { items: [{ product_id, quantity }] }
 * Respuesta: { discount_amount, applied: [{ rule_id, name, amount }] }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServiceClient()

    const rate = await rateLimited(supabase, `autodiscount:${clientIp(request)}`, 60, 60)
    if (!rate.allowed) {
      return rateLimitResponse(rate)
    }

    const body = (await request.json().catch(() => null)) as {
      items?: Array<{ product_id?: unknown; quantity?: unknown }>
    } | null
    const rawItems = Array.isArray(body?.items) ? body.items : []

    // Agrupa por producto (el carrito puede traer líneas repetidas)
    // y sanea cantidades al mismo rango que acepta POST /api/orders.
    const qtyByProduct = new Map<number, number>()
    for (const item of rawItems.slice(0, 100)) {
      const productId = Number(item?.product_id)
      const quantity = Math.floor(Number(item?.quantity))
      if (!Number.isInteger(productId) || productId <= 0) continue
      if (!Number.isFinite(quantity) || quantity < 1) continue
      qtyByProduct.set(
        productId,
        Math.min(99, (qtyByProduct.get(productId) ?? 0) + Math.min(99, quantity))
      )
    }
    if (qtyByProduct.size === 0) {
      return NextResponse.json({ discount_amount: 0, applied: [] })
    }

    const productIds = [...qtyByProduct.keys()]
    const { data: products, error } = await supabase
      .from("products")
      .select("id, price, sale_price")
      .in("id", productIds)
    if (error) {
      logger.error("Automatic discount quote: products fetch error:", error)
      return NextResponse.json({ error: "Error al cotizar descuentos" }, { status: 500 })
    }

    const priceById = new Map<number, number>()
    for (const p of (products ?? []) as Array<{ id: number; price: number; sale_price: number | null }>) {
      priceById.set(p.id, p.sale_price ?? p.price)
    }
    const lines: AutomaticDiscountLine[] = productIds
      .filter((id) => priceById.has(id))
      .map((id) => ({
        product_id: id,
        quantity: qtyByProduct.get(id) ?? 0,
        unit_price: priceById.get(id) ?? 0,
      }))

    const rules = await fetchActiveAutomaticDiscountRules(supabase)
    const quote = evaluateAutomaticDiscounts(rules, lines)
    return NextResponse.json({
      discount_amount: quote.discountAmount,
      applied: quote.applied,
    })
  } catch (error) {
    logger.error("Automatic discount quote error:", error)
    return NextResponse.json({ error: "Error interno al cotizar descuentos" }, { status: 500 })
  }
}
