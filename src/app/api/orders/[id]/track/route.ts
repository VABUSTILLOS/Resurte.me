import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/service"
import { logger } from "@/lib/logger"

export const runtime = "nodejs"

/**
 * GET /api/orders/[id]/track?t=<restore_token>
 *
 * Seguimiento público del pedido (incluidos invitados): devuelve estado,
 * pago, programación, items y totales. El restore_token (UUID aleatorio por
 * pedido, migración 00063) actúa como capability URL — mismo patrón que
 * /api/cart/restore: sin token válido no se expone ningún dato de la orden.
 *
 * No expone PII (dirección, teléfono, email) — solo lo necesario para el
 * stepper de seguimiento.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const token = request.nextUrl.searchParams.get("t")

  // Solo enteros positivos: Number() aceptaría "1e3", negativos, etc.
  if (!/^\d+$/.test(id) || !token) {
    return NextResponse.json({ error: "Parámetros inválidos" }, { status: 400 })
  }
  const orderId = Number(id)

  try {
    const supabase = await createServiceClient()

    const SELECT_WITH_DRIVER =
      "id, status, payment_status, payment_method, subtotal, discount, delivery_fee, total, scheduled_for, created_at, restore_token, cities(slug, name), delivery_drivers(name), order_items(quantity, unit_price, products(id, name, image_url, slug))"
    const SELECT_BASE =
      "id, status, payment_status, payment_method, subtotal, discount, delivery_fee, total, scheduled_for, created_at, restore_token, cities(slug, name), order_items(quantity, unit_price, products(id, name, image_url, slug))"

    // Repartidor (migración 00076): si la columna/relación aún no existe en
    // producción, reintenta sin ella en lugar de fallar el rastreo.
    let { data: order, error } = await supabase
      .from("orders")
      .select(SELECT_WITH_DRIVER)
      .eq("id", orderId)
      .eq("restore_token", token)
      .maybeSingle()

    if (error?.code === "42703") {
      ;({ data: order, error } = await supabase
        .from("orders")
        .select(SELECT_BASE)
        .eq("id", orderId)
        .eq("restore_token", token)
        .maybeSingle())
    }

    if (error) {
      logger.error("[ORDER-TRACK] query error:", error)
      return NextResponse.json({ error: "No se pudo consultar el pedido" }, { status: 500 })
    }
    if (!order) {
      // Respuesta genérica para no filtrar la existencia del pedido
      return NextResponse.json({ error: "Enlace inválido o expirado" }, { status: 404 })
    }

    const city = Array.isArray(order.cities) ? order.cities[0] : order.cities
    // Repartidor: solo el primer nombre y solo cuando va en camino.
    const driverRow = Array.isArray(order.delivery_drivers)
      ? order.delivery_drivers[0]
      : order.delivery_drivers
    const driverFirstName =
      order.status === "out_for_delivery" && driverRow?.name
        ? String(driverRow.name).split(" ")[0]
        : null
    const items = ((order.order_items ?? []) as unknown as Array<{
      quantity: number
      unit_price: number
      products: { id: number; name: string; image_url: string | null; slug: string } | null
    }>).map((item) => ({
      quantity: item.quantity,
      unit_price: Number(item.unit_price),
      name: item.products?.name ?? "Producto",
      image_url: item.products?.image_url ?? "",
      slug: item.products?.slug ?? "",
    }))

    return NextResponse.json(
      {
        order: {
          id: order.id,
          status: order.status,
          payment_status: order.payment_status,
          payment_method: order.payment_method,
          subtotal: Number(order.subtotal),
          discount: order.discount != null ? Number(order.discount) : 0,
          delivery_fee: Number(order.delivery_fee),
          total: Number(order.total),
          scheduled_for: order.scheduled_for,
          created_at: order.created_at,
          city: city ?? null,
          driver_name: driverFirstName,
          items,
        },
      },
      { headers: { "Cache-Control": "no-store" } }
    )
  } catch (err) {
    logger.error("[ORDER-TRACK] unexpected error:", err)
    return NextResponse.json({ error: "No se pudo consultar el pedido" }, { status: 500 })
  }
}
