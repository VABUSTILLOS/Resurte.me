"use server"

import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"
import { getStripe } from "@/lib/stripe"
import type { OrderWithCashback, OrderItem } from "@/types"

// ============================================================
// Types
// ============================================================

interface OrderItemInput {
  product_id: number
  quantity: number
  unit_price: number
}

interface AddressInput {
  label: string
  street: string
  number: string
  interior?: string
  neighborhood: string
  zip_code: string
  references?: string
}

interface PlaceOrderInput {
  city_id: number
  address: AddressInput
  schedule: { date: string; time: string }
  payment_method: string
  subtotal: number
  delivery_fee: number
  total: number
  items: OrderItemInput[]
}

interface PlaceOrderResult {
  success: boolean
  orderId?: number
  cashbackCredits?: number
  cashbackTier?: string
  clientSecret?: string
  paymentIntentId?: string
  error?: string
}

// ============================================================
// Helpers
// ============================================================

/** Extrae la hora numérica de un rango como "8:00 AM — 10:00 AM" */
function extractTime(timeRange: string): string {
  const match = timeRange.match(/(\d{1,2}):(\d{2})/)
  if (!match) return "10:00"
  let hour = parseInt(match[1])
  const minute = match[2]
  if (timeRange.includes("PM") && hour !== 12) hour += 12
  if (timeRange.includes("AM") && hour === 12) hour = 0
  return `${String(hour).padStart(2, "0")}:${minute}`
}

// ============================================================
// placeOrder — Server Action principal de checkout
// ============================================================

/**
 * Crea una orden en Supabase con sus items.
 *
 * Flujo automático del trigger:
 *   1. BEFORE INSERT en `orders` dispara `process_cashback_for_order()`
 *   2. Si total >= $2,500 MXN y hay user_id → calcula nivel, crea wallet si no
 *      existe, inserta transacción y actualiza saldo
 *   3. Si es checkout anónimo (sin sesión) → no se genera cashback
 *
 * @returns Order ID + cashback metadata + Stripe client_secret si aplica
 */
export async function placeOrder(input: PlaceOrderInput): Promise<PlaceOrderResult> {
  const {
    city_id,
    address,
    schedule,
    payment_method,
    subtotal,
    delivery_fee,
    total,
    items,
  } = input

  // ── Validación de campos requeridos ──
  const missing: string[] = []
  if (!city_id) missing.push("city_id")
  if (!items?.length) missing.push("items")
  if (!total) missing.push("total")

  if (missing.length) {
    return { success: false, error: `Faltan campos requeridos: ${missing.join(", ")}` }
  }

  // ── Obtener usuario autenticado (puede ser null en checkout anónimo) ──
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // ── Usar service_role para bypass de RLS al insertar en orders/order_items ──
  const serviceClient = await createServiceClient()

  // 1. Crear dirección
  const { data: addr, error: addrError } = await serviceClient
    .from("addresses")
    .insert({
      user_id: user?.id ?? null,
      label: address.label,
      street: address.street,
      number: address.number,
      interior: address.interior ?? null,
      neighborhood: address.neighborhood,
      city: address.neighborhood,
      state: address.neighborhood,
      zip_code: address.zip_code,
      references: address.references ?? null,
    })
    .select("id")
    .single()

  if (addrError) {
    return { success: false, error: `Error al guardar dirección: ${addrError.message}` }
  }

  // 2. Construir timestamp de entrega programada
  const scheduledFor = schedule.date
    ? new Date(`${schedule.date}T${extractTime(schedule.time)}:00-06:00`)
    : new Date()

  // 3. Crear la orden — el trigger process_cashback_for_order() se ejecuta aquí
  //    BEFORE INSERT, usando SECURITY DEFINER para sortear RLS
  const { data: order, error: orderError } = await serviceClient
    .from("orders")
    .insert({
      user_id: user?.id ?? null,         // ← el trigger usa esto para asociar cashback
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
    .select("id, cashback_credits, cashback_tier, total")
    .single()

  if (orderError) {
    return { success: false, error: `Error al crear pedido: ${orderError.message}` }
  }

  // 4. Crear items del pedido
  const orderItems = items.map((item) => ({
    order_id: order.id,
    product_id: item.product_id,
    quantity: item.quantity,
    unit_price: item.unit_price,
  }))

  const { error: itemsError } = await serviceClient
    .from("order_items")
    .insert(orderItems)

  if (itemsError) {
    // Rollback: eliminar orden si fallan los items
    await serviceClient.from("orders").delete().eq("id", order.id)
    return { success: false, error: `Error al guardar productos: ${itemsError.message}` }
  }

  // 5. Si el pago es con tarjeta, crear PaymentIntent de Stripe
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
          order_id: String(order.id),
          source: "resurte.me",
          user_id: user?.id ?? "anonymous",
        },
      })

      clientSecret = paymentIntent.client_secret
      paymentIntentId = paymentIntent.id

      await serviceClient
        .from("orders")
        .update({ stripe_payment_intent_id: paymentIntentId })
        .eq("id", order.id)
    } catch (stripeError) {
      // Rollback completo si Stripe falla
      await serviceClient.from("order_items").delete().eq("order_id", order.id)
      await serviceClient.from("orders").delete().eq("id", order.id)
      const msg = stripeError instanceof Error ? stripeError.message : String(stripeError)
      return { success: false, error: `Error al inicializar Stripe: ${msg}` }
    }
  }

  // ── Resultado final con metadata de cashback ──
  return {
    success: true,
    orderId: order.id,
    cashbackCredits: order.cashback_credits ?? 0,
    cashbackTier: order.cashback_tier ?? undefined,
    clientSecret: clientSecret ?? undefined,
    paymentIntentId: paymentIntentId ?? undefined,
  }
}

// ============================================================
// getOrderById — Consulta una orden con sus items y cashback
// ============================================================

/**
 * Obtiene una orden específica con sus items y metadata de cashback.
 * Solo el dueño de la orden puede consultarla (RLS).
 */
export async function getOrderById(
  orderId: number
): Promise<(OrderWithCashback & { items: OrderItem[] }) | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("orders")
    .select("*, order_items(*)")
    .eq("id", orderId)
    .single()

  if (error || !data) return null

  const { order_items, ...order } = data as OrderWithCashback & { order_items: OrderItem[] }
  return { ...order, items: order_items ?? [] }
}
