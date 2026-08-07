import { NextResponse, type NextRequest } from "next/server"
import { createServiceClient } from "@/lib/supabase/service"
import { getStripe } from "@/lib/stripe"
import { computeOrderTotals } from "@/lib/foodos"
import type { FoodosOrderItem } from "@/types/foodos"

// Rate limiting v1: sliding window por IP en memoria (Map).
// Limitaciones conocidas:
//  - No persiste entre instancias serverless (Vercel puede usar varias).
//  - Se reinicia al hacer deploy o escalar a 0.
// Mejora v2: migrar a Upstash Redis (@upstash/ratelimit) para que el
// conteo sea compartido y durable entre instancias.
const RATE_LIMIT_MAX = 20
const RATE_LIMIT_WINDOW_MS = 60_000
const rateBuckets = new Map<string, number[]>()

function rateLimited(ip: string): boolean {
  const now = Date.now()
  const cutoff = now - RATE_LIMIT_WINDOW_MS
  const hits = (rateBuckets.get(ip) ?? []).filter((t) => t > cutoff)
  if (hits.length >= RATE_LIMIT_MAX) {
    rateBuckets.set(ip, hits)
    return true
  }
  hits.push(now)
  rateBuckets.set(ip, hits)
  return false
}

function clientIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  )
}

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
    if (rateLimited(clientIp(request))) {
      return NextResponse.json(
        { error: "Demasiadas peticiones. Intenta en un minuto." },
        { status: 429 }
      )
    }

    const body: FoodosOrderBody = await request.json()
    const {
      restaurant_id,
      branch_id,
      items,
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

    // Validar montos: NO confiar en el cliente. Cargar el menú real del
    // restaurante y recalcular precios server-side.
    const supabase = await createServiceClient()

    const { data: restaurant } = await supabase
      .from("foodos_restaurants")
      .select("id")
      .eq("id", restaurant_id)
      .eq("status", "active")
      .maybeSingle()
    if (!restaurant) {
      return NextResponse.json({ error: "Restaurante no encontrado o inactivo" }, { status: 404 })
    }

    let serverDeliveryFee = 0
    if (branch_id) {
      const { data: branch } = await supabase
        .from("foodos_branches")
        .select("id, pickup_active, delivery_active, delivery_fee")
        .eq("id", branch_id)
        .eq("restaurant_id", restaurant_id)
        .maybeSingle()
      if (!branch) {
        return NextResponse.json(
          { error: "Sucursal no válida para este restaurante" },
          { status: 400 }
        )
      }
      if (fulfillment === "delivery" && !branch.delivery_active) {
        return NextResponse.json({ error: "Esta sucursal no ofrece entrega" }, { status: 400 })
      }
      if (fulfillment === "pickup" && !branch.pickup_active) {
        return NextResponse.json({ error: "Esta sucursal no ofrece recolección" }, { status: 400 })
      }
      serverDeliveryFee = fulfillment === "delivery" ? Number(branch.delivery_fee) || 0 : 0
    }

    const MAX_LINES = 20
    const MAX_QTY_PER_LINE = 50
    if (items.length > MAX_LINES) {
      return NextResponse.json(
        { error: `Máximo ${MAX_LINES} líneas por pedido` },
        { status: 400 }
      )
    }

    const comboIds = [...new Set(items.filter((i) => i.combo_id).map((i) => i.combo_id as string))]
    const itemIds = [...new Set(items.filter((i) => !i.combo_id).map((i) => i.item_id))]

    const [combosRes, itemsRes] = await Promise.all([
      comboIds.length
        ? supabase.from("foodos_combos").select("id, price").in("id", comboIds)
        : Promise.resolve({ data: [] as { id: string; price: number }[], error: null }),
      itemIds.length
        ? supabase.from("foodos_menu_items").select("id, price").in("id", itemIds)
        : Promise.resolve({ data: [] as { id: string; price: number }[], error: null }),
    ])

    const comboPrice = new Map((combosRes.data ?? []).map((c) => [c.id, Number(c.price)]))
    const itemPrice = new Map((itemsRes.data ?? []).map((i) => [i.id, Number(i.price)]))

    const cleanItems: FoodosOrderItem[] = []
    for (const raw of items) {
      const qty = Math.min(Math.max(Math.round(Number(raw.qty)) || 1, 1), MAX_QTY_PER_LINE)
      if (raw.combo_id) {
        const price = comboPrice.get(raw.combo_id)
        if (price === undefined) {
          return NextResponse.json(
            { error: "Combo no válido en el pedido" },
            { status: 400 }
          )
        }
        cleanItems.push({
          item_id: raw.item_id,
          name: raw.name ?? "Combo",
          price,
          qty,
          combo_id: raw.combo_id,
        })
      } else {
        const price = itemPrice.get(raw.item_id)
        if (price === undefined) {
          return NextResponse.json(
            { error: "Platillo no válido en el pedido" },
            { status: 400 }
          )
        }
        cleanItems.push({
          item_id: raw.item_id,
          name: raw.name ?? "Producto",
          price,
          qty,
        })
      }
    }

    const { subtotal, discount: cappedDiscount, total } = computeOrderTotals(
      cleanItems,
      serverDeliveryFee,
      0 // descuentos se calculan server-side (v1: el descuento de combos ya está en su precio)
    )

    const payload = {
      restaurant_id,
      branch_id: branch_id ?? null,
      items: cleanItems,
      subtotal,
      discount: cappedDiscount,
      delivery_fee: serverDeliveryFee,
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
