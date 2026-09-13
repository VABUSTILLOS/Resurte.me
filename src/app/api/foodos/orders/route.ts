import { NextResponse, type NextRequest } from "next/server"
import { createServiceClient } from "@/lib/supabase/service"
import { computeOrderTotals, getOpenStatus, validateCoupon } from "@/lib/foodos"
import type { FoodosBranchHours, FoodosCoupon, FoodosOrderItem, FoodosOrderItemModifier } from "@/types/foodos"
import { logger } from "@/lib/logger"
import { rateLimited, clientIp, rateLimitResponse } from "@/lib/rate-limit"

// Rate limiting durable (helper compartido en src/lib/rate-limit.ts).
const RATE_LIMIT_MAX = 20
const RATE_LIMIT_WINDOW_SECONDS = 60

interface OptionGroupRow {
  id: string
  item_id: string
  name: string
  is_required: boolean
  min_select: number
  max_select: number
}

interface OptionValueRow {
  id: string
  group_id: string
  name: string
  price_delta: number
  is_available: boolean
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
  table_number?: string | null
  coupon_code?: string | null
  tip?: number
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

    const rate = await rateLimited(supabase, `foodos_orders:${clientIp(request)}`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_SECONDS)
    if (!rate.allowed) {
      return rateLimitResponse(rate)
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
      table_number,
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
      .select("id, timezone")
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
        .select("id, pickup_active, delivery_active, dine_in_active, delivery_fee")
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
      if (fulfillment === "dine_in" && !branch.dine_in_active) {
        return NextResponse.json({ error: "Esta sucursal no ofrece servicio en mesa" }, { status: 400 })
      }
      serverDeliveryFee = fulfillment === "delivery" ? Number(branch.delivery_fee) || 0 : 0

      // Horario de operación: rechazar pedidos fuera de horario.
      const { data: hours } = await supabase
        .from("foodos_branch_hours")
        .select("branch_id, day_of_week, open_time, close_time, is_closed")
        .eq("branch_id", branch.id)
      if (hours?.length) {
        const status = getOpenStatus(hours as FoodosBranchHours[], restaurant.timezone)
        if (!status.isOpen) {
          return NextResponse.json(
            { error: status.nextOpenLabel ?? "La sucursal está cerrada por ahora" },
            { status: 400 }
          )
        }
      }
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
    // Todos los value_ids de modificadores enviados por el cliente (se
    // recalculan contra la BD; nunca se confía en el precio del cliente).
    const modifierValueIds = [
      ...new Set(items.flatMap((i) => (i.modifiers ?? []).map((m) => m.value_id))),
    ]

    const [combosRes, itemsRes, groupsRes, valuesRes] = await Promise.all([
      comboIds.length
        ? supabase.from("foodos_combos").select("id, price").in("id", comboIds)
        : Promise.resolve({ data: [] as { id: string; price: number }[], error: null }),
      itemIds.length
        ? supabase.from("foodos_menu_items").select("id, price").in("id", itemIds)
        : Promise.resolve({ data: [] as { id: string; price: number }[], error: null }),
      itemIds.length
        ? supabase
            .from("foodos_item_option_groups")
            .select("id, item_id, name, is_required, min_select, max_select")
            .in("item_id", itemIds)
        : Promise.resolve({ data: [] as OptionGroupRow[], error: null }),
      modifierValueIds.length
        ? supabase
            .from("foodos_item_option_values")
            .select("id, group_id, name, price_delta, is_available")
            .in("id", modifierValueIds)
        : Promise.resolve({ data: [] as OptionValueRow[], error: null }),
    ])

    const comboPrice = new Map((combosRes.data ?? []).map((c) => [c.id, Number(c.price)]))
    const itemPrice = new Map((itemsRes.data ?? []).map((i) => [i.id, Number(i.price)]))
    const groupsByItem = new Map<string, OptionGroupRow[]>()
    for (const g of groupsRes.data ?? []) {
      const list = groupsByItem.get(g.item_id) ?? []
      list.push(g)
      groupsByItem.set(g.item_id, list)
    }
    const valueById = new Map((valuesRes.data ?? []).map((v) => [v.id, v]))

    // Overrides por sucursal: precio/disponibilidad específicos de la sucursal.
    const branchPriceOverride = new Map<string, number>()
    const branchUnavailable = new Set<string>()
    if (branch_id && itemIds.length) {
      const { data: overrides } = await supabase
        .from("foodos_branch_menu_overrides")
        .select("item_id, price, is_available")
        .eq("branch_id", branch_id)
        .in("item_id", itemIds)
      for (const o of overrides ?? []) {
        if (o.is_available === false) branchUnavailable.add(o.item_id)
        if (o.price !== null && o.price !== undefined) branchPriceOverride.set(o.item_id, Number(o.price))
      }
    }

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
        if (branchUnavailable.has(raw.item_id)) {
          return NextResponse.json(
            { error: "Un platillo no está disponible en esta sucursal" },
            { status: 400 }
          )
        }
        const basePrice = branchPriceOverride.get(raw.item_id) ?? itemPrice.get(raw.item_id)
        if (basePrice === undefined) {
          return NextResponse.json(
            { error: "Platillo no válido en el pedido" },
            { status: 400 }
          )
        }

        // Validar modificadores: pertenencia al ítem, disponibilidad y
        // límites min/max por grupo. El precio se recalcula en servidor.
        const groups = groupsByItem.get(raw.item_id) ?? []
        const cleanModifiers: FoodosOrderItemModifier[] = []
        const countByGroup = new Map<string, number>()
        for (const m of raw.modifiers ?? []) {
          const value = valueById.get(m.value_id)
          if (!value || !value.is_available) {
            return NextResponse.json(
              { error: "Modificador no válido en el pedido" },
              { status: 400 }
            )
          }
          const group = groups.find((g) => g.id === value.group_id && g.id === m.group_id)
          if (!group) {
            return NextResponse.json(
              { error: "Modificador no pertenece al platillo" },
              { status: 400 }
            )
          }
          countByGroup.set(group.id, (countByGroup.get(group.id) ?? 0) + 1)
          cleanModifiers.push({
            group_id: group.id,
            group_name: group.name,
            value_id: value.id,
            value_name: value.name,
            price_delta: Number(value.price_delta) || 0,
          })
        }
        for (const g of groups) {
          const count = countByGroup.get(g.id) ?? 0
          if (g.is_required && count < Math.max(1, g.min_select)) {
            return NextResponse.json(
              { error: `Falta elegir "${g.name}" en un platillo` },
              { status: 400 }
            )
          }
          if (count > g.max_select) {
            return NextResponse.json(
              { error: `Demasiadas opciones en "${g.name}"` },
              { status: 400 }
            )
          }
        }

        const price =
          basePrice + cleanModifiers.reduce((s, m) => s + m.price_delta, 0)
        cleanItems.push({
          item_id: raw.item_id,
          name: raw.name ?? "Producto",
          price,
          qty,
          modifiers: cleanModifiers.length ? cleanModifiers : undefined,
        })
      }
    }

    const baseTotals = computeOrderTotals(cleanItems, serverDeliveryFee, 0)

    // Cupón: validación server-side contra la BD (nunca confiar en el cliente).
    let couponDiscountValue = 0
    let couponCode: string | null = null
    if (body.coupon_code) {
      const { data: coupon } = await supabase
        .from("foodos_coupons")
        .select("*")
        .eq("restaurant_id", restaurant_id)
        .ilike("code", body.coupon_code.trim())
        .maybeSingle()
      const result = validateCoupon(coupon as FoodosCoupon | null, baseTotals.subtotal)
      if (!result.valid) {
        return NextResponse.json({ error: result.error ?? "Cupón no válido" }, { status: 400 })
      }
      couponDiscountValue = result.discount
      couponCode = (coupon as FoodosCoupon).code.toUpperCase()
    }

    const serverTip = Math.min(Math.max(Number(body.tip) || 0, 0), baseTotals.subtotal)
    const { subtotal, discount: cappedDiscount, tip: cappedTip, total } = computeOrderTotals(
      cleanItems,
      serverDeliveryFee,
      couponDiscountValue,
      serverTip
    )

    const payload = {
      restaurant_id,
      branch_id: branch_id ?? null,
      items: cleanItems,
      subtotal,
      discount: cappedDiscount,
      delivery_fee: serverDeliveryFee,
      tip: cappedTip,
      coupon_code: couponCode,
      total,
      channel,
      fulfillment,
      status: "pending",
      payment_method: payment_method || null,
      // tarjeta y transferencia quedan pendientes hasta pagar/confirmar
      payment_status: payment_method === "card" || payment_method === "transfer" ? "pending" : "paid",
      customer_name: customer_name || null,
      customer_phone: customer_phone || null,
      note: note || null,
      table_number: fulfillment === "dine_in" ? (table_number || null) : null,
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

    // Registrar uso del cupón (best-effort; el pedido ya se creó).
    if (couponCode) {
      await supabase.rpc("increment_foodos_coupon_usage", {
        p_restaurant_id: restaurant_id,
        p_code: couponCode,
      })
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
