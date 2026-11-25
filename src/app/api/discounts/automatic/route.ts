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
 * Body: { items: [{ product_id, quantity, variant_id? }] }
 * Respuesta: { discount_amount, applied: [{ rule_id, name, amount }] }
 *
 * Con presentación (00232) la línea se cotiza al precio de la
 * variante; el motor agrupa por producto, así que las
 * presentaciones del mismo producto suman para la regla.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServiceClient()

    const rate = await rateLimited(supabase, `autodiscount:${clientIp(request)}`, 60, 60)
    if (!rate.allowed) {
      return rateLimitResponse(rate)
    }

    const body = (await request.json().catch(() => null)) as {
      items?: Array<{ product_id?: unknown; quantity?: unknown; variant_id?: unknown }>
    } | null
    const rawItems = Array.isArray(body?.items) ? body.items : []

    // Sanea cantidades al mismo rango que acepta POST /api/orders.
    // Las líneas se conservan por presentación (el motor agrupa
    // por producto); sin variante, las repetidas de un producto se
    // suman como antes.
    interface QuoteLine {
      product_id: number
      variant_id: number | null
      quantity: number
    }
    const lineByKey = new Map<string, QuoteLine>()
    for (const item of rawItems.slice(0, 100)) {
      const productId = Number(item?.product_id)
      const quantity = Math.floor(Number(item?.quantity))
      if (!Number.isInteger(productId) || productId <= 0) continue
      if (!Number.isFinite(quantity) || quantity < 1) continue
      const variantIdRaw = Number(item?.variant_id)
      const variantId =
        Number.isInteger(variantIdRaw) && variantIdRaw > 0 ? variantIdRaw : null
      const key = `${productId}:${variantId ?? 0}`
      const current = lineByKey.get(key)
      if (current) {
        current.quantity = Math.min(99, current.quantity + Math.min(99, quantity))
      } else {
        lineByKey.set(key, {
          product_id: productId,
          variant_id: variantId,
          quantity: Math.min(99, quantity),
        })
      }
    }
    if (lineByKey.size === 0) {
      return NextResponse.json({ discount_amount: 0, applied: [] })
    }

    const quoteLines = [...lineByKey.values()]
    const productIds = [...new Set(quoteLines.map((l) => l.product_id))]
    const variantIds = [
      ...new Set(quoteLines.map((l) => l.variant_id).filter((v): v is number => v !== null)),
    ]
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

    // Precio por variante (00232): si la tabla aún no existe o la
    // variante no es de ese producto, la línea se descarta de la
    // cotización (POST /api/orders la rechazaría igual).
    const variantPriceById = new Map<number, { product_id: number; price: number }>()
    if (variantIds.length > 0) {
      const { data: variantRows } = await supabase
        .from("product_variants")
        .select("id, product_id, price, sale_price")
        .in("id", variantIds)
      for (const v of (variantRows ?? []) as Array<{
        id: number
        product_id: number
        price: number
        sale_price: number | null
      }>) {
        variantPriceById.set(v.id, {
          product_id: v.product_id,
          price: v.sale_price ?? v.price,
        })
      }
    }

    const lines: AutomaticDiscountLine[] = []
    for (const line of quoteLines) {
      if (line.variant_id !== null) {
        const variant = variantPriceById.get(line.variant_id)
        if (!variant || variant.product_id !== line.product_id) continue
        lines.push({
          product_id: line.product_id,
          quantity: line.quantity,
          unit_price: variant.price,
        })
      } else if (priceById.has(line.product_id)) {
        lines.push({
          product_id: line.product_id,
          quantity: line.quantity,
          unit_price: priceById.get(line.product_id) ?? 0,
        })
      }
    }

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
