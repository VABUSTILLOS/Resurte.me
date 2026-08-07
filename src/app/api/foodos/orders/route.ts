import { NextResponse, type NextRequest } from "next/server"
import { createServiceClient } from "@/lib/supabase/service"
import { getStripe } from "@/lib/stripe"
import { computeOrderTotals } from "@/lib/foodos"
import type { FoodosOrderItem } from "@/types/foodos"

interface FoodosOrderBody {
  restaurant_id: string
  branch_id?: string | null
  items: FoodosOrderItem[]
  delivery_fee?: number
  discount?: number
  channel?: "web" | "qr" | "whatsapp"
  fulfillment?: "delivery" | "pickup" | "dine_in"
  payment_method?: string | null
  customer_name?: string | null
  customer_phone?: string | null
  note?: string | null
}

/**
 * POST /api/foodos/orders
 *
 * Crea un pedido público del micrositio /r/[slug] sin autenticación
 * (service role bypass de RLS; la migración valida que el restaurante
 * esté activo y el trigger crea/actualiza el cliente).
 *
 * Si payment_method es "card", crea un PaymentIntent de Stripe y
 * devuelve el client_secret para que el frontend confirme el pago.
 */
export async function POST(request: NextRequest) {
  try {
    const body: FoodosOrderBody = await request.json()
    const {
      restaurant_id,
      branch_id,
      items,
      delivery_fee = 0,
      discount = 0,
      channel = "web",
      fulfillment = "pickup",
      payment_method,
      customer_name,
      customer_phone,
      note,
    } = body

    const missing: string[] = []
    if (!restaurant_id) missing.push("restaurant_id")
    if (!items?.length) missing.push("items")

    if (missing.length) {
      return NextResponse.json(
        { error: `Faltan campos requeridos: ${missing.join(", ")}` },
        { status: 400 }
      )
    }

    // Validar montos: no confiar en el cliente
    const cleanItems: FoodosOrderItem[] = items.map((i) => ({
      item_id: i.item_id,
      name: i.name ?? "Producto",
      price: Math.max(Number(i.price) || 0, 0),
      qty: Math.max(Number(i.qty) || 0, 1),
      combo_id: i.combo_id ?? null,
    }))
    const { subtotal, discount: cappedDiscount, total } = computeOrderTotals(
      cleanItems,
      Math.max(Number(delivery_fee) || 0, 0),
      Math.max(Number(discount) || 0, 0)
    )

    const supabase = await createServiceClient()

    const payload = {
      restaurant_id,
      branch_id: branch_id ?? null,
      items: cleanItems,
      subtotal,
      discount: cappedDiscount,
      delivery_fee: Math.max(Number(delivery_fee) || 0, 0),
      total,
      channel,
      fulfillment,
      status: "pending",
      payment_method: payment_method || null,
      payment_status: payment_method === "card" ? "pending" : "paid",
      customer_name: customer_name || null,
      customer_phone: customer_phone || null,
      note: note || null,
    }

    const { data: order, error: orderError } = await supabase
      .from("foodos_orders")
      .insert(payload)
      .select("id, total, restaurant_id, slug")
      .single()

    if (orderError) {
      console.error("FoodOS order error:", orderError)
      return NextResponse.json(
        { error: "Error al crear el pedido", detail: orderError.message, code: orderError.code },
        { status: 500 }
      )
    }

    // Si es tarjeta, crear PaymentIntent y ligarlo al pedido
    let clientSecret: string | null = null
    let paymentIntentId: string | null = null

    if (payment_method === "card") {
      try {
        const stripe = getStripe()
        const paymentIntent = await stripe.paymentIntents.create({
          amount: Math.round(total * 100),
          currency: "mxn",
          automatic_payment_methods: { enabled: true },
          metadata: {
            foodos_order_id: String(order.id),
            restaurant_id,
            source: "resurte.me-foodos",
          },
        })
        clientSecret = paymentIntent.client_secret
        paymentIntentId = paymentIntent.id

        await supabase
          .from("foodos_orders")
          .update({ stripe_payment_intent_id: paymentIntentId })
          .eq("id", order.id)
      } catch (stripeError) {
        console.error("FoodOS Stripe error:", stripeError)
        await supabase.from("foodos_orders").delete().eq("id", order.id)
        return NextResponse.json(
          { error: "Error al inicializar el pago con Stripe" },
          { status: 500 }
        )
      }
    }

    return NextResponse.json({
      orderId: order.id,
      clientSecret,
      paymentIntentId,
      total,
    })
  } catch (error) {
    console.error("FoodOS create order error:", error)
    return NextResponse.json(
      { error: "Error interno al crear el pedido" },
      { status: 500 }
    )
  }
}
