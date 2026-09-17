"use server"

// ============================================================
// Server Actions del punto de venta de mostrador
// (`/panel/foodos/mostrador`).
//
// El cajero cobra de pie y con prisa, así que aquí no se recalcula nada: los
// totales los sigue produciendo `createFoodosOrder`, el productor único. Lo que
// este archivo aporta es lo que sólo el punto de venta tiene:
//
//   1. Nivel Diamante verificado en servidor, antes de la sesión.
//   2. **Turno de caja abierto obligatorio.** Sin turno, la venta no tiene
//      dónde colgarse y desaparece del arqueo del día.
//   3. Folio consecutivo reservado con `foodos_next_folio`, nunca con un
//      contador en el navegador.
//   4. Cobro combinado validado contra el total recalculado: es la única
//      entrada del arqueo que no se puede derivar de `payment_method`.
// ============================================================

import { revalidatePath } from "next/cache"

import { assertOwnRestaurant } from "@/lib/foodos-owner"
import { requireFoodosAuth } from "@/lib/foodos-operating"
import { createFoodosOrder } from "@/lib/foodos-order-create"
import { isGeoPoint } from "@/lib/foodos-flotilla"
import { quoteDelivery } from "@/lib/flotilla/deliveries"
import { isPaymentMethod } from "@/lib/foodos-payments"
import { findOpenShift, isNoOpenShiftError, requireOpenShift, type ShiftRow } from "@/lib/foodos-shift"
import { requireFoodosFeature } from "@/lib/foodos-tier"
import { logger } from "@/lib/logger"
import type {
  FoodosCombo,
  FoodosItemOptionGroup,
  FoodosItemOptionValue,
  FoodosMenuCategory,
  FoodosMenuItem,
  FoodosOrderItem,
  FoodosPaymentBreakdown,
} from "@/types/foodos"

/** Misma capacidad Diamante que gobierna caja, folios e impresión. */
const MOSTRADOR_FEATURE = "pos_mostrador" as const

/** Tipo de servicio del mostrador. No confundir con el canal del pedido. */
export type MostradorService = "takeaway" | "delivery" | "dine_in"

/** `fulfillment` que le corresponde a cada tipo de servicio. */
const SERVICE_FULFILLMENT: Record<MostradorService, "pickup" | "delivery" | "dine_in"> = {
  takeaway: "pickup",
  delivery: "delivery",
  dine_in: "dine_in",
}

export interface MostradorBranch {
  id: string
  name: string
  pickup_active: boolean
  delivery_active: boolean
  dine_in_active: boolean
}

/** Precio y disponibilidad que la sucursal pisa sobre el menú base. */
export interface MostradorOverride {
  item_id: string
  price: number | null
  is_available: boolean | null
}

export interface MostradorData {
  restaurant: { id: string; name: string; slug: string | null; timezone: string }
  branches: MostradorBranch[]
  categories: FoodosMenuCategory[]
  items: FoodosMenuItem[]
  combos: FoodosCombo[]
  optionGroups: FoodosItemOptionGroup[]
  optionValues: FoodosItemOptionValue[]
  overrides: MostradorOverride[]
  /**
   * Turno abierto del alcance. `null` significa que la caja está cerrada y el
   * mostrador debe mostrar el aviso en lugar del catálogo.
   */
  shift: ShiftRow | null
}

/** Lecturas: degradan a `null` en vez de romper la pantalla. */
async function canUseMostrador(): Promise<boolean> {
  try {
    await requireFoodosFeature(MOSTRADOR_FEATURE)
    return true
  } catch {
    return false
  }
}

/**
 * Todo lo que necesita la pantalla de mostrador, en un solo viaje.
 *
 * El menú se lee completo (también lo no disponible) porque el cajero necesita
 * ver que un platillo se agotó, no que desaparezca sin explicación.
 */
export async function getMostradorData(
  restaurantId: string,
  branchId?: string | null
): Promise<MostradorData | null> {
  if (!(await canUseMostrador())) return null
  const { supabase, ownerUserId } = await requireFoodosAuth()
  await assertOwnRestaurant(supabase, ownerUserId, restaurantId)

  const scope = branchId ?? null

  const [restaurantRes, branchesRes, categoriesRes, itemsRes, combosRes, groupsRes, valuesRes, overridesRes, shift] =
    await Promise.all([
      supabase
        .from("foodos_restaurants")
        .select("id, name, slug, timezone")
        .eq("id", restaurantId)
        .maybeSingle(),
      supabase
        .from("foodos_branches")
        .select("id, name, pickup_active, delivery_active, dine_in_active")
        .eq("restaurant_id", restaurantId)
        .order("created_at"),
      supabase
        .from("foodos_menu_categories")
        .select("*")
        .eq("restaurant_id", restaurantId)
        .order("sort_order"),
      supabase
        .from("foodos_menu_items")
        .select("*")
        .eq("restaurant_id", restaurantId)
        .order("sort_order"),
      supabase.from("foodos_combos").select("*").eq("restaurant_id", restaurantId),
      supabase.from("foodos_item_option_groups").select("*").eq("restaurant_id", restaurantId),
      supabase.from("foodos_item_option_values").select("*").eq("restaurant_id", restaurantId),
      scope
        ? supabase
            .from("foodos_branch_menu_overrides")
            .select("item_id, price, is_available")
            .eq("branch_id", scope)
        : Promise.resolve({ data: [] as MostradorOverride[], error: null }),
      findOpenShift(supabase, restaurantId, scope),
    ])

  const restaurant = restaurantRes.data as MostradorData["restaurant"] | null
  if (!restaurant) return null

  return {
    restaurant,
    branches: (branchesRes.data as MostradorBranch[] | null) ?? [],
    categories: (categoriesRes.data as FoodosMenuCategory[] | null) ?? [],
    items: (itemsRes.data as FoodosMenuItem[] | null) ?? [],
    combos: (combosRes.data as FoodosCombo[] | null) ?? [],
    optionGroups: (groupsRes.data as FoodosItemOptionGroup[] | null) ?? [],
    optionValues: (valuesRes.data as FoodosItemOptionValue[] | null) ?? [],
    overrides: (overridesRes.data as MostradorOverride[] | null) ?? [],
    shift,
  }
}

export interface MostradorSaleInput {
  restaurant_id: string
  branch_id?: string | null
  items: FoodosOrderItem[]
  service: MostradorService
  /** Forma de pago única… */
  payment_method?: string | null
  /** …o desglose combinado. Exactamente uno de los dos. */
  payment_breakdown?: FoodosPaymentBreakdown
  customer_name?: string | null
  customer_phone?: string | null
  note?: string | null
  table_number?: string | null
  delivery_address?: string | null
  delivery_lat?: number | null
  delivery_lng?: number | null
  delivery_notes?: string | null
  tip?: number
  coupon_code?: string | null
}

export interface MostradorSaleResult {
  ok: boolean
  error?: string
  orderId?: string
  folio?: string
  total?: number
  change?: number | null
}

function fail(error: string): MostradorSaleResult {
  return { ok: false, error }
}

/**
 * Cobra una venta de mostrador.
 *
 * Orden de las comprobaciones, de más barata a más cara: nivel → sesión →
 * propiedad → turno abierto → forma de pago → folio → productor único. El folio
 * se reserva al final para no quemar un número en un intento que va a fallar.
 */
export async function createMostradorSale(
  input: MostradorSaleInput
): Promise<MostradorSaleResult> {
  await requireFoodosFeature(MOSTRADOR_FEATURE)
  const { supabase, user, ownerUserId } = await requireFoodosAuth()
  await assertOwnRestaurant(supabase, ownerUserId, input.restaurant_id)

  const fulfillment = SERVICE_FULFILLMENT[input.service]
  if (!fulfillment) return fail("Tipo de servicio no reconocido.")
  if (!input.items?.length) return fail("El ticket está vacío.")

  const branchId = input.branch_id ?? null

  // El turno se exige antes de tocar el menú: sin caja abierta no hay venta.
  let shift: ShiftRow
  try {
    shift = await requireOpenShift(supabase, input.restaurant_id, branchId)
  } catch (error) {
    if (isNoOpenShiftError(error)) return fail(error.message)
    throw error
  }

  const breakdown = input.payment_breakdown?.parts?.length ? input.payment_breakdown : undefined
  const method = input.payment_method ?? null
  if (!breakdown && !isPaymentMethod(method)) {
    return fail("Elige una forma de pago.")
  }
  if (breakdown && method) {
    return fail("Un cobro combinado no lleva además una forma de pago suelta.")
  }

  if (input.service === "delivery" && !input.delivery_address?.trim()) {
    return fail("La entrega a domicilio necesita una dirección.")
  }

  // Folio consecutivo del restaurante y sucursal, atómico en la base.
  const { data: folio, error: folioError } = await supabase.rpc("foodos_next_folio", {
    p_restaurant_id: input.restaurant_id,
    p_branch_id: branchId,
  })
  if (folioError || typeof folio !== "string") {
    logger.error("foodos.mostrador.folio", { error: folioError?.message })
    return fail("No se pudo reservar el folio de la venta.")
  }

  const result = await createFoodosOrder(
    supabase,
    {
      restaurant_id: input.restaurant_id,
      branch_id: branchId,
      items: input.items,
      channel: "mostrador",
      fulfillment,
      payment_method: method,
      customer_name: input.customer_name ?? null,
      customer_phone: input.customer_phone ?? null,
      note: input.note ?? null,
      table_number: input.table_number ?? null,
      delivery_address: input.delivery_address ?? null,
      delivery_lat: input.delivery_lat ?? null,
      delivery_lng: input.delivery_lng ?? null,
      delivery_notes: input.delivery_notes ?? null,
      tip: input.tip ?? 0,
      coupon_code: input.coupon_code ?? null,
    },
    {
      pos: {
        folio,
        cashierUserId: user.id,
        shiftId: shift.id,
        // Nadie cierra una venta de mostrador sin haber cobrado.
        settled: true,
      },
      paymentBreakdown: breakdown,
    }
  )

  if (!result.ok) {
    logger.warn("foodos.mostrador.sale", { error: result.error, code: result.code })
    return fail(result.error)
  }

  revalidatePath("/panel/foodos/mostrador")
  revalidatePath("/panel/foodos/caja")
  revalidatePath("/panel/foodos/pedidos")

  return {
    ok: true,
    orderId: result.orderId,
    folio,
    total: result.total,
    change: breakdown?.change ?? null,
  }
}

export interface MostradorQuote {
  ok: boolean
  error?: string
  /** Tarifa de entrega cotizada por el servidor. */
  deliveryFee?: number
  etaMinutes?: number | null
}

/**
 * Cotiza la entrega de una venta de mostrador **sin crearla**.
 *
 * Existe porque el cobro a domicilio puede rechazarse por dos motivos que el
 * cajero tiene que ver antes de tomar el dinero: la dirección está fuera de las
 * zonas, o el pedido no llega al mínimo de la zona. Reproduce la misma llamada
 * que hace `createFoodosOrder`, así que la cifra que se le dice al cliente es la
 * que se le va a cobrar.
 */
export async function quoteMostradorDelivery(input: {
  restaurant_id: string
  branch_id?: string | null
  subtotal: number
  delivery_lat?: number | null
  delivery_lng?: number | null
}): Promise<MostradorQuote> {
  await requireFoodosFeature(MOSTRADOR_FEATURE)
  const { supabase, ownerUserId } = await requireFoodosAuth()
  await assertOwnRestaurant(supabase, ownerUserId, input.restaurant_id)

  const branchId = input.branch_id ?? null
  if (!branchId) return { ok: false, error: "Elige una sucursal para cotizar la entrega." }

  const { data: branch, error } = await supabase
    .from("foodos_branches")
    .select("delivery_active, delivery_fee")
    .eq("id", branchId)
    .maybeSingle()
  if (error) return { ok: false, error: error.message }

  const b = branch as Pick<MostradorBranch, "delivery_active"> & { delivery_fee: number | null } | null
  if (!b?.delivery_active) return { ok: false, error: "Esta sucursal no entrega a domicilio." }

  const candidate = { lat: input.delivery_lat, lng: input.delivery_lng }
  const quote = await quoteDelivery(supabase, {
    restaurantId: input.restaurant_id,
    branchId,
    branchFee: Number(b.delivery_fee) || 0,
    subtotal: Math.max(0, Number(input.subtotal) || 0),
    point: isGeoPoint(candidate) ? candidate : null,
  })

  if (quote.reason === "unavailable") return { ok: false, error: "No entregamos en esta dirección." }
  if (quote.reason === "below_minimum") {
    return {
      ok: false,
      error: `El pedido mínimo para entrega a esta dirección es de $${quote.minOrder}`,
    }
  }

  return { ok: true, deliveryFee: quote.fee, etaMinutes: quote.etaMinutes }
}
