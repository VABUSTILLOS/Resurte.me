"use server"

// ============================================================
// Server Actions del comandero de mesas (`/panel/foodos/mesas`).
//
// El mesero trabaja de pie y en movimiento, así que aquí no se recalcula nada:
// los totales los sigue produciendo `createFoodosOrder`, el productor único. Lo
// que este archivo aporta es lo que sólo tiene el comandero:
//
//   1. Nivel Diamante verificado en servidor, antes de la sesión.
//   2. **Una fila por envío a cocina** (`channel: "mesero"`, pendiente de pago)
//      más **una fila al cerrar la cuenta** (`payment_status: "paid"`). Así el
//      KDS recibe cada comanda cuando se pide, y el arqueo cuenta la mesa
//      exactamente una vez, en el cierre. Nunca se cuentan filas.
//   3. **Folio sólo al cerrar.** Mandar platillos a cocina no es una venta: la
//      comanda va con `folio: null` y el número se reserva una sola vez, al
//      cobrar, para que la numeración no tenga huecos por cada envío.
//   4. Cuentas por mesa con un índice único parcial: una mesa no puede tener
//      dos cuentas abiertas, y transferir o unir mesas se bloquea con un
//      mensaje claro en vez de duplicar el cobro.
// ============================================================

import { revalidatePath } from "next/cache"
import type { SupabaseClient } from "@supabase/supabase-js"

import { assertOwnRestaurant } from "@/lib/foodos-owner"
import { requireFoodosAuth } from "@/lib/foodos-operating"
import { createFoodosOrder } from "@/lib/foodos-order-create"
import { isPaymentMethod } from "@/lib/foodos-payments"
import { findOpenShift, isNoOpenShiftError, requireOpenShift } from "@/lib/foodos-shift"
import {
  clampPosition,
  isTableShape,
  TABLE_MIN_SIZE,
  ZONE_DEFAULT_HEIGHT,
  ZONE_DEFAULT_WIDTH,
  type MesasTable,
  type MesasZone,
  type TableShape,
  type TableTicket,
} from "@/lib/foodos-tables"
import { requireFoodosFeature } from "@/lib/foodos-tier"
import { createServiceClient } from "@/lib/supabase/service"
import { logger } from "@/lib/logger"
import type {
  FoodosCombo,
  FoodosItemOptionGroup,
  FoodosItemOptionValue,
  FoodosMenuCategory,
  FoodosMenuItem,
  FoodosOrder,
  FoodosOrderItem,
  FoodosPaymentBreakdown,
} from "@/types/foodos"

/** Capacidad Diamante que gobierna el mapa de mesas y las cuentas abiertas. */
const MESAS_FEATURE = "comandero" as const

/** Tope de comensales por cuenta: más que esto no es una mesa, es un banquete. */
const MAX_GUESTS = 50

export interface MesasBranch {
  id: string
  name: string
  dine_in_active: boolean
}

export interface MesasRestaurant {
  id: string
  name: string
  slug: string | null
  timezone: string
}

/** Precio o disponibilidad propios de la sucursal; mandan sobre el menú base. */
export interface MesasOverride {
  item_id: string
  price: number | null
  is_available: boolean | null
}

export interface MesasData {
  restaurant: MesasRestaurant
  branches: MesasBranch[]
  zones: MesasZone[]
  tables: MesasTable[]
  /** Cuentas abiertas, listas para pintar el mapa. */
  tickets: TableTicket[]
  /** Pedidos de esas cuentas: las comandas pendientes y la cuenta cobrada. */
  orders: FoodosOrder[]
  /** Turno abierto del alcance. `null` = la caja está cerrada y no se puede cobrar. */
  shiftId: string | null
  // El menú viaja en la misma carga porque el mesero lo necesita para agregar
  // platillos, y pedirlo aparte obligaría a un segundo viaje con la mesa abierta.
  categories: FoodosMenuCategory[]
  items: FoodosMenuItem[]
  combos: FoodosCombo[]
  optionGroups: FoodosItemOptionGroup[]
  optionValues: FoodosItemOptionValue[]
  overrides: MesasOverride[]
}

export interface MesasResult {
  ok: boolean
  error?: string
  id?: string
}

function fail(error: string): MesasResult {
  return { ok: false, error }
}

/** Lecturas: degradan a `null` en vez de romper la pantalla. */
async function canUseMesas(): Promise<boolean> {
  try {
    await requireFoodosFeature(MESAS_FEATURE)
    return true
  } catch {
    return false
  }
}

function revalidateMesas() {
  revalidatePath("/panel/foodos/mesas")
  revalidatePath("/panel/foodos/pedidos")
}

/**
 * Consultas acotadas al alcance. Siguen la convención de los turnos de caja:
 * sin sucursal se lee lo que no tiene sucursal, no "todas las sucursales",
 * porque mezclar los salones de dos sucursales en un mismo mapa no tiene
 * sentido.
 */
function scopedZones(supabase: SupabaseClient, restaurantId: string, branchId: string | null) {
  const query = supabase.from("foodos_table_zones").select("*").eq("restaurant_id", restaurantId)
  return branchId ? query.eq("branch_id", branchId) : query.is("branch_id", null)
}

function scopedTables(supabase: SupabaseClient, restaurantId: string, branchId: string | null) {
  const query = supabase.from("foodos_tables").select("*").eq("restaurant_id", restaurantId)
  return branchId ? query.eq("branch_id", branchId) : query.is("branch_id", null)
}

function scopedTickets(supabase: SupabaseClient, restaurantId: string, branchId: string | null) {
  const query = supabase
    .from("foodos_table_tickets")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .eq("status", "open")
  return branchId ? query.eq("branch_id", branchId) : query.is("branch_id", null)
}

/**
 * Todo lo que necesita el mapa de mesas, en dos viajes: primero el salón y las
 * cuentas abiertas, después los pedidos de esas cuentas (que dependen de los
 * identificadores del primer viaje).
 */
export async function getMesasData(
  restaurantId: string,
  branchId?: string | null
): Promise<MesasData | null> {
  if (!(await canUseMesas())) return null
  const { supabase, ownerUserId } = await requireFoodosAuth()
  await assertOwnRestaurant(supabase, ownerUserId, restaurantId)

  // Mismo caso que en el mostrador: `foodos_menu_items.cost` es privada
  // (00193) y la fila se usa como `FoodosMenuItem`. La propiedad ya se
  // comprobó arriba y la consulta va acotada a `restaurantId`.
  const menuDb = await createServiceClient()

  const scope = branchId ?? null

  const [
    restaurantRes,
    branchesRes,
    zonesRes,
    tablesRes,
    ticketsRes,
    categoriesRes,
    itemsRes,
    combosRes,
    groupsRes,
    valuesRes,
    overridesRes,
    shift,
  ] = await Promise.all([
    supabase
      .from("foodos_restaurants")
      .select("id, name, slug, timezone")
      .eq("id", restaurantId)
      .maybeSingle(),
    supabase
      .from("foodos_branches")
      .select("id, name, dine_in_active")
      .eq("restaurant_id", restaurantId)
      .order("created_at"),
    scopedZones(supabase, restaurantId, scope).order("sort_order"),
    scopedTables(supabase, restaurantId, scope).order("label"),
    scopedTickets(supabase, restaurantId, scope).order("opened_at"),
    supabase
      .from("foodos_menu_categories")
      .select("*")
      .eq("restaurant_id", restaurantId)
      .order("sort_order"),
    menuDb
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
      : Promise.resolve({ data: [] as MesasOverride[], error: null }),
    findOpenShift(supabase, restaurantId, scope),
  ])

  const restaurant = restaurantRes.data as MesasRestaurant | null
  if (!restaurant) return null

  const tickets = (ticketsRes.data as TableTicket[] | null) ?? []
  const ticketIds = tickets.map((ticket) => ticket.id)

  let orders: FoodosOrder[] = []
  if (ticketIds.length) {
    const ordersRes = await supabase
      .from("foodos_orders")
      .select("*")
      .in("table_ticket_id", ticketIds)
      .order("created_at")
    orders = (ordersRes.data as unknown as FoodosOrder[] | null) ?? []
  }

  return {
    restaurant,
    branches: (branchesRes.data as MesasBranch[] | null) ?? [],
    zones: (zonesRes.data as MesasZone[] | null) ?? [],
    tables: (tablesRes.data as MesasTable[] | null) ?? [],
    tickets,
    orders,
    shiftId: shift?.id ?? null,
    categories: (categoriesRes.data as FoodosMenuCategory[] | null) ?? [],
    items: (itemsRes.data as FoodosMenuItem[] | null) ?? [],
    combos: (combosRes.data as FoodosCombo[] | null) ?? [],
    optionGroups: (groupsRes.data as FoodosItemOptionGroup[] | null) ?? [],
    optionValues: (valuesRes.data as FoodosItemOptionValue[] | null) ?? [],
    overrides: (overridesRes.data as MesasOverride[] | null) ?? [],
  }
}

// ------------------------------------------------------------
// Lecturas auxiliares compartidas por las acciones
// ------------------------------------------------------------

/** Cuenta abierta por identificador. `null` si no existe, no es del restaurante o ya se cerró. */
async function loadOpenTicket(
  supabase: SupabaseClient,
  restaurantId: string,
  ticketId: string
): Promise<TableTicket | null> {
  const { data } = await supabase
    .from("foodos_table_tickets")
    .select("*")
    .eq("id", ticketId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle()
  const ticket = data as TableTicket | null
  if (!ticket || ticket.status !== "open") return null
  return ticket
}

interface TableLookup {
  id: string
  label: string
  branch_id: string | null
  is_active: boolean
}

async function loadTable(
  supabase: SupabaseClient,
  restaurantId: string,
  tableId: string
): Promise<TableLookup | null> {
  const { data } = await supabase
    .from("foodos_tables")
    .select("id, label, branch_id, is_active")
    .eq("id", tableId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle()
  return (data as TableLookup | null) ?? null
}

/** Cuenta abierta de una mesa, si la hay. */
async function openTicketForTable(
  supabase: SupabaseClient,
  tableId: string
): Promise<{ id: string } | null> {
  const { data } = await supabase
    .from("foodos_table_tickets")
    .select("id")
    .eq("table_id", tableId)
    .eq("status", "open")
    .maybeSingle()
  return (data as { id: string } | null) ?? null
}

// ------------------------------------------------------------
// Acomodo: zonas y mesas
// ------------------------------------------------------------

export interface SaveZoneInput {
  restaurant_id: string
  branch_id?: string | null
  /** Sin `id` se crea; con `id` se renombra o se redimensiona. */
  id?: string
  name: string
  sort_order?: number
  width?: number
  height?: number
}

export async function saveZone(input: SaveZoneInput): Promise<MesasResult> {
  await requireFoodosFeature(MESAS_FEATURE)
  const { supabase, ownerUserId } = await requireFoodosAuth()
  await assertOwnRestaurant(supabase, ownerUserId, input.restaurant_id)

  const name = input.name?.trim()
  if (!name) return fail("Ponle nombre a la zona.")

  const payload = {
    name,
    sort_order: Math.trunc(input.sort_order ?? 0) || 0,
    width: Math.max(200, Math.trunc(input.width ?? ZONE_DEFAULT_WIDTH) || ZONE_DEFAULT_WIDTH),
    height: Math.max(200, Math.trunc(input.height ?? ZONE_DEFAULT_HEIGHT) || ZONE_DEFAULT_HEIGHT),
  }

  if (input.id) {
    const { error } = await supabase
      .from("foodos_table_zones")
      .update(payload)
      .eq("id", input.id)
      .eq("restaurant_id", input.restaurant_id)
    if (error) {
      logger.error("foodos.mesas.saveZone", { error: error.message })
      return fail("No se pudo guardar la zona.")
    }
    revalidateMesas()
    return { ok: true, id: input.id }
  }

  const { data, error } = await supabase
    .from("foodos_table_zones")
    .insert({ ...payload, restaurant_id: input.restaurant_id, branch_id: input.branch_id ?? null })
    .select("id")
    .single()
  if (error || !data) {
    logger.error("foodos.mesas.saveZone", { error: error?.message })
    return fail("No se pudo crear la zona.")
  }
  revalidateMesas()
  return { ok: true, id: (data as { id: string }).id }
}

export async function deleteZone(input: {
  restaurant_id: string
  id: string
}): Promise<MesasResult> {
  await requireFoodosFeature(MESAS_FEATURE)
  const { supabase, ownerUserId } = await requireFoodosAuth()
  await assertOwnRestaurant(supabase, ownerUserId, input.restaurant_id)

  // `foodos_tables.zone_id` es ON DELETE SET NULL, así que borrar la zona no
  // borraría las mesas: las dejaría sin acomodo. Se avisa en vez de sorprender.
  const { count } = await supabase
    .from("foodos_tables")
    .select("id", { count: "exact", head: true })
    .eq("zone_id", input.id)

  if ((count ?? 0) > 0) {
    return fail("Mueve o borra las mesas de esta zona antes de borrarla.")
  }

  const { error } = await supabase
    .from("foodos_table_zones")
    .delete()
    .eq("id", input.id)
    .eq("restaurant_id", input.restaurant_id)
  if (error) {
    logger.error("foodos.mesas.deleteZone", { error: error.message })
    return fail("No se pudo borrar la zona.")
  }
  revalidateMesas()
  return { ok: true }
}

export interface SaveTableInput {
  restaurant_id: string
  branch_id?: string | null
  id?: string
  zone_id?: string | null
  label: string
  seats?: number
  shape?: TableShape
  pos_x?: number
  pos_y?: number
  is_active?: boolean
}

/**
 * Acota una posición al lienzo de su zona. Se hace en servidor y no sólo en el
 * editor porque el acomodo se guarda desde varios dispositivos: una mesa fuera
 * del lienzo es una mesa que nadie vuelve a encontrar.
 */
async function clampToZone(
  supabase: SupabaseClient,
  zoneId: string | null,
  x: number,
  y: number
): Promise<{ x: number; y: number }> {
  if (!zoneId) return { x, y }
  const { data: zone } = await supabase
    .from("foodos_table_zones")
    .select("width, height")
    .eq("id", zoneId)
    .maybeSingle()
  if (!zone) return { x, y }
  return clampPosition(x, y, zone as Pick<MesasZone, "width" | "height">, TABLE_MIN_SIZE)
}

export async function saveTable(input: SaveTableInput): Promise<MesasResult> {
  await requireFoodosFeature(MESAS_FEATURE)
  const { supabase, ownerUserId } = await requireFoodosAuth()
  await assertOwnRestaurant(supabase, ownerUserId, input.restaurant_id)

  const label = input.label?.trim()
  if (!label) return fail("Ponle nombre a la mesa.")

  const shape = isTableShape(input.shape) ? input.shape : "square"
  const seats = Math.min(MAX_GUESTS, Math.max(1, Math.trunc(input.seats ?? 4) || 4))
  const zoneId = input.zone_id ?? null
  const position = await clampToZone(
    supabase,
    zoneId,
    Number(input.pos_x ?? 0) || 0,
    Number(input.pos_y ?? 0) || 0
  )

  const payload = {
    zone_id: zoneId,
    label,
    seats,
    shape,
    pos_x: position.x,
    pos_y: position.y,
    is_active: input.is_active ?? true,
  }

  if (input.id) {
    const { error } = await supabase
      .from("foodos_tables")
      .update(payload)
      .eq("id", input.id)
      .eq("restaurant_id", input.restaurant_id)
    if (error) {
      logger.error("foodos.mesas.saveTable", { error: error.message })
      return fail("No se pudo guardar la mesa.")
    }
    revalidateMesas()
    return { ok: true, id: input.id }
  }

  const { data, error } = await supabase
    .from("foodos_tables")
    .insert({ ...payload, restaurant_id: input.restaurant_id, branch_id: input.branch_id ?? null })
    .select("id")
    .single()
  if (error || !data) {
    logger.error("foodos.mesas.saveTable", { error: error?.message })
    return fail("No se pudo crear la mesa.")
  }
  revalidateMesas()
  return { ok: true, id: (data as { id: string }).id }
}

/**
 * Persiste un arrastre. Es la acción más frecuente del editor, así que sólo
 * escribe la posición: nada de reescribir la mesa entera en cada movimiento.
 */
export async function moveTable(input: {
  restaurant_id: string
  id: string
  pos_x: number
  pos_y: number
}): Promise<MesasResult> {
  await requireFoodosFeature(MESAS_FEATURE)
  const { supabase, ownerUserId } = await requireFoodosAuth()
  await assertOwnRestaurant(supabase, ownerUserId, input.restaurant_id)

  const { data: current } = await supabase
    .from("foodos_tables")
    .select("zone_id")
    .eq("id", input.id)
    .eq("restaurant_id", input.restaurant_id)
    .maybeSingle()
  if (!current) return fail("Mesa no encontrada.")
  const zoneId = (current as { zone_id: string | null }).zone_id ?? null

  const position = await clampToZone(
    supabase,
    zoneId,
    Number(input.pos_x) || 0,
    Number(input.pos_y) || 0
  )

  const { error } = await supabase
    .from("foodos_tables")
    .update({ pos_x: position.x, pos_y: position.y })
    .eq("id", input.id)
    .eq("restaurant_id", input.restaurant_id)
  if (error) {
    logger.error("foodos.mesas.moveTable", { error: error.message })
    return fail("No se pudo mover la mesa.")
  }
  return { ok: true }
}

export async function deleteTable(input: {
  restaurant_id: string
  id: string
}): Promise<MesasResult> {
  await requireFoodosFeature(MESAS_FEATURE)
  const { supabase, ownerUserId } = await requireFoodosAuth()
  await assertOwnRestaurant(supabase, ownerUserId, input.restaurant_id)

  // `foodos_table_tickets.table_id` es ON DELETE CASCADE: borrar una mesa con
  // cuenta abierta se llevaría por delante el rastro de una venta.
  const { count } = await supabase
    .from("foodos_table_tickets")
    .select("id", { count: "exact", head: true })
    .eq("table_id", input.id)
    .eq("status", "open")
  if ((count ?? 0) > 0) {
    return fail("Esta mesa tiene una cuenta abierta. Cóbrala o cancélala primero.")
  }

  const { error } = await supabase
    .from("foodos_tables")
    .delete()
    .eq("id", input.id)
    .eq("restaurant_id", input.restaurant_id)
  if (error) {
    logger.error("foodos.mesas.deleteTable", { error: error.message })
    return fail("No se pudo borrar la mesa.")
  }
  revalidateMesas()
  return { ok: true }
}

// ------------------------------------------------------------
// Cuentas
// ------------------------------------------------------------

export async function openTable(input: {
  restaurant_id: string
  table_id: string
  guests?: number
  note?: string | null
}): Promise<MesasResult> {
  await requireFoodosFeature(MESAS_FEATURE)
  const { supabase, user, ownerUserId } = await requireFoodosAuth()
  await assertOwnRestaurant(supabase, ownerUserId, input.restaurant_id)

  const table = await loadTable(supabase, input.restaurant_id, input.table_id)
  if (!table) return fail("Mesa no encontrada.")
  if (!table.is_active) return fail("Esta mesa está fuera de servicio.")

  const guests = Math.min(MAX_GUESTS, Math.max(1, Math.trunc(input.guests ?? 1) || 1))

  const { data, error } = await supabase
    .from("foodos_table_tickets")
    .insert({
      restaurant_id: input.restaurant_id,
      branch_id: table.branch_id,
      table_id: input.table_id,
      guests,
      opened_by: user.id,
      note: input.note?.trim() || null,
    })
    .select("id")
    .single()

  if (error || !data) {
    // El índice único parcial es la red contra dos dispositivos que abren la
    // misma mesa a la vez. El mensaje debe ser el mismo, no un 23505 crudo.
    if (error?.code === "23505") return fail("Esa mesa ya tiene una cuenta abierta.")
    logger.error("foodos.mesas.openTable", { error: error?.message })
    return fail("No se pudo abrir la cuenta.")
  }

  revalidateMesas()
  return { ok: true, id: (data as { id: string }).id }
}

export interface SendToKitchenInput {
  restaurant_id: string
  ticket_id: string
  items: FoodosOrderItem[]
  note?: string | null
}

/**
 * Manda una ronda a cocina.
 *
 * Cada envío deja **su propia fila** en `foodos_orders`, pendiente de pago. Eso
 * es lo que hace que la cocina vea la comanda al instante y que el mesero pueda
 * pedir en varias rondas sin sobrescribir lo ya pedido. La cuenta se arma
 * leyendo estas filas, no duplicando los platillos en la cuenta de la mesa.
 */
export async function sendToKitchen(input: SendToKitchenInput): Promise<MesasResult> {
  await requireFoodosFeature(MESAS_FEATURE)
  const { supabase, user, ownerUserId } = await requireFoodosAuth()
  await assertOwnRestaurant(supabase, ownerUserId, input.restaurant_id)

  if (!input.items?.length) return fail("No hay platillos que mandar a cocina.")

  const ticket = await loadOpenTicket(supabase, input.restaurant_id, input.ticket_id)
  if (!ticket) return fail("Esta cuenta ya no está abierta.")

  const table = await loadTable(supabase, input.restaurant_id, ticket.table_id)
  if (!table) return fail("Mesa no encontrada.")

  // La caja puede seguir cerrada: no se bloquea la cocina por eso. El turno se
  // sella si existe y, si no, la comanda queda sin turno.
  const shift = await findOpenShift(supabase, input.restaurant_id, ticket.branch_id)

  const result = await createFoodosOrder(
    supabase,
    {
      restaurant_id: input.restaurant_id,
      branch_id: ticket.branch_id,
      items: input.items,
      channel: "mesero",
      fulfillment: "dine_in",
      // Sin forma de pago: la cuenta todavía no se cobra. Y sin teléfono de
      // cliente a propósito, para no inflar el CRM con cada ronda de mesa.
      payment_method: null,
      table_number: table.label,
      note: input.note ?? null,
    },
    {
      pos: {
        // Mandar platillos a cocina no es una venta: el folio se reserva al
        // cerrar la cuenta, una sola vez por mesa.
        folio: null,
        cashierUserId: user.id,
        shiftId: shift?.id ?? null,
        tableTicketId: ticket.id,
        settled: false,
        sendToKitchen: true,
      },
    }
  )

  if (!result.ok) {
    logger.warn("foodos.mesas.sendToKitchen", { error: result.error, code: result.code })
    return fail(result.error)
  }

  revalidateMesas()
  return { ok: true, id: result.orderId }
}

/** Marca o desmarca "la cuenta, por favor". Es la señal que busca el cajero. */
export async function requestBill(input: {
  restaurant_id: string
  ticket_id: string
  requested: boolean
}): Promise<MesasResult> {
  await requireFoodosFeature(MESAS_FEATURE)
  const { supabase, ownerUserId } = await requireFoodosAuth()
  await assertOwnRestaurant(supabase, ownerUserId, input.restaurant_id)

  const ticket = await loadOpenTicket(supabase, input.restaurant_id, input.ticket_id)
  if (!ticket) return fail("Esta cuenta ya no está abierta.")

  const { error } = await supabase
    .from("foodos_table_tickets")
    .update({ billing_requested_at: input.requested ? new Date().toISOString() : null })
    .eq("id", input.ticket_id)
    .eq("restaurant_id", input.restaurant_id)
  if (error) {
    logger.error("foodos.mesas.requestBill", { error: error.message })
    return fail("No se pudo avisar de la cuenta.")
  }
  revalidateMesas()
  return { ok: true }
}

/** Cambia los comensales de una cuenta abierta (llegó más gente). */
export async function setGuests(input: {
  restaurant_id: string
  ticket_id: string
  guests: number
}): Promise<MesasResult> {
  await requireFoodosFeature(MESAS_FEATURE)
  const { supabase, ownerUserId } = await requireFoodosAuth()
  await assertOwnRestaurant(supabase, ownerUserId, input.restaurant_id)

  const ticket = await loadOpenTicket(supabase, input.restaurant_id, input.ticket_id)
  if (!ticket) return fail("Esta cuenta ya no está abierta.")

  const guests = Math.min(MAX_GUESTS, Math.max(1, Math.trunc(input.guests) || 1))
  const { error } = await supabase
    .from("foodos_table_tickets")
    .update({ guests })
    .eq("id", input.ticket_id)
    .eq("restaurant_id", input.restaurant_id)
  if (error) {
    logger.error("foodos.mesas.setGuests", { error: error.message })
    return fail("No se pudo actualizar los comensales.")
  }
  revalidateMesas()
  return { ok: true }
}

/**
 * Reapunta las comandas pendientes a otra cuenta. Transferir y unir mesas
 * necesitan exactamente lo mismo: mover el trabajo en curso sin tocar lo ya
 * cobrado. `toTicketId` puede ser el mismo que `fromTicketId` cuando sólo
 * cambia la etiqueta de la mesa.
 */
async function repointComandas(
  supabase: SupabaseClient,
  restaurantId: string,
  fromTicketId: string,
  toTicketId: string,
  tableNumber: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase
    .from("foodos_orders")
    .update({ table_ticket_id: toTicketId, table_number: tableNumber })
    .eq("restaurant_id", restaurantId)
    .eq("table_ticket_id", fromTicketId)
    .eq("payment_status", "pending")
  if (error) {
    logger.error("foodos.mesas.repointComandas", { error: error.message })
    return { ok: false, error: "No se pudieron mover los platillos a la otra mesa." }
  }
  return { ok: true }
}

export async function transferTable(input: {
  restaurant_id: string
  ticket_id: string
  table_id: string
}): Promise<MesasResult> {
  await requireFoodosFeature(MESAS_FEATURE)
  const { supabase, ownerUserId } = await requireFoodosAuth()
  await assertOwnRestaurant(supabase, ownerUserId, input.restaurant_id)

  const ticket = await loadOpenTicket(supabase, input.restaurant_id, input.ticket_id)
  if (!ticket) return fail("Esta cuenta ya no está abierta.")
  if (ticket.table_id === input.table_id) return fail("La cuenta ya está en esa mesa.")

  const target = await loadTable(supabase, input.restaurant_id, input.table_id)
  if (!target) return fail("Mesa destino no encontrada.")
  if (!target.is_active) return fail("La mesa destino está fuera de servicio.")

  // El índice único parcial rechazaría el update con un 23505 feo. Mejor
  // decirlo claro antes de intentarlo.
  if (await openTicketForTable(supabase, input.table_id)) {
    return fail("La mesa destino ya tiene una cuenta abierta.")
  }

  // Las comandas que siguen pendientes se reapuntan para que el KDS no siga
  // mandando la comida a la mesa equivocada.
  const moved = await repointComandas(
    supabase,
    input.restaurant_id,
    ticket.id,
    ticket.id,
    target.label
  )
  if (!moved.ok) return fail(moved.error)

  const { error } = await supabase
    .from("foodos_table_tickets")
    .update({ table_id: input.table_id })
    .eq("id", input.ticket_id)
    .eq("restaurant_id", input.restaurant_id)
  if (error) {
    if (error.code === "23505") return fail("La mesa destino ya tiene una cuenta abierta.")
    logger.error("foodos.mesas.transferTable", { error: error.message })
    return fail("No se pudo mover la cuenta.")
  }

  revalidateMesas()
  return { ok: true }
}

export async function mergeTables(input: {
  restaurant_id: string
  source_ticket_id: string
  target_ticket_id: string
}): Promise<MesasResult> {
  await requireFoodosFeature(MESAS_FEATURE)
  const { supabase, user, ownerUserId } = await requireFoodosAuth()
  await assertOwnRestaurant(supabase, ownerUserId, input.restaurant_id)

  if (input.source_ticket_id === input.target_ticket_id) {
    return fail("Elige dos cuentas distintas.")
  }

  const source = await loadOpenTicket(supabase, input.restaurant_id, input.source_ticket_id)
  const target = await loadOpenTicket(supabase, input.restaurant_id, input.target_ticket_id)
  if (!source) return fail("La cuenta de origen ya no está abierta.")
  if (!target) return fail("La cuenta de destino ya no está abierta.")

  const targetTable = await loadTable(supabase, input.restaurant_id, target.table_id)
  if (!targetTable) return fail("Mesa destino no encontrada.")

  // Primero se mueve el trabajo en curso y después se anula la cuenta vacía: si
  // algo falla a la mitad, queda una cuenta de origen abierta y sin platillos,
  // que se puede volver a unir sin haber perdido nada.
  const moved = await repointComandas(
    supabase,
    input.restaurant_id,
    source.id,
    target.id,
    targetTable.label
  )
  if (!moved.ok) return fail(moved.error)

  const { error } = await supabase
    .from("foodos_table_tickets")
    .update({
      status: "void",
      closed_by: user.id,
      closed_at: new Date().toISOString(),
      billing_requested_at: null,
    })
    .eq("id", source.id)
    .eq("restaurant_id", input.restaurant_id)
  if (error) {
    logger.error("foodos.mesas.mergeTables", { error: error.message })
    return fail("No se pudo cerrar la cuenta de origen.")
  }

  revalidateMesas()
  return { ok: true }
}

export interface CloseTableInput {
  restaurant_id: string
  ticket_id: string
  /**
   * Líneas de la cuenta tal como las ve el cajero. Vienen del navegador para
   * que el ticket impreso coincida con lo que se mostró, pero el precio lo
   * vuelve a calcular `createFoodosOrder`: el cliente nunca fija un importe.
   */
  items: FoodosOrderItem[]
  /** Forma de pago única… */
  payment_method?: string | null
  /** …o desglose combinado (así se divide la cuenta entre varios pagadores). */
  payment_breakdown?: FoodosPaymentBreakdown
  tip?: number
  discount?: number
  coupon_code?: string | null
  note?: string | null
}

export interface CloseTableResult extends MesasResult {
  orderId?: string
  folio?: string
  total?: number
}

/**
 * Cobra la mesa: reserva el folio, produce la cuenta y cierra la cuenta.
 *
 * El turno de caja aquí **sí** es obligatorio: es el único momento en que esta
 * mesa se convierte en dinero, y una venta sin turno desaparece del arqueo.
 *
 * Dividir la cuenta no crea varias ventas: se cobra una sola vez con un
 * desglose de varias formas de pago, y el arqueo suma cada parte. Varias filas
 * por una misma mesa contarían la mesa dos veces.
 */
export async function closeTable(input: CloseTableInput): Promise<CloseTableResult> {
  await requireFoodosFeature(MESAS_FEATURE)
  const { supabase, user, ownerUserId } = await requireFoodosAuth()
  await assertOwnRestaurant(supabase, ownerUserId, input.restaurant_id)

  if (!input.items?.length) return fail("La cuenta está vacía.")

  const ticket = await loadOpenTicket(supabase, input.restaurant_id, input.ticket_id)
  if (!ticket) return fail("Esta cuenta ya no está abierta.")

  const table = await loadTable(supabase, input.restaurant_id, ticket.table_id)
  if (!table) return fail("Mesa no encontrada.")

  let shiftId: string
  try {
    shiftId = (await requireOpenShift(supabase, input.restaurant_id, ticket.branch_id)).id
  } catch (error) {
    if (isNoOpenShiftError(error)) return fail(error.message)
    throw error
  }

  const breakdown = input.payment_breakdown?.parts?.length ? input.payment_breakdown : undefined
  const method = input.payment_method ?? null
  if (!breakdown && !isPaymentMethod(method)) return fail("Elige una forma de pago.")
  if (breakdown && method) {
    return fail("Un cobro combinado no lleva además una forma de pago suelta.")
  }

  // El folio se reserva al final, con todo lo demás ya validado, para no quemar
  // un número en un intento que va a fallar.
  const { data: folio, error: folioError } = await supabase.rpc("foodos_next_folio", {
    p_restaurant_id: input.restaurant_id,
    p_branch_id: ticket.branch_id,
  })
  if (folioError || typeof folio !== "string") {
    logger.error("foodos.mesas.folio", { error: folioError?.message })
    return fail("No se pudo reservar el folio de la venta.")
  }

  const result = await createFoodosOrder(
    supabase,
    {
      restaurant_id: input.restaurant_id,
      branch_id: ticket.branch_id,
      items: input.items,
      channel: "mesero",
      fulfillment: "dine_in",
      payment_method: method,
      discount: input.discount ?? 0,
      tip: input.tip ?? 0,
      coupon_code: input.coupon_code ?? null,
      note: input.note ?? null,
      table_number: table.label,
    },
    {
      pos: {
        folio,
        cashierUserId: user.id,
        shiftId,
        tableTicketId: ticket.id,
        settled: true,
        // La comida ya salió en las comandas: la cuenta no es trabajo nuevo de
        // cocina y nace en estado terminal para no aparecer en el KDS.
        sendToKitchen: false,
      },
      paymentBreakdown: breakdown,
    }
  )

  if (!result.ok) {
    logger.warn("foodos.mesas.closeTable", { error: result.error, code: result.code })
    return fail(result.error)
  }

  const { error: closeError } = await supabase
    .from("foodos_table_tickets")
    .update({
      status: "closed",
      closed_by: user.id,
      closed_at: new Date().toISOString(),
      closed_order_id: result.orderId,
      billing_requested_at: null,
    })
    .eq("id", input.ticket_id)
    .eq("restaurant_id", input.restaurant_id)

  if (closeError) {
    // La venta ya está cobrada y el folio reservado: dejar la cuenta abierta
    // permitiría cobrarla dos veces. Se avisa, pero no se deshace el cobro.
    logger.error("foodos.mesas.closeTableTicket", { error: closeError.message })
    return {
      ok: true,
      orderId: result.orderId,
      folio,
      total: result.total,
      error: "La venta quedó cobrada, pero la mesa sigue marcada como ocupada.",
    }
  }

  revalidateMesas()
  revalidatePath("/panel/foodos/caja")

  return { ok: true, orderId: result.orderId, folio, total: result.total }
}

/** Cancela una cuenta abierta (mesa equivocada) y anula sus comandas pendientes. */
export async function cancelTicket(input: {
  restaurant_id: string
  ticket_id: string
}): Promise<MesasResult> {
  await requireFoodosFeature(MESAS_FEATURE)
  const { supabase, user, ownerUserId } = await requireFoodosAuth()
  await assertOwnRestaurant(supabase, ownerUserId, input.restaurant_id)

  const ticket = await loadOpenTicket(supabase, input.restaurant_id, input.ticket_id)
  if (!ticket) return fail("Esta cuenta ya no está abierta.")

  // Una comanda ya mandada a cocina pudo consumirse: no se borra, se marca
  // cancelada para que quede el rastro de qué se preparó y no se cobró.
  const { error: ordersError } = await supabase
    .from("foodos_orders")
    .update({ status: "cancelled" })
    .eq("restaurant_id", input.restaurant_id)
    .eq("table_ticket_id", ticket.id)
    .eq("payment_status", "pending")
  if (ordersError) {
    logger.error("foodos.mesas.cancelOrders", { error: ordersError.message })
    return fail("No se pudieron cancelar las comandas de la mesa.")
  }

  const { error } = await supabase
    .from("foodos_table_tickets")
    .update({
      status: "void",
      closed_by: user.id,
      closed_at: new Date().toISOString(),
      billing_requested_at: null,
    })
    .eq("id", input.ticket_id)
    .eq("restaurant_id", input.restaurant_id)
  if (error) {
    logger.error("foodos.mesas.cancelTicket", { error: error.message })
    return fail("No se pudo cancelar la cuenta.")
  }

  revalidateMesas()
  return { ok: true }
}
