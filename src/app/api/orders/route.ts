import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"
import { getStripe } from "@/lib/stripe"

interface OrderItemInput {
  product_id: number
  quantity: number
  unit_price: number
  name: string
}

interface CreateOrderBody {
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
  // Dirección guardada reutilizada tal cual (logged-in). Si la dirección del
  // formulario fue editada, el frontend NO la envía y se crea una nueva.
  address_id?: number
  // Token de checkout anónimo: permite reutilizar la dirección del mismo
  // navegador y reclamarla al iniciar sesión.
  guest_token?: string
  schedule: {
    date: string
    time: string
  }
  payment_method: string
  phone?: string
  subtotal: number
  delivery_fee: number
  total: number
  coupon_code?: string
  items: OrderItemInput[]
}

/**
 * POST /api/orders
 *
 * Crea un pedido en Supabase con los items del carrito.
 * Si payment_method es "card", también crea un PaymentIntent de Stripe
 * y devuelve el client_secret para que el frontend confirme el pago.
 *
 * Usa service_role para bypass de RLS (checkout anónimo o logueado).
 * Si hay sesión activa, el pedido y la dirección se vinculan al usuario,
 * y el trigger process_cashback_for_order() genera sus créditos Resurte.
 */
export async function POST(request: NextRequest) {
  try {
    const body: CreateOrderBody = await request.json()
    const {
      city_id,
      address,
      address_id,
      guest_token,
      schedule,
      payment_method,
      phone,
      subtotal,
      delivery_fee,
      total,
      coupon_code,
      items,
    } = body

    // Validate required fields
    const missing: string[] = []
    if (!city_id) missing.push("city_id")
    if (!items?.length) missing.push("items")
    if (!total) missing.push("total")

    if (missing.length) {
      console.error("Order validation failed - missing:", missing, { city_id, items_count: items?.length, total })
      return NextResponse.json(
        { error: `Faltan campos requeridos: ${missing.join(", ")}` },
        { status: 400 }
      )
    }

    // Whitelist de métodos de pago (evita guardar valores inválidos en la BD)
    const ALLOWED_PAYMENT_METHODS = [
      "card",
      "spei",
      "oxxo",
      "cash_on_delivery",
      "mercado_pago",
      "codi",
    ]
    if (!ALLOWED_PAYMENT_METHODS.includes(payment_method)) {
      return NextResponse.json(
        { error: "Método de pago inválido" },
        { status: 400 }
      )
    }

    // ── Sesión activa (si el usuario está logueado, el pedido queda vinculado) ──
    const supabaseClient = await createClient()
    const { data: { user } } = await supabaseClient.auth.getUser()
    const userId = user?.id ?? null

    const supabase = await createServiceClient()

    // ── Validación server-side de precios y stock ──
    // El subtotal/total/unit_price del body provienen del cliente y NO son de
    // confiar: se recalcula contra los precios reales de la BD y se rechaza la
    // orden si hay discrepancias o si algún item está agotado.
    const productIds = items.map((i) => i.product_id)
    const { data: dbProducts, error: productsErr } = await supabase
      .from("products")
      .select("id, price, sale_price, stock_status")
      .in("id", productIds)

    if (productsErr) {
      console.error("Products fetch error:", productsErr)
      return NextResponse.json(
        { error: "Error al validar los productos del pedido" },
        { status: 500 }
      )
    }

    const priceByProduct = new Map<number, { price: number; sale_price: number | null; stock_status: string }>()
    for (const p of dbProducts ?? []) {
      priceByProduct.set(p.id, p)
    }

    // Items inexistentes en la BD
    for (const item of items) {
      if (!priceByProduct.has(item.product_id)) {
        return NextResponse.json(
          { error: `Producto no encontrado: ${item.product_id}` },
          { status: 400 }
        )
      }
    }

    // Items agotados
    for (const item of items) {
      const db = priceByProduct.get(item.product_id)!
      if (db.stock_status === "out_of_stock") {
        return NextResponse.json(
          { error: `El producto ${item.product_id} está agotado` },
          { status: 400 }
        )
      }
    }

    // Recalcular subtotal con precios reales (sale_price gana si existe)
    const realSubtotal = items.reduce((sum, item) => {
      const db = priceByProduct.get(item.product_id)!
      const unitPrice = db.sale_price ?? db.price
      return sum + unitPrice * item.quantity
    }, 0)

    const subtotalDiff = Math.abs(realSubtotal - (subtotal ?? 0))
    if (subtotalDiff > 0.01) {
      console.error("Subtotal mismatch", { client: subtotal, server: realSubtotal, diff: subtotalDiff })
      return NextResponse.json(
        { error: "El subtotal no coincide con los precios del catálogo" },
        { status: 400 }
      )
    }

    // Delivery fee: solo 0 (recoger) o 35 MXN (envío), y 0 si no hay items
    const validDeliveryFee = items.length > 0 ? (delivery_fee === 0 || delivery_fee === 35 ? delivery_fee : 35) : 0

    // ── Validación server-side del cupón (si viene) ──
    // El descuento se recalcula contra la BD con la misma fórmula del cliente
    // (calcDiscount en cart-context) para que el total coincida exactamente.
    let discountAmount = 0
    let coupon: CouponRow | null = null
    const code = coupon_code?.trim()
    if (code) {
      const { data: found, error: couponErr } = await supabase
        .from("coupons")
        .select("id, code, discount_type, discount_value, min_order, max_uses, used_count, expires_at")
        .ilike("code", code) // case-insensitive: "BIENVENIDO" == "bienvenido"
        .maybeSingle()

      if (couponErr) {
        console.error("Coupon fetch error:", couponErr)
        return NextResponse.json(
          { error: "Error al validar el cupón" },
          { status: 500 }
        )
      }
      if (!found) {
        return NextResponse.json(
          { error: "El cupón no existe o no es válido" },
          { status: 400 }
        )
      }
      if (found.expires_at && new Date(found.expires_at) < new Date()) {
        return NextResponse.json(
          { error: "El cupón ha expirado" },
          { status: 400 }
        )
      }
      if (realSubtotal < Number(found.min_order)) {
        return NextResponse.json(
          { error: `Este cupón requiere un pedido mínimo de $${Number(found.min_order).toFixed(2)}` },
          { status: 400 }
        )
      }
      if (found.max_uses > 0 && found.used_count >= found.max_uses) {
        return NextResponse.json(
          { error: "El cupón ya fue utilizado el máximo de veces" },
          { status: 400 }
        )
      }

      coupon = found
      if (found.discount_type === "percentage") {
        discountAmount = Math.round((realSubtotal * Number(found.discount_value)) / 100 * 100) / 100
      } else {
        discountAmount = Math.min(Number(found.discount_value), realSubtotal)
      }
    }

    // El checkout envía total = subtotal - descuento + envío. Se exige que
    // coincida con el monto recalculado server-side (el descuento solo se
    // otorga si el cupón fue validado arriba).
    const realTotal = Math.max(0, realSubtotal - discountAmount + validDeliveryFee)
    const totalDiff = Math.abs(realTotal - (total ?? 0))
    if (totalDiff > 0.01) {
      console.error("Total mismatch", { client: total, server: realTotal, diff: totalDiff })
      return NextResponse.json(
        { error: "El total no coincide con los precios del catálogo" },
        { status: 400 }
      )
    }

    // ── Resolver la tienda del pedido (única activa; safety net con DEFAULT) ──
    const { data: store } = await supabase
      .from("stores")
      .select("id")
      .eq("is_active", true)
      .order("id", { ascending: true })
      .limit(1)
      .single()
    const storeId = store?.id ?? null

    // ── Resolver ciudad/estado reales (addresses.city/state guardan el nombre
    //    real, no la colonia como antes) ──
    const { data: cityRow } = await supabase
      .from("cities")
      .select("name, state")
      .eq("id", city_id)
      .maybeSingle()
    if (!cityRow) {
      return NextResponse.json(
        { error: "La ciudad seleccionada no existe" },
        { status: 400 }
      )
    }
    const cityName = cityRow.name
    const cityState = cityRow.state

    // ── Resolver la dirección del pedido ──
    // Logged-in:
    //   · si viene address_id → validar que pertenece al usuario y reutilizarla
    //     (el frontend solo la envía cuando la dirección NO fue editada);
    //   · si no → buscar por coincidencia exacta para evitar duplicados.
    // Anónimo: se genera/persiste un guest_token y se reutiliza la dirección
    // del mismo navegador por token + coincidencia de campos. El token permite
    // reclamar la dirección al iniciar sesión (POST /api/addresses/claim).
    let addressId: number | null = null
    const guestToken = guest_token?.trim() || (userId ? null : crypto.randomUUID())

    if (userId && address_id) {
      const { data: owned } = await supabase
        .from("addresses")
        .select("id")
        .eq("id", address_id)
        .eq("user_id", userId)
        .maybeSingle()
      if (owned) addressId = owned.id
    }

    if (addressId === null) {
      let query = supabase
        .from("addresses")
        .select("id")
        .eq("street", address.street)
        .eq("number", address.number)
        .eq("neighborhood", address.neighborhood)
        .eq("zip_code", address.zip_code)
        .eq("city", cityName)
        .eq("state", cityState)
      if (userId) {
        query = query.eq("user_id", userId)
      } else {
        query = query.is("user_id", null).eq("guest_token", guestToken)
      }
      if (address.interior) query = query.eq("interior", address.interior)
      if (address.references) query = query.eq("references", address.references)
      const { data: existing } = await query.maybeSingle()
      if (existing) addressId = existing.id
    }

    if (addressId === null) {
      // 1. Create address (or use existing)
      const { data: addr, error: addrError } = await supabase
        .from("addresses")
        .insert({
          user_id: userId, // vinculada al usuario logueado (null si checkout anónimo)
          guest_token: userId ? null : guestToken,
          label: address.label,
          street: address.street,
          number: address.number,
          interior: address.interior || null,
          neighborhood: address.neighborhood,
          city: cityName, // nombre real de la ciudad
          state: cityState, // estado real de la ciudad
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
      addressId = addr.id
    }

    // 2. Build scheduled_for timestamp
    const scheduledFor = schedule.date
      ? new Date(`${schedule.date}T${extractTime(schedule.time)}:00-06:00`)
      : new Date()

    // ── Reservar el uso del cupón (optimistic concurrency) ──
    // Si el UPDATE condicional no afecta filas, otro pedido consumió el último
    // uso entre nuestra lectura y este momento → el cupón ya está agotado.
    let couponReserved = false
    if (coupon) {
      const { data: reserved, error: reserveErr } = await supabase
        .from("coupons")
        .update({ used_count: coupon.used_count + 1 })
        .eq("id", coupon.id)
        .eq("used_count", coupon.used_count)
        .select("id")

      if (reserveErr) {
        console.error("Coupon reserve error:", reserveErr)
        return NextResponse.json(
          { error: "Error al aplicar el cupón" },
          { status: 500 }
        )
      }
      if (!reserved || reserved.length === 0) {
        return NextResponse.json(
          { error: "El cupón ya fue utilizado el máximo de veces" },
          { status: 400 }
        )
      }
      couponReserved = true
    }

    // 3. Create the order
    //    El trigger process_cashback_for_order() calcula el cashback al insertar.
    //    Nota: si no hay tienda activa se OMITE store_id para que aplique el
    //    DEFAULT de la migración 00026 (insertar NULL explícito lo anularía).
    const insertOrder: Record<string, unknown> = {
      user_id: userId, // ← vincula el pedido al usuario logueado
      city_id,
      address_id: addressId,
      status: "pending",
      subtotal: realSubtotal,
      delivery_fee: validDeliveryFee,
      total: realTotal,
      payment_method,
      payment_status: "pending",
      scheduled_for: scheduledFor.toISOString(),
      source: "web",
      // Teléfono de contacto: habilita la confirmación por WhatsApp (workflows.ts)
      customer_phone: phone?.trim() || null,
    }
    if (coupon) {
      insertOrder.discount = discountAmount
      insertOrder.coupon_code = coupon.code
    }
    if (storeId !== null) {
      insertOrder.store_id = storeId
    }
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert(insertOrder)
      .select("id, cashback_credits, cashback_tier, total")
      .single()

    if (orderError) {
      console.error("Order creation error:", orderError)
      await releaseCoupon(coupon, couponReserved, supabase)
      return NextResponse.json(
        { error: "Error al crear el pedido", detail: orderError.message, code: orderError.code },
        { status: 500 }
      )
    }

    // 4. Create order items (unit_price real de la BD, no el del cliente)
    const orderItems = items.map((item) => {
      const db = priceByProduct.get(item.product_id)!
      return {
        order_id: order.id,
        product_id: item.product_id,
        quantity: item.quantity,
        unit_price: db.sale_price ?? db.price,
      }
    })

    const { error: itemsError } = await supabase
      .from("order_items")
      .insert(orderItems)

    if (itemsError) {
      console.error("Order items creation error:", itemsError)
      // Order exists but items failed — clean up
      await supabase.from("orders").delete().eq("id", order.id)
      await releaseCoupon(coupon, couponReserved, supabase)
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
          amount: Math.round(realTotal * 100), // MXN cents — monto server-side, no el del cliente
          currency: "mxn",
          automatic_payment_methods: { enabled: true },
          metadata: {
            order_id: String(order.id),
            source: "resurte.me",
            user_id: userId ?? "anonymous",
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
        await releaseCoupon(coupon, couponReserved, supabase)
        return NextResponse.json(
          { error: "Error al inicializar el pago con Stripe", detail: stripeMsg },
          { status: 500 }
        )
      }
    }

    return NextResponse.json({
      orderId: order.id,
      cashbackCredits: order.cashback_credits ?? 0,
      cashbackTier: order.cashback_tier ?? undefined,
      clientSecret,
      paymentIntentId,
      total: realTotal,
      // Solo para checkout anónimo: el frontend lo persiste en localStorage
      // para reutilizar la dirección en la próxima compra y reclamarla al login.
      guestToken,
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

interface CouponRow {
  id: number
  code: string
  discount_type: "percentage" | "fixed_amount"
  discount_value: number
  min_order: number
  max_uses: number
  used_count: number
  expires_at: string | null
}

/**
 * Revierte la reserva de un cupón si el pedido no llegó a completarse.
 * El UPDATE es condicional (used_count = lo que este pedido puso) para no
 * pisar una reserva concurrente de otro pedido en vuelo.
 */
async function releaseCoupon(
  coupon: CouponRow | null,
  reserved: boolean,
  supabase: Awaited<ReturnType<typeof createServiceClient>>
) {
  if (!coupon || !reserved) return
  await supabase
    .from("coupons")
    .update({ used_count: coupon.used_count })
    .eq("id", coupon.id)
    .eq("used_count", coupon.used_count + 1)
}
