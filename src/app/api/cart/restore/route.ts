import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/service"
import { logger } from "@/lib/logger"

export const runtime = "nodejs"

/**
 * GET /api/cart/restore?order=<id>&t=<restore_token>
 * Devuelve los items de un pedido pendiente para rehidratar el carrito
 * desde el enlace del email de carrito abandonado, incluido invitados.
 * El restore_token (UUID aleatorio por pedido) actúa como capability:
 * sin token válido no se expone ningún dato de la orden.
 */
export async function GET(request: NextRequest) {
  const orderId = Number(request.nextUrl.searchParams.get("order"))
  const token = request.nextUrl.searchParams.get("t")

  if (!orderId || isNaN(orderId) || !token) {
    return NextResponse.json({ error: "Parámetros inválidos" }, { status: 400 })
  }

  try {
    const supabase = await createServiceClient()

    const { data: order, error } = await supabase
      .from("orders")
      .select("id, status, restore_token, order_items(product_id, quantity, unit_price, products(id, name, image_url, slug))")
      .eq("id", orderId)
      .eq("restore_token", token)
      .maybeSingle()

    if (error) {
      logger.error("[CART-RESTORE] query error:", error)
      return NextResponse.json({ error: "No se pudo restaurar el carrito" }, { status: 500 })
    }
    if (!order) {
      // Token o id incorrectos: respuesta genérica para no filtrar existencia
      return NextResponse.json({ error: "Enlace inválido o expirado" }, { status: 404 })
    }

    const items = ((order.order_items ?? []) as unknown as Array<{
      product_id: number
      quantity: number
      unit_price: number
      products: { id: number; name: string; image_url: string; slug: string } | null
    }>).map((item) => ({
      product_id: item.product_id,
      quantity: item.quantity,
      price: Number(item.unit_price),
      name: item.products?.name ?? `Producto #${item.product_id}`,
      slug: item.products?.slug ?? `producto-${item.product_id}`,
      image_url: item.products?.image_url ?? "",
    }))

    return NextResponse.json({ items }, { headers: { "Cache-Control": "no-store" } })
  } catch (err) {
    logger.error("[CART-RESTORE] unexpected error:", err)
    return NextResponse.json({ error: "No se pudo restaurar el carrito" }, { status: 500 })
  }
}
