import { NextResponse, type NextRequest } from "next/server"
import { createServiceClient } from "@/lib/supabase/service"
import { computeOrderTotals } from "@/lib/foodos"
import type { FoodosOrderItem } from "@/types/foodos"
import { logger } from "@/lib/logger"

// Rate limiting: fixed-window counter durable en Supabase
// (RPC consume_rate_limit, tabla rate_limits). Compartido entre
// instancias serverless; no se reinicia en deploys.
const RATE_LIMIT_MAX = 20
const RATE_LIMIT_WINDOW_SECONDS = 60

interface RateLimitResult {
  allowed: boolean
  remaining: number
  retry_after_seconds: number
}

async function rateLimited(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  ip: string
): Promise<RateLimitResult> {
  const { data, error } = await supabase.rpc("consume_rate_limit", {
    p_key: `foodos_orders:${ip}`,
    p_limit: RATE_LIMIT_MAX,
    p_window_seconds: RATE_LIMIT_WINDOW_SECONDS,
  })

  if (error || !data || data.length === 0) {
    // Fail-open en caso de error de BD: no bloquear pedidos legítimos
    // por una falla del rate limiter.
    return { allowed: true, remaining: RATE_LIMIT_MAX, retry_after_seconds: 0 }
  }

  const row = data[0] as RateLimitResult
  return row
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
    const supabase = await createServiceClient()

    const rate = await rateLimited(supabase, clientIp(request))
    if (!rate.allowed) {
      return NextResponse.json(
        { error: "Demasiadas peticiones. Intenta en un minuto." },
        { status: 429, headers: { "Retry-After": String(rate.retry_after_seconds) } }
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
      logger.error("FoodOS order error:", orderError)
      return NextResponse.json(
        { error: "Error al crear el pedido", detail: orderError.message, code: orderError.code },
        { status: 500 }
      )
    }

    // El PaymentIntent de Stripe para tarjeta lo crea el storefront llamando a
    // POST /api/payments/stripe/create-intent con type: "foodos" y el order_id
    // devuelto aquí (separación de responsabilidades: esta ruta solo registra).

    return NextResponse.json({
      orderId: order.id,
      total,
    })
  } catch (error) {
    logger.error("FoodOS create order error:", error)
    return NextResponse.json(
      { error: "Error interno al crear el pedido" },
      { status: 500 }
    )
  }
}
