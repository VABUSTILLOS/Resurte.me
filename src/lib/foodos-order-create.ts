// ============================================================
// Productor único de pedidos de FoodOS.
//
// Vive aquí y no en la ruta HTTP para que el micrositio público
// (`POST /api/foodos/orders`) y el Mesero IA de WhatsApp
// (`src/lib/foodos-ai-wa/orchestrator.ts`) compartan exactamente las mismas
// validaciones y el mismo cálculo de totales. Dos productores de totales es
// la forma más rápida de cobrar mal.
//
// Nunca confía en el cliente: precios, combos, modificadores, cupones,
// propina, puntos y crédito se recalculan contra la base de datos.
// ============================================================

import type { SupabaseClient } from "@supabase/supabase-js"
import { computeOrderTotals, validateCoupon } from "@/lib/foodos"
import { ensureDeliveryForOrder, quoteDelivery } from "@/lib/flotilla/deliveries"
import { isGeoPoint } from "@/lib/foodos-flotilla"
import {
  derivePaymentMethod,
  derivePaymentStatus,
  normalizePaymentBreakdown,
  validatePaymentBreakdown,
} from "@/lib/foodos-payments"
import { dispatchOrderCreated } from "@/lib/foodos-webhooks"
import { getOpenStatus } from "@/lib/foodos"
import { logger } from "@/lib/logger"
import type {
  FoodosBranchHours,
  FoodosCoupon,
  FoodosOrderChannel,
  FoodosOrderItem,
  FoodosOrderItemModifier,
  FoodosPaymentBreakdown,
} from "@/types/foodos"

const MAX_LINES = 20
const MAX_QTY_PER_LINE = 50

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

export interface FoodosOrderBody {
  restaurant_id: string
  branch_id?: string | null
  items: FoodosOrderItem[]
  delivery_fee?: number
  discount?: number
  channel?: FoodosOrderChannel
  fulfillment?: "delivery" | "pickup" | "dine_in"
  payment_method?: string | null
  customer_name?: string | null
  customer_phone?: string | null
  note?: string | null
  table_number?: string | null
  scheduled_for?: string | null
  delivery_address?: string | null
  delivery_lat?: number | null
  delivery_lng?: number | null
  delivery_notes?: string | null
  coupon_code?: string | null
  tip?: number
  redeem_points?: boolean
  use_credit?: boolean
}

/**
 * Contexto del punto de venta nativo. **Nunca** viene del cuerpo HTTP: se pasa
 * como tercer argumento desde las server actions del panel. Si estos campos
 * viajaran en el `body`, cualquiera podría atribuir su pedido en línea a un
 * turno de caja ajeno, o inventarse un folio.
 *
 * Un pedido con contexto de punto de venta tampoco se somete al horario
 * publicado: el cajero está físicamente en el local y sabe si puede vender.
 * Bloquear la caja porque la web dice "cerrado" sólo consigue que la venta se
 * registre en otro lado.
 */
export interface FoodosPosContext {
  /**
   * Folio consecutivo ya reservado con `foodos_next_folio`. Nulo en una comanda
   * de mesa: mandar platillos a cocina no es una venta, y el folio se reserva
   * una sola vez, al cerrar la cuenta. Un folio vacío en lugar de nulo chocaría
   * con el índice único de folios al segundo envío.
   */
  folio: string | null
  cashierUserId: string
  /**
   * Turno de caja al que se carga el movimiento. Nulo en una comanda cuando la
   * caja todavía no abre: bloquear la cocina porque el cajero llega tarde
   * dejaría al salón sin poder pedir. El cierre de la cuenta sí exige turno.
   */
  shiftId: string | null
  tableTicketId?: string | null
  /**
   * Si el cobro ya se cerró con el cliente. Por omisión `true` en el mostrador
   * (nadie cierra una venta sin cobrar); las cuentas de mesa abiertas pasan
   * `false` y quedan pendientes hasta el cierre.
   */
  settled?: boolean
  /**
   * `false` cuando el pedido sólo documenta un cobro y **no** es trabajo nuevo
   * de cocina: es el caso de la cuenta que cierra una mesa, cuyos platillos ya
   * se mandaron en sus comandas. Nace en estado terminal para no aparecer en el
   * KDS como una comanda fantasma. Por omisión `true`.
   */
  sendToKitchen?: boolean
}

export interface FoodosOrderOptions {
  pos?: FoodosPosContext
  /**
   * Cobro combinado. Sólo servidor, y sólo con el total ya recalculado: el
   * desglose es la única entrada del arqueo que no se puede derivar de
   * `payment_method`, así que si llegara del navegador se podría inflar el
   * efectivo esperado y esconder un faltante.
   */
  paymentBreakdown?: FoodosPaymentBreakdown
}

export type CreateFoodosOrderResult =
  | { ok: true; orderId: string; total: number; slug: string | null }
  | { ok: false; status: number; error: string; detail?: string; code?: string }

function fail(status: number, error: string): CreateFoodosOrderResult {
  return { ok: false, status, error }
}

/**
 * Valida y crea el pedido. Devuelve un resultado en vez de una respuesta HTTP
 * para que cada superficie lo traduzca a su propio formato.
 */
export async function createFoodosOrder(
  supabase: SupabaseClient,
  body: FoodosOrderBody,
  options: FoodosOrderOptions = {}
): Promise<CreateFoodosOrderResult> {
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
    scheduled_for,
  } = body

  const scheduledFor = scheduled_for ? new Date(scheduled_for) : null

  const missing: string[] = []
  if (!restaurant_id) missing.push("restaurant_id")
  if (!items?.length) missing.push("items")
  if (missing.length) {
    return fail(400, `Faltan campos requeridos: ${missing.join(", ")}`)
  }

  // Validar montos: NO confiar en el cliente. Cargar el menú real del
  // restaurante y recalcular precios server-side.
  const { data: restaurant } = await supabase
    .from("foodos_restaurants")
    .select("id, timezone")
    .eq("id", restaurant_id)
    .eq("status", "active")
    .maybeSingle()
  if (!restaurant) return fail(404, "Restaurante no encontrado o inactivo")

  let serverDeliveryFee = 0
  if (branch_id) {
    const { data: branch } = await supabase
      .from("foodos_branches")
      .select(
        "id, pickup_active, delivery_active, dine_in_active, delivery_fee, scheduled_orders_active, lead_minutes"
      )
      .eq("id", branch_id)
      .eq("restaurant_id", restaurant_id)
      .maybeSingle()
    if (!branch) return fail(400, "Sucursal no válida para este restaurante")
    if (fulfillment === "delivery" && !branch.delivery_active) {
      return fail(400, "Esta sucursal no ofrece entrega")
    }
    if (fulfillment === "pickup" && !branch.pickup_active) {
      return fail(400, "Esta sucursal no ofrece recolección")
    }
    if (fulfillment === "dine_in" && !branch.dine_in_active) {
      return fail(400, "Esta sucursal no ofrece servicio en mesa")
    }
    serverDeliveryFee = fulfillment === "delivery" ? Number(branch.delivery_fee) || 0 : 0

    // Pedido programado: solo si la sucursal lo permite y respeta el lead time.
    if (scheduledFor) {
      if (!branch.scheduled_orders_active) {
        return fail(400, "Esta sucursal no acepta pedidos programados")
      }
      const minTime = Date.now() + (Number(branch.lead_minutes) || 30) * 60_000
      const maxTime = Date.now() + 30 * 86_400_000
      const when = scheduledFor.getTime()
      if (Number.isNaN(when) || when < minTime || when > maxTime) {
        return fail(
          400,
          `El pedido debe programarse con al menos ${branch.lead_minutes ?? 30} minutos de anticipación (máx. 30 días)`
        )
      }
    }

    // Horario de operación: rechazar pedidos fuera de horario. El punto de venta
    // lo salta (ver `FoodosPosContext`).
    if (!options.pos) {
      const { data: hours } = await supabase
        .from("foodos_branch_hours")
        .select("branch_id, day_of_week, open_time, close_time, is_closed")
        .eq("branch_id", branch.id)
      if (hours?.length) {
        const status = getOpenStatus(hours as FoodosBranchHours[], restaurant.timezone)
        if (!status.isOpen) {
          return fail(400, status.nextOpenLabel ?? "La sucursal está cerrada por ahora")
        }
      }
    }
  }

  if (items.length > MAX_LINES) {
    return fail(400, `Máximo ${MAX_LINES} líneas por pedido`)
  }

  if (scheduledFor && !branch_id) {
    return fail(400, "Los pedidos programados requieren seleccionar sucursal")
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
      if (price === undefined) return fail(400, "Combo no válido en el pedido")
      cleanItems.push({
        item_id: raw.item_id,
        name: raw.name ?? "Combo",
        price,
        qty,
        combo_id: raw.combo_id,
      })
    } else {
      if (branchUnavailable.has(raw.item_id)) {
        return fail(400, "Un platillo no está disponible en esta sucursal")
      }
      const basePrice = branchPriceOverride.get(raw.item_id) ?? itemPrice.get(raw.item_id)
      if (basePrice === undefined) return fail(400, "Platillo no válido en el pedido")

      // Validar modificadores: pertenencia al ítem, disponibilidad y
      // límites min/max por grupo. El precio se recalcula en servidor.
      const groups = groupsByItem.get(raw.item_id) ?? []
      const cleanModifiers: FoodosOrderItemModifier[] = []
      const countByGroup = new Map<string, number>()
      for (const m of raw.modifiers ?? []) {
        const value = valueById.get(m.value_id)
        if (!value || !value.is_available) {
          return fail(400, "Modificador no válido en el pedido")
        }
        const group = groups.find((g) => g.id === value.group_id && g.id === m.group_id)
        if (!group) return fail(400, "Modificador no pertenece al platillo")
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
          return fail(400, `Falta elegir "${g.name}" en un platillo`)
        }
        if (count > g.max_select) {
          return fail(400, `Demasiadas opciones en "${g.name}"`)
        }
      }

      const price = basePrice + cleanModifiers.reduce((s, m) => s + m.price_delta, 0)
      cleanItems.push({
        item_id: raw.item_id,
        name: raw.name ?? "Producto",
        price,
        qty,
        modifiers: cleanModifiers.length ? cleanModifiers : undefined,
      })
    }
  }

  // Tarifa de entrega: la decide el servidor, nunca el navegador. Con zonas
  // configuradas se cotiza contra el domicilio; sin zonas (o sin coordenadas)
  // cae a la tarifa plana de la sucursal.
  const itemsSubtotal = cleanItems.reduce((sum, i) => sum + i.price * i.qty, 0)
  if (fulfillment === "delivery" && branch_id) {
    const candidate = { lat: body.delivery_lat, lng: body.delivery_lng }
    const quote = await quoteDelivery(supabase, {
      restaurantId: restaurant_id,
      branchId: branch_id,
      branchFee: serverDeliveryFee,
      subtotal: itemsSubtotal,
      point: isGeoPoint(candidate) ? candidate : null,
    })
    if (quote.reason === "unavailable") {
      return fail(400, "No entregamos en esta dirección")
    }
    if (quote.reason === "below_minimum") {
      return fail(
        400,
        `El pedido mínimo para entrega a esta dirección es de $${quote.minOrder}`
      )
    }
    serverDeliveryFee = quote.fee
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
    if (!result.valid) return fail(400, result.error ?? "Cupón no válido")
    couponDiscountValue = result.discount
    couponCode = (coupon as FoodosCoupon).code.toUpperCase()
  }

  const serverTip = Math.min(Math.max(Number(body.tip) || 0, 0), baseTotals.subtotal)

  // Lealtad: canje de puntos y store credit (server-side contra el CRM).
  let loyaltyDiscount = 0
  let redeemedPoints = 0
  let usedCredit = 0
  let loyaltyCustomerId: string | null = null
  if ((body.redeem_points || body.use_credit) && customer_phone) {
    const phone = customer_phone.replace(/\D/g, "")
    const [programRes, customerRes] = await Promise.all([
      supabase
        .from("foodos_loyalty_programs")
        .select("points_per_100, point_value, is_active")
        .eq("restaurant_id", restaurant_id)
        .eq("is_active", true)
        .maybeSingle(),
      supabase
        .from("foodos_customers")
        .select("id, loyalty_points, store_credit")
        .eq("restaurant_id", restaurant_id)
        .eq("phone", phone)
        .maybeSingle(),
    ])
    const program = programRes.data
    const customer = customerRes.data
    if (program && customer) {
      loyaltyCustomerId = customer.id
      const afterCoupon = baseTotals.subtotal - couponDiscountValue
      if (body.redeem_points && customer.loyalty_points > 0) {
        const maxPointsValue = customer.loyalty_points * Number(program.point_value)
        const applied = Math.min(maxPointsValue, afterCoupon)
        redeemedPoints = Math.ceil(applied / Number(program.point_value))
        loyaltyDiscount += redeemedPoints * Number(program.point_value)
      }
      if (body.use_credit && Number(customer.store_credit) > 0) {
        usedCredit = Math.min(Number(customer.store_credit), afterCoupon - loyaltyDiscount)
        loyaltyDiscount += usedCredit
      }
    }
  }

  const { subtotal, discount: cappedDiscount, tip: cappedTip, total } = computeOrderTotals(
    cleanItems,
    serverDeliveryFee,
    couponDiscountValue + loyaltyDiscount,
    serverTip
  )

  // Cobro combinado: se valida contra el total recién recalculado y se
  // normaliza aquí, para que el ticket y el arqueo lean el mismo objeto.
  let paymentBreakdown: FoodosPaymentBreakdown | null = null
  if (options.paymentBreakdown) {
    const check = validatePaymentBreakdown(options.paymentBreakdown, total)
    if (!check.ok) return fail(400, check.error)
    paymentBreakdown = normalizePaymentBreakdown(options.paymentBreakdown)
  }

  const serverPaymentMethod = derivePaymentMethod(
    options.paymentBreakdown,
    payment_method ?? null
  )
  const settled = options.pos ? options.pos.settled !== false : undefined

  const payload = {
    restaurant_id,
    branch_id: branch_id ?? null,
    items: cleanItems,
    subtotal,
    discount: cappedDiscount,
    delivery_fee: serverDeliveryFee,
    tip: cappedTip,
    coupon_code: couponCode,
    loyalty_points_redeemed: redeemedPoints,
    total,
    channel,
    fulfillment,
    // Un pedido capturado por el personal (caja o mesero) nace confirmado: nadie
    // lo teclea si no lo va a preparar, así que no tiene sentido dejarlo en la
    // bandeja de "por confirmar". La cuenta que cierra una mesa nace en estado
    // terminal porque su comida ya se mandó en las comandas. Los pedidos en
    // línea sí siguen naciendo `pending`: el dueño los confirma al verificar el
    // pago.
    status: options.pos
      ? options.pos.sendToKitchen === false
        ? "delivered"
        : "confirmed"
      : "pending",
    payment_method: serverPaymentMethod,
    payment_breakdown: paymentBreakdown,
    payment_status: derivePaymentStatus(serverPaymentMethod, settled),
    // Contexto del punto de venta nativo. Sólo llega por `options`, nunca por
    // el cuerpo HTTP, así que un pedido en línea no puede atribuirse un turno.
    folio: options.pos?.folio ?? null,
    cashier_user_id: options.pos?.cashierUserId ?? null,
    pos_shift_id: options.pos?.shiftId ?? null,
    table_ticket_id: options.pos?.tableTicketId ?? null,
    customer_name: customer_name || null,
    customer_phone: customer_phone || null,
    note: note || null,
    table_number: fulfillment === "dine_in" ? (table_number || null) : null,
    scheduled_for: scheduledFor ? scheduledFor.toISOString() : null,
    // La dirección solo tiene sentido en entrega; en recolección se descarta.
    delivery_address:
      fulfillment === "delivery" ? body.delivery_address?.trim() || null : null,
    delivery_lat: fulfillment === "delivery" ? body.delivery_lat ?? null : null,
    delivery_lng: fulfillment === "delivery" ? body.delivery_lng ?? null : null,
    delivery_notes:
      fulfillment === "delivery" ? body.delivery_notes?.trim() || null : null,
  }

  const { data: order, error: orderError } = await supabase
    .from("foodos_orders")
    .insert(payload)
    .select("id, total, restaurant_id, slug, customer_id")
    .single()

  if (orderError) {
    logger.error("FoodOS order error:", orderError)
    return {
      ok: false,
      status: 500,
      error: "Error al crear el pedido",
      detail: orderError.message,
      code: orderError.code,
    }
  }

  // Registrar uso del cupón (best-effort; el pedido ya se creó).
  if (couponCode) {
    await supabase.rpc("increment_foodos_coupon_usage", {
      p_restaurant_id: restaurant_id,
      p_code: couponCode,
    })
  }

  // Descontar puntos/crédito canjeados del balance del cliente.
  if (loyaltyCustomerId && (redeemedPoints > 0 || usedCredit > 0)) {
    const { data: cust } = await supabase
      .from("foodos_customers")
      .select("loyalty_points, store_credit")
      .eq("id", loyaltyCustomerId)
      .single()
    if (cust) {
      await supabase
        .from("foodos_customers")
        .update({
          loyalty_points: Math.max(0, cust.loyalty_points - redeemedPoints),
          store_credit: Math.max(0, Number(cust.store_credit) - usedCredit),
        })
        .eq("id", loyaltyCustomerId)
    }
  }

  // Flotilla: crear la entrega si el pedido es a domicilio. Es idempotente por
  // `order_id` y nunca lanza: un pedido confirmado no se cae porque la
  // logística falle.
  if (fulfillment === "delivery") {
    const delivery = await ensureDeliveryForOrder(supabase, {
      orderId: order.id,
      restaurantId: restaurant_id,
      branchId: branch_id ?? null,
      dropoffAddress: body.delivery_address ?? null,
      dropoffLat: body.delivery_lat ?? null,
      dropoffLng: body.delivery_lng ?? null,
      dropoffNotes: body.delivery_notes ?? null,
      fee: serverDeliveryFee,
    })
    if (!delivery.ok && delivery.reason === "no_address") {
      logger.warn("[Flotilla] Pedido a domicilio sin dirección de entrega", {
        orderId: order.id,
      })
    }
  }

  // Tarjeta de lealtad: el comensal la recibe al hacer su primer pedido, si el
  // restaurante está en Diamante. Best-effort: el pedido ya está confirmado y
  // la tarjeta es un extra, no un requisito.
  await maybeIssueWalletPass(supabase, restaurant_id, order.customer_id ?? null)

  // Webhooks salientes: notificar order.created (nunca bloquea la respuesta).
  await dispatchOrderCreated(supabase, restaurant_id, {
    ...payload,
    id: order.id,
  })

  return { ok: true, orderId: order.id, total, slug: order.slug ?? null }
}

/**
 * Emite la tarjeta `web` del comensal cuando el restaurante tiene el nivel.
 *
 * El nivel se resuelve contra el mismo módulo que usa el panel, para que la
 * emisión automática y la manual nunca discrepen. Nunca lanza: cualquier fallo
 * se registra y el pedido sigue su curso.
 */
async function maybeIssueWalletPass(
  supabase: SupabaseClient,
  restaurantId: string,
  customerId: string | null
): Promise<void> {
  if (!customerId) return
  try {
    const [{ getRestaurantEntitlements }, { hasFeature }, { ensureWebWalletPass }] =
      await Promise.all([
        import("@/lib/foodos-tier"),
        import("@/lib/foodos-entitlements"),
        import("@/lib/foodos-wallet/passes"),
      ])
    const entitlements = await getRestaurantEntitlements(restaurantId)
    if (!hasFeature(entitlements.tier, "wallet_passes")) return
    await ensureWebWalletPass(supabase, restaurantId, customerId)
  } catch (err) {
    logger.warn("[Wallet] No se pudo emitir la tarjeta del pedido", {
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
