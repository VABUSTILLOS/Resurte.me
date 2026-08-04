import { NextResponse, type NextRequest } from "next/server"
import { createServiceClient } from "@/lib/supabase/service"
import { getStripe } from "@/lib/stripe"

interface OrderItemInput {
  product_id: number
  quantity: number
  unit_price: number
  name: string
}

interface CreateOrderBody {
  store_id: number
  city_id: number
  address: {
    label: string
    street: string
    number: string
    interior: string
    neighborhood: string
    zip_code: string
    references: string
  }
  schedule: {
    date: string
    time: string
  }
  payment_method: string
  subtotal: number
  delivery_fee: number
  total: number
  items: OrderItemInput[]
}

/**
 * POST /api/orders
 *
 * Crea un pedido en Supabase con los items del carrito.
 * Si payment_method es "card", también crea un PaymentIntent de Stripe
 * y devuelve el client_secret para que el frontend confirme el pago.
 *
 * Usa service_role para bypass de RLS (checkout no requiere auth).
 */
export async function POST(request: NextRequest) {
  try {
    const body: CreateOrderBody = await request.json()
    const {
      store_id,
      city_id,
      address,
      schedule,
      payment_method,
      subtotal,
      delivery_fee,
      total,
      items,
    } = body

    // Validate required fields
    const missing: string[] = []
    if (!store_id) missing.push("store_id")
    if (!city_id) missing.push("city_id")
    if (!items?.length) missing.push("items")
    if (!total) missing.push("total")

    if (missing.length) {
      console.error("Order validation failed - missing:", missing, { store_id, city_id, items_count: items?.length, total })
      return NextResponse.json(
        { error: `Faltan campos requeridos: ${missing.join(", ")}` },
        { status: 400 }
      )
    }

    const supabase = await createServiceClient()

    // 1. Create address (or use existing)
    const { data: addr, error: addrError } = await supabase
      .from("addresses")
      .insert({
        user_id: null, // anonymous checkout
        label: address.label,
        street: address.street,
        number: address.number,
        interior: address.interior || null,
        neighborhood: address.neighborhood,
        city: address.neighborhood, // using neighborhood as city name proxy
        state: address.neighborhood, // will be overwritten by actual city
        zip_code: address.zip_code,
        references: address.references || null,
      })
      .select("id")
      .single()

    if (addrError) {
      console.error("Address creation error:", addrError)
      return NextResponse.json(
        { error: "Error al guardar la dirección", detail: addrError.message, code: addrError.code },
        { status: 500 }
      )
    }

    // 2. Build scheduled_for timestamp
    const scheduledFor = schedule.date
      ? new Date(`${schedule.date}T${extractTime(schedule.time)}:00-06:00`)
      : new Date()

    // 3. Create the order
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert({
        user_id: null, // anonymous checkout
        store_id,
        city_id,
        address_id: addr.id,
        status: "pending",
        subtotal,
        delivery_fee,
        total,
        payment_method,
        payment_status: "pending",
        scheduled_for: scheduledFor.toISOString(),
        source: "web",
      })
      .select("id")
      .single()

    if (orderError) {
      console.error("Order creation error:", orderError)
      return NextResponse.json(
        { error: "Error al crear el pedido", detail: orderError.message, code: orderError.code },
        { status: 500 }
      )
    }

    // 4. Create order items
    const orderItems = items.map((item) => ({
      order_id: order.id,
      product_id: item.product_id,
      quantity: item.quantity,
      unit_price: item.unit_price,
    }))

    const { error: itemsError } = await supabase
      .from("order_items")
      .insert(orderItems)

    if (itemsError) {
      console.error("Order items creation error:", itemsError)
      // Order exists but items failed — clean up
      await supabase.from("orders").delete().eq("id", order.id)
      return NextResponse.json(
        { error: "Error al guardar los productos del pedido" },
        { status: 500 }
      )
    }

    // 5. If payment is "card", create Stripe PaymentIntent
    let clientSecret: string | null = null
    let paymentIntentId: string | null = null

    if (payment_method === "card") {
      try {
        const stripe = getStripe()
        const paymentIntent = await stripe.paymentIntents.create({
          amount: Math.round(total * 100), // MXN cents
          currency: "mxn",
          automatic_payment_methods: { enabled: true },
          metadata: {
            order_id: String(order.id),
            source: "resurte.me",
          },
        })

        clientSecret = paymentIntent.client_secret
        paymentIntentId = paymentIntent.id

        // Link PaymentIntent to order
        await supabase
          .from("orders")
          .update({ stripe_payment_intent_id: paymentIntentId })
          .eq("id", order.id)
      } catch (stripeError) {
        console.error("Stripe PaymentIntent error:", stripeError)
        const stripeMsg = stripeError instanceof Error ? stripeError.message : String(stripeError)
        // Order is created but payment failed — clean up
        await supabase.from("order_items").delete().eq("order_id", order.id)
        await supabase.from("orders").delete().eq("id", order.id)
        return NextResponse.json(
          { error: "Error al inicializar el pago con Stripe", detail: stripeMsg },
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
    console.error("Create order error:", error)
    return NextResponse.json(
      { error: "Error interno al crear el pedido" },
      { status: 500 }
    )
  }
}

/** Extrae la hora de inicio de un rango como "8:00 AM — 10:00 AM" */
function extractTime(timeRange: string): string {
  const match = timeRange.match(/(\d{1,2}):(\d{2})/)
  if (!match) return "10:00"
  let hour = parseInt(match[1])
  const minute = match[2]
  // Convert PM
  if (timeRange.includes("PM") && hour !== 12) hour += 12
  // Convert 12 AM to 0
  if (timeRange.includes("AM") && hour === 12) hour = 0
  return `${String(hour).padStart(2, "0")}:${minute}`
}
