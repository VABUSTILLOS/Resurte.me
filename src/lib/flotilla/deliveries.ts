// ============================================================
// Flotilla — capa de servidor (Fase 4, nivel Oro).
// ============================================================
// Decisiones que se ven en este archivo:
//
// 1. `ensureDeliveryForOrder` es IDEMPOTENTE. La tabla tiene UNIQUE en
//    `order_id` y el insert usa `ignoreDuplicates`, así que llamarlo dos
//    veces (reintento del webhook, doble clic, cron) no duplica la entrega.
//
// 2. La tarifa se COPIA en `foodos_deliveries.fee` al crear la entrega. El
//    precio que se le cobró al comensal no puede cambiar porque el
//    restaurantero edite una zona después.
//
// 3. El despacho a un proveedor externo (Uber Direct) NUNCA es automático:
//    cuesta dinero y se dispara con una acción explícita del restaurante.
//    Sin proveedor, la entrega opera con repartidores propios.
//
// 4. Nada aquí lanza por un fallo de red o de base: devuelve un resultado.
//    Un pedido confirmado no se cae porque la logística falle.
// ============================================================

import type { SupabaseClient } from "@supabase/supabase-js"

import {
  canTransitionDelivery,
  computeCourierPayout,
  estimateEtaMinutes,
  generateDeliveryPin,
  haversineKm,
  isCourierVehicle,
  isGeoPoint,
  matchZone,
  pickCourier,
  pinMatches,
  resolveDeliveryFee,
  round2,
  summarizeFlotilla,
  type CourierVehicle,
  type DeliveryFeeDecision,
  type DeliveryLike,
  type DeliveryStatus,
  type DeliveryZoneLike,
  type FlotillaSummary,
  type GeoPoint,
} from "@/lib/foodos-flotilla"
import { logger } from "@/lib/logger"

type Client = SupabaseClient

/** Minutos de preparación por defecto cuando la sucursal no dice otra cosa. */
const DEFAULT_PREP_MINUTES = 15

function text(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed === "" ? null : trimmed
}

function num(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value)
    return Number.isFinite(n) ? n : null
  }
  return null
}

/** Punto geográfico utilizable, o `null` si falta o es inválido. */
function pointOf(lat: unknown, lng: unknown): GeoPoint | null {
  const candidate = { lat, lng }
  return isGeoPoint(candidate) ? candidate : null
}

// ------------------------------------------------------------
// Zonas y cotización
// ------------------------------------------------------------

function rowToZone(row: Record<string, unknown>): DeliveryZoneLike {
  return {
    id: String(row.id ?? ""),
    name: String(row.name ?? ""),
    branch_id: text(row.branch_id),
    is_active: row.is_active !== false,
    center_lat: num(row.center_lat),
    center_lng: num(row.center_lng),
    radius_km: num(row.radius_km),
    fee: num(row.fee) ?? 0,
    min_order: num(row.min_order) ?? 0,
    eta_minutes: num(row.eta_minutes) ?? 35,
    payout_mode: text(row.payout_mode) ?? "fixed",
    payout_value: num(row.payout_value) ?? 0,
    sort_order: num(row.sort_order) ?? 0,
  }
}

/** Zonas activas del restaurante. Un fallo devuelve `[]` (se cobra tarifa plana). */
export async function loadDeliveryZones(
  supabase: Client,
  restaurantId: string
): Promise<DeliveryZoneLike[]> {
  try {
    const { data, error } = await supabase
      .from("foodos_delivery_zones")
      .select(
        "id, name, branch_id, is_active, center_lat, center_lng, radius_km, fee, min_order, eta_minutes, payout_mode, payout_value, sort_order"
      )
      .eq("restaurant_id", restaurantId)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
    if (error) throw error
    return ((data ?? []) as Record<string, unknown>[]).map(rowToZone)
  } catch (err) {
    logger.warn("[Flotilla] No se pudieron cargar las zonas de entrega", {
      error: err instanceof Error ? err.message : String(err),
    })
    return []
  }
}

export interface DeliveryQuoteInput {
  restaurantId: string
  branchId: string | null
  branchFee: number
  subtotal: number
  point: GeoPoint | null
}

/**
 * Cotiza la entrega del lado del servidor.
 *
 * Es el único lugar donde se decide la tarifa de entrega: el navegador solo
 * aporta el punto de destino, nunca el precio.
 */
export async function quoteDelivery(
  supabase: Client,
  input: DeliveryQuoteInput
): Promise<DeliveryFeeDecision> {
  const zones = await loadDeliveryZones(supabase, input.restaurantId)
  return resolveDeliveryFee({
    zones,
    point: input.point,
    branchId: input.branchId,
    branchFee: input.branchFee,
    subtotal: input.subtotal,
  })
}

// ------------------------------------------------------------
// Creación de la entrega
// ------------------------------------------------------------

export interface EnsureDeliveryInput {
  orderId: string
  restaurantId: string
  branchId: string | null
  /** Dirección escrita por el comensal. */
  dropoffAddress: string | null
  dropoffLat: number | null
  dropoffLng: number | null
  dropoffNotes: string | null
  /** Lo que se le cobró al comensal por la entrega (fuente única). */
  fee: number
  /** Minutos de preparación antes de que salga el repartidor. */
  prepMinutes?: number | null
}

export type EnsureDeliveryResult =
  | {
      ok: true
      deliveryId: string | null
      created: boolean
      zoneName: string | null
      etaMinutes: number | null
      distanceKm: number | null
      courierPayout: number
    }
  | { ok: false; reason: "no_address" | "error"; error?: string }

interface BranchRow {
  id: string
  name: string | null
  address: string | null
  lat: number | null
  lng: number | null
  phone: string | null
}

async function loadBranch(
  supabase: Client,
  branchId: string | null
): Promise<BranchRow | null> {
  if (!branchId) return null
  try {
    const { data } = await supabase
      .from("foodos_branches")
      .select("id, name, address, lat, lng, phone")
      .eq("id", branchId)
      .maybeSingle()
    if (!data) return null
    const row = data as Record<string, unknown>
    return {
      id: String(row.id ?? ""),
      name: text(row.name),
      address: text(row.address),
      lat: num(row.lat),
      lng: num(row.lng),
      phone: text(row.phone),
    }
  } catch {
    return null
  }
}

async function loadZoneRow(
  supabase: Client,
  zoneId: string | null
): Promise<Record<string, unknown> | null> {
  if (!zoneId) return null
  try {
    const { data } = await supabase
      .from("foodos_delivery_zones")
      .select("id, name, payout_mode, payout_value, eta_minutes")
      .eq("id", zoneId)
      .maybeSingle()
    return (data as Record<string, unknown> | null) ?? null
  } catch {
    return null
  }
}

/**
 * Crea la entrega de un pedido. Idempotente por `order_id`.
 *
 * Devuelve `reason: "no_address"` cuando no hay forma de saber a dónde va el
 * pedido: el pedido sigue vivo (el restaurante puede llamar al comensal),
 * pero no se inventa una dirección.
 */
export async function ensureDeliveryForOrder(
  supabase: Client,
  input: EnsureDeliveryInput
): Promise<EnsureDeliveryResult> {
  const dropoff = pointOf(input.dropoffLat, input.dropoffLng)

  let address = text(input.dropoffAddress)
  if (!address && dropoff) address = `${dropoff.lat}, ${dropoff.lng}`
  if (!address) return { ok: false, reason: "no_address" }

  try {
    const [zones, branch] = await Promise.all([
      loadDeliveryZones(supabase, input.restaurantId),
      loadBranch(supabase, input.branchId),
    ])

    const zone = dropoff ? matchZone(zones, dropoff, input.branchId) : null
    const pickup = pointOf(branch?.lat, branch?.lng)

    // Distancia de referencia: sucursal → destino. Sin coordenadas no se
    // estima a ciegas; se deja en `null` y se usa la ETA de la zona.
    const distanceKm =
      pickup && dropoff ? round2(haversineKm(pickup, dropoff)) : null

    const etaMinutes = estimateEtaMinutes({
      prepMinutes: num(input.prepMinutes) ?? DEFAULT_PREP_MINUTES,
      distanceKm: distanceKm ?? 0,
    })
    const zoneEta = zone?.eta_minutes ?? null
    const finalEta = zoneEta && !distanceKm ? zoneEta : etaMinutes

    // El payout sale de la zona; sin zona, el restaurante paga a mano.
    const zoneRow = await loadZoneRow(supabase, zone?.id ?? null)
    const courierPayout = round2(
      computeCourierPayout({
        mode: text(zoneRow?.payout_mode) ?? "fixed",
        value: num(zoneRow?.payout_value) ?? 0,
        distanceKm: distanceKm ?? 0,
        fee: input.fee,
      })
    )

    const payload = {
      restaurant_id: input.restaurantId,
      order_id: input.orderId,
      branch_id: input.branchId,
      zone_id: zone?.id ?? null,
      provider: "in_house",
      status: "pending",
      pickup_address: branch?.address ?? branch?.name ?? null,
      dropoff_address: address,
      dropoff_lat: dropoff?.lat ?? null,
      dropoff_lng: dropoff?.lng ?? null,
      dropoff_notes: text(input.dropoffNotes),
      zone_name: zone?.name ?? null,
      fee: Math.max(0, round2(num(input.fee) ?? 0)),
      courier_payout: Math.max(0, courierPayout),
      distance_km: distanceKm,
      eta_minutes: finalEta,
      // El PIN viaja con el pedido: el comensal lo ve en su tracking y el
      // repartidor lo teclea al entregar. Se genera aquí, en el servidor.
      proof_pin: generateDeliveryPin(),
    }

    // `ignoreDuplicates` convierte un reintento en un no-op en vez de un error.
    const { data, error } = await supabase
      .from("foodos_deliveries")
      .upsert(payload, { onConflict: "order_id", ignoreDuplicates: true })
      .select("id")
      .maybeSingle()

    if (error) throw error

    const deliveryId = text((data as Record<string, unknown> | null)?.id)
    // Sin fila devuelta la entrega ya existía: no se vuelve a bitacorizar.
    if (deliveryId) {
      await supabase.from("foodos_delivery_events").insert({
        delivery_id: deliveryId,
        restaurant_id: input.restaurantId,
        status: "pending",
        actor: "system",
        note: zone ? `Zona ${zone.name}` : null,
      })
    }

    return {
      ok: true,
      deliveryId,
      created: deliveryId !== null,
      zoneName: zone?.name ?? null,
      etaMinutes: finalEta,
      distanceKm,
      courierPayout,
    }
  } catch (err) {
    logger.warn("[Flotilla] No se pudo crear la entrega", {
      error: err instanceof Error ? err.message : String(err),
    })
    return {
      ok: false,
      reason: "error",
      error: err instanceof Error ? err.message : "Error inesperado",
    }
  }
}

// ------------------------------------------------------------
// Asignación y avance de estado
// ------------------------------------------------------------

export interface AssignCourierInput {
  deliveryId: string
  restaurantId: string
  courierId: string
  /** 'restaurant' cuando lo asigna el panel, 'system' si es automático. */
  actor?: "restaurant" | "system"
}

export type DeliveryActionResult =
  | { ok: true; status: DeliveryStatus; orderId?: string; orderStatus?: string }
  | { ok: false; error: string }

interface DeliveryRow {
  id: string
  status: DeliveryStatus
  courier_id: string | null
  fee: number
  distance_km: number | null
  zone_id: string | null
  proof_pin: string | null
  order_id: string | null
}

async function loadDelivery(
  supabase: Client,
  deliveryId: string,
  restaurantId: string
): Promise<DeliveryRow | null> {
  const { data } = await supabase
    .from("foodos_deliveries")
    .select("id, status, courier_id, fee, distance_km, zone_id, proof_pin, order_id")
    .eq("id", deliveryId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle()
  if (!data) return null
  const row = data as Record<string, unknown>
  return {
    id: String(row.id ?? ""),
    status: String(row.status ?? "pending") as DeliveryStatus,
    courier_id: text(row.courier_id),
    fee: num(row.fee) ?? 0,
    distance_km: num(row.distance_km),
    zone_id: text(row.zone_id),
    proof_pin: text(row.proof_pin),
    order_id: text(row.order_id),
  }
}

/**
 * Estados del pedido que reflejan un hito de la entrega.
 *
 * Sin esto el comensal vería "en preparación" mientras su comida ya va en
 * moto, y la cocina no se enteraría de que la entrega ya salió. Se escribe
 * solo cuando cambia: el aviso al comensal no es idempotente.
 */
const DELIVERY_ORDER_STATUS: Partial<Record<DeliveryStatus, string>> = {
  picked_up: "out_for_delivery",
  delivered: "delivered",
}

async function syncOrderStatus(
  supabase: Client,
  orderId: string | null,
  deliveryStatus: DeliveryStatus
): Promise<string | undefined> {
  const next = DELIVERY_ORDER_STATUS[deliveryStatus]
  if (!orderId || !next) return undefined
  try {
    const { data } = await supabase
      .from("foodos_orders")
      .select("status")
      .eq("id", orderId)
      .maybeSingle()
    const current = text((data as Record<string, unknown> | null)?.status)
    if (!current || current === next) return undefined
    await supabase.from("foodos_orders").update({ status: next }).eq("id", orderId)
    return next
  } catch (err) {
    // La entrega manda: si el pedido no se puede sincronizar, no se revierte.
    logger.warn("[Flotilla] No se pudo sincronizar el estado del pedido", {
      orderId,
      error: err instanceof Error ? err.message : String(err),
    })
    return undefined
  }
}

async function logEvent(
  supabase: Client,
  params: {
    deliveryId: string
    restaurantId: string
    status: string
    actor: "system" | "courier" | "restaurant" | "customer" | "provider"
    note?: string | null
    lat?: number | null
    lng?: number | null
  }
): Promise<void> {
  try {
    await supabase.from("foodos_delivery_events").insert({
      delivery_id: params.deliveryId,
      restaurant_id: params.restaurantId,
      status: params.status,
      actor: params.actor,
      note: params.note ?? null,
      lat: params.lat ?? null,
      lng: params.lng ?? null,
    })
  } catch (err) {
    // La bitácora es auditoría, no verdad: su fallo no revierte la entrega.
    logger.warn("[Flotilla] No se pudo registrar el evento de entrega", {
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

/** Asigna (o reasigna) un repartidor. */
export async function assignCourier(
  supabase: Client,
  input: AssignCourierInput
): Promise<DeliveryActionResult> {
  const delivery = await loadDelivery(supabase, input.deliveryId, input.restaurantId)
  if (!delivery) return { ok: false, error: "Entrega no encontrada" }
  if (delivery.status === "delivered" || delivery.status === "cancelled") {
    return { ok: false, error: "La entrega ya está cerrada" }
  }

  const { data: courier } = await supabase
    .from("foodos_couriers")
    .select("id, is_active")
    .eq("id", input.courierId)
    .eq("restaurant_id", input.restaurantId)
    .maybeSingle()
  const courierRow = courier as Record<string, unknown> | null
  if (!courierRow) return { ok: false, error: "Repartidor no encontrado" }
  if (courierRow.is_active === false) {
    return { ok: false, error: "El repartidor está inactivo" }
  }

  try {
    const { error } = await supabase
      .from("foodos_deliveries")
      .update({
        courier_id: input.courierId,
        status: "assigned",
        assigned_at: new Date().toISOString(),
      })
      .eq("id", input.deliveryId)
      .eq("restaurant_id", input.restaurantId)
    if (error) throw error

    await logEvent(supabase, {
      deliveryId: input.deliveryId,
      restaurantId: input.restaurantId,
      status: "assigned",
      actor: input.actor ?? "restaurant",
    })
    return { ok: true, status: "assigned" }
  } catch (err) {
    logger.warn("[Flotilla] No se pudo asignar el repartidor", {
      error: err instanceof Error ? err.message : String(err),
    })
    return { ok: false, error: "No se pudo asignar el repartidor" }
  }
}

export interface AdvanceDeliveryInput {
  deliveryId: string
  restaurantId: string
  status: DeliveryStatus
  actor?: "system" | "courier" | "restaurant" | "customer" | "provider"
  note?: string | null
  lat?: number | null
  lng?: number | null
}

/**
 * Avanza el estado de la entrega validando la transición.
 *
 * La validación vive en el núcleo puro (`canTransitionDelivery`), no aquí:
 * el mismo grafo lo usa el panel, el repartidor y los tests.
 */
export async function advanceDelivery(
  supabase: Client,
  input: AdvanceDeliveryInput
): Promise<DeliveryActionResult> {
  const delivery = await loadDelivery(supabase, input.deliveryId, input.restaurantId)
  if (!delivery) return { ok: false, error: "Entrega no encontrada" }
  if (!canTransitionDelivery(delivery.status, input.status)) {
    return {
      ok: false,
      error: `No se puede pasar de "${delivery.status}" a "${input.status}"`,
    }
  }

  const now = new Date().toISOString()
  const patch: Record<string, unknown> = { status: input.status }
  if (input.status === "assigned") patch.assigned_at = now
  if (input.status === "picked_up") patch.picked_up_at = now
  if (input.status === "delivered") patch.delivered_at = now
  if (input.status === "failed") {
    patch.failed_reason = text(input.note) ?? "Sin motivo indicado"
  }
  if (input.status === "cancelled") {
    // Cancelar es decisión del restaurante; fallar es un incidente. Se
    // guardan por separado para no confundir las dos métricas.
    patch.cancel_reason = text(input.note) ?? "Sin motivo indicado"
  }
  if (input.lat !== undefined && input.lng !== undefined) {
    patch.last_lat = input.lat
    patch.last_lng = input.lng
    patch.last_ping_at = now
  }

  try {
    const { error } = await supabase
      .from("foodos_deliveries")
      .update(patch)
      .eq("id", input.deliveryId)
      .eq("restaurant_id", input.restaurantId)
    if (error) throw error

    await logEvent(supabase, {
      deliveryId: input.deliveryId,
      restaurantId: input.restaurantId,
      status: input.status,
      actor: input.actor ?? "restaurant",
      note: input.note ?? null,
      lat: input.lat ?? null,
      lng: input.lng ?? null,
    })
    const orderStatus = await syncOrderStatus(supabase, delivery.order_id, input.status)
    return {
      ok: true,
      status: input.status,
      orderId: delivery.order_id ?? undefined,
      orderStatus,
    }
  } catch (err) {
    logger.warn("[Flotilla] No se pudo avanzar la entrega", {
      error: err instanceof Error ? err.message : String(err),
    })
    return { ok: false, error: "No se pudo actualizar la entrega" }
  }
}

// ------------------------------------------------------------
// Auto-asignación y prueba de entrega
// ------------------------------------------------------------

export interface AutoAssignResult {
  ok: boolean
  courierId: string | null
  courierName: string | null
  error?: string
}

async function loadTimezone(supabase: Client, restaurantId: string): Promise<string | null> {
  try {
    const { data } = await supabase
      .from("foodos_restaurants")
      .select("timezone")
      .eq("id", restaurantId)
      .maybeSingle()
    return text((data as Record<string, unknown> | null)?.timezone)
  } catch {
    return null
  }
}

/**
 * Asigna la entrega al repartidor que le toca: el que está de turno,
 * con cupo y menos entregas encima (ver `pickCourier`).
 *
 * Es idempotente respecto al estado: si la entrega ya está cerrada no
 * toca nada. Si nadie está disponible devuelve `ok: false` con un
 * mensaje legible: el restaurante asigna a mano o despacha al proveedor.
 */
export async function autoAssignDelivery(
  supabase: Client,
  input: { deliveryId: string; restaurantId: string }
): Promise<AutoAssignResult> {
  const delivery = await loadDelivery(supabase, input.deliveryId, input.restaurantId)
  if (!delivery) {
    return { ok: false, courierId: null, courierName: null, error: "Entrega no encontrada" }
  }
  if (delivery.status === "delivered" || delivery.status === "cancelled") {
    return {
      ok: false,
      courierId: null,
      courierName: null,
      error: "La entrega ya está cerrada",
    }
  }

  const [couriers, timezone] = await Promise.all([
    listCouriersWithLoad(supabase, input.restaurantId),
    loadTimezone(supabase, input.restaurantId),
  ])
  const load: Record<string, number> = {}
  for (const courier of couriers) load[courier.id] = courier.load

  const chosen = pickCourier(couriers, load, { timezone })
  if (!chosen) {
    return {
      ok: false,
      courierId: null,
      courierName: null,
      error: "Ningún repartidor disponible (turno o cupo)",
    }
  }

  const result = await assignCourier(supabase, {
    deliveryId: input.deliveryId,
    restaurantId: input.restaurantId,
    courierId: chosen.id,
    actor: "system",
  })
  if (!result.ok) {
    return { ok: false, courierId: null, courierName: null, error: result.error }
  }
  return { ok: true, courierId: chosen.id, courierName: chosen.name }
}

export interface DeliverWithPinInput {
  deliveryId: string
  restaurantId: string
  pin: string | null | undefined
  /** Ruta ya subida en el bucket `entregas`. Opcional. */
  photoPath?: string | null
  actor?: "courier" | "restaurant"
}

/**
 * Cierra la entrega contra el PIN que muestra el comensal.
 *
 * El PIN se compara aquí y no en el núcleo puro porque la fuente es la
 * fila de la base. Un PIN incorrecto no avanza nada y no deja bitácora
 * de entrega: solo el intento fallido queda en el log del servidor.
 */
export async function deliverWithPin(
  supabase: Client,
  input: DeliverWithPinInput
): Promise<DeliveryActionResult> {
  const delivery = await loadDelivery(supabase, input.deliveryId, input.restaurantId)
  if (!delivery) return { ok: false, error: "Entrega no encontrada" }
  if (!canTransitionDelivery(delivery.status, "delivered")) {
    return { ok: false, error: `No se puede cerrar desde "${delivery.status}"` }
  }
  if (!pinMatches(delivery.proof_pin, input.pin)) {
    logger.warn("[Flotilla] PIN de entrega incorrecto", { deliveryId: input.deliveryId })
    return { ok: false, error: "PIN incorrecto" }
  }

  const now = new Date().toISOString()
  try {
    const { error } = await supabase
      .from("foodos_deliveries")
      .update({
        status: "delivered",
        delivered_at: now,
        proof_verified: true,
        proof_at: now,
        proof_photo_path: text(input.photoPath),
      })
      .eq("id", input.deliveryId)
      .eq("restaurant_id", input.restaurantId)
    if (error) throw error

    await logEvent(supabase, {
      deliveryId: input.deliveryId,
      restaurantId: input.restaurantId,
      status: "delivered",
      actor: input.actor ?? "courier",
      note: "Entregado con PIN",
    })
    const orderStatus = await syncOrderStatus(supabase, delivery.order_id, "delivered")
    return {
      ok: true,
      status: "delivered",
      orderId: delivery.order_id ?? undefined,
      orderStatus,
    }
  } catch (err) {
    logger.warn("[Flotilla] No se pudo cerrar la entrega", {
      error: err instanceof Error ? err.message : String(err),
    })
    return { ok: false, error: "No se pudo cerrar la entrega" }
  }
}

// ------------------------------------------------------------
// Lectura
// ------------------------------------------------------------

export interface CourierLoadRow {
  id: string
  name: string
  phone: string | null
  vehicle: CourierVehicle
  capacity: number
  shift_start: string | null
  shift_end: string | null
  is_active: boolean
  notes: string | null
  load: number
  /** El enlace móvil del repartidor está activo (tiene token). */
  has_link: boolean
}

/** Repartidores con su carga actual (entregas activas asignadas). */
export async function listCouriersWithLoad(
  supabase: Client,
  restaurantId: string
): Promise<CourierLoadRow[]> {
  try {
    const [{ data: couriers }, { data: active }] = await Promise.all([
      supabase
        .from("foodos_couriers")
        .select(
          "id, name, phone, vehicle, capacity, shift_start, shift_end, is_active, notes, access_token"
        )
        .eq("restaurant_id", restaurantId)
        .order("name", { ascending: true }),
      supabase
        .from("foodos_deliveries")
        .select("courier_id")
        .eq("restaurant_id", restaurantId)
        .in("status", ["assigned", "picked_up"]),
    ])

    const load = new Map<string, number>()
    for (const row of (active ?? []) as Record<string, unknown>[]) {
      const id = text(row.courier_id)
      if (id) load.set(id, (load.get(id) ?? 0) + 1)
    }

    return ((couriers ?? []) as Record<string, unknown>[]).map((row) => {
      const vehicle = String(row.vehicle ?? "moto")
      return {
        id: String(row.id ?? ""),
        name: String(row.name ?? ""),
        phone: text(row.phone),
        vehicle: (isCourierVehicle(vehicle) ? vehicle : "moto") as CourierVehicle,
        capacity: num(row.capacity) ?? 1,
        shift_start: text(row.shift_start),
        shift_end: text(row.shift_end),
        is_active: row.is_active !== false,
        notes: text(row.notes),
        load: load.get(String(row.id ?? "")) ?? 0,
        has_link: Boolean(text(row.access_token)),
      }
    })
  } catch (err) {
    logger.warn("[Flotilla] No se pudieron cargar los repartidores", {
      error: err instanceof Error ? err.message : String(err),
    })
    return []
  }
}

/** Entregas abiertas, más urgentes primero. */
export async function listActiveDeliveries(
  supabase: Client,
  restaurantId: string,
  limit = 50
): Promise<Record<string, unknown>[]> {
  try {
    const { data, error } = await supabase
      .from("foodos_deliveries")
      .select(
        "id, order_id, courier_id, status, zone_name, dropoff_address, fee, courier_payout, distance_km, eta_minutes, assigned_at, picked_up_at, created_at"
      )
      .eq("restaurant_id", restaurantId)
      .in("status", ["pending", "assigned", "picked_up"])
      .order("created_at", { ascending: true })
      .limit(Math.min(Math.max(limit, 1), 200))
    if (error) throw error
    return (data ?? []) as Record<string, unknown>[]
  } catch (err) {
    logger.warn("[Flotilla] No se pudieron cargar las entregas activas", {
      error: err instanceof Error ? err.message : String(err),
    })
    return []
  }
}

/** KPIs del día en la zona horaria del restaurante. */
export async function getFlotillaSummary(
  supabase: Client,
  restaurantId: string,
  options: { timezone?: string | null; now?: Date } = {}
): Promise<FlotillaSummary | null> {
  try {
    const { data, error } = await supabase
      .from("foodos_deliveries")
      .select("id, status, courier_id, fee, courier_payout, created_at, picked_up_at, delivered_at")
      .eq("restaurant_id", restaurantId)
      .order("created_at", { ascending: false })
      .limit(500)
    if (error) throw error

    const deliveries = ((data ?? []) as Record<string, unknown>[]).map((row) => ({
      id: String(row.id ?? ""),
      status: String(row.status ?? "pending") as DeliveryStatus,
      courier_id: text(row.courier_id),
      fee: num(row.fee) ?? 0,
      courier_payout: num(row.courier_payout) ?? 0,
      created_at: String(row.created_at ?? ""),
      picked_up_at: text(row.picked_up_at),
      delivered_at: text(row.delivered_at),
    })) satisfies DeliveryLike[]

    return summarizeFlotilla(deliveries, {
      timezone: options.timezone ?? null,
      now: options.now,
    })
  } catch (err) {
    logger.warn("[Flotilla] No se pudieron calcular los KPIs", {
      error: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}

// ------------------------------------------------------------
// Vista móvil del repartidor (capability token)
// ------------------------------------------------------------
// El repartidor no tiene cuenta en Resurte. Abre un enlace con un token
// que se genera a demanda desde el panel y se puede rotar. El token solo
// da acceso a SUS entregas activas: no ve tarifas, ni otros repartidores,
// ni el resto del restaurante.

export interface CourierSession {
  courier: {
    id: string
    name: string
    phone: string | null
    vehicle: CourierVehicle
    capacity: number
  }
  restaurant: {
    id: string
    name: string
    timezone: string | null
    logo_url: string | null
  } | null
}

/** Resuelve el token del repartidor. `null` si no existe o está inactivo. */
export async function loadCourierByToken(
  supabase: Client,
  token: string
): Promise<CourierSession | null> {
  const clean = text(token)
  if (!clean || clean.length < 16) return null
  try {
    const { data } = await supabase
      .from("foodos_couriers")
      .select("id, name, phone, vehicle, capacity, is_active, restaurant_id")
      .eq("access_token", clean)
      .maybeSingle()
    const row = data as Record<string, unknown> | null
    if (!row || row.is_active === false) return null

    const restaurantId = text(row.restaurant_id)
    let restaurant: CourierSession["restaurant"] = null
    if (restaurantId) {
      const { data: rest } = await supabase
        .from("foodos_restaurants")
        .select("id, name, timezone, logo_url")
        .eq("id", restaurantId)
        .maybeSingle()
      const r = rest as Record<string, unknown> | null
      if (r) {
        restaurant = {
          id: String(r.id ?? ""),
          name: String(r.name ?? ""),
          timezone: text(r.timezone),
          logo_url: text(r.logo_url),
        }
      }
    }

    const vehicle = String(row.vehicle ?? "moto")
    return {
      courier: {
        id: String(row.id ?? ""),
        name: String(row.name ?? ""),
        phone: text(row.phone),
        vehicle: (isCourierVehicle(vehicle) ? vehicle : "moto") as CourierVehicle,
        capacity: num(row.capacity) ?? 1,
      },
      restaurant,
    }
  } catch (err) {
    logger.warn("[Flotilla] No se pudo resolver el token del repartidor", {
      error: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}

export interface CourierJob {
  id: string
  status: DeliveryStatus
  orderId: string | null
  customerName: string | null
  dropoffAddress: string
  dropoffNotes: string | null
  zoneName: string | null
  etaMinutes: number | null
  distanceKm: number | null
  courierPayout: number
  createdAt: string
  /** `true` cuando la entrega ya se cerró con PIN. */
  proofVerified: boolean
}

/**
 * Entregas asignadas a este repartidor y aún abiertas.
 *
 * Se excluye a propósito `proof_pin`: el repartidor tiene que pedirle el
 * código al comensal, no leerlo de la pantalla.
 */
export async function listCourierJobs(
  supabase: Client,
  input: { courierId: string; restaurantId: string }
): Promise<CourierJob[]> {
  try {
    const { data } = await supabase
      .from("foodos_deliveries")
      .select(
        "id, status, order_id, dropoff_address, dropoff_notes, zone_name, eta_minutes, distance_km, courier_payout, created_at, proof_verified"
      )
      .eq("restaurant_id", input.restaurantId)
      .eq("courier_id", input.courierId)
      .in("status", ["assigned", "picked_up", "delivered", "failed"])
      .order("created_at", { ascending: false })
      .limit(50)

    const rows = (data ?? []) as Record<string, unknown>[]
    if (rows.length === 0) return []

    const orderIds = rows.map((r) => text(r.order_id)).filter((id): id is string => !!id)
    const names = new Map<string, string | null>()
    if (orderIds.length > 0) {
      const { data: orders } = await supabase
        .from("foodos_orders")
        .select("id, customer_name")
        .in("id", orderIds)
      for (const o of (orders ?? []) as Record<string, unknown>[]) {
        names.set(String(o.id ?? ""), text(o.customer_name))
      }
    }

    return rows.map((row) => {
      const orderId = text(row.order_id)
      return {
        id: String(row.id ?? ""),
        status: String(row.status ?? "assigned") as DeliveryStatus,
        orderId,
        customerName: orderId ? names.get(orderId) ?? null : null,
        dropoffAddress: String(row.dropoff_address ?? ""),
        dropoffNotes: text(row.dropoff_notes),
        zoneName: text(row.zone_name),
        etaMinutes: num(row.eta_minutes),
        distanceKm: num(row.distance_km),
        courierPayout: round2(num(row.courier_payout) ?? 0),
        createdAt: String(row.created_at ?? ""),
        proofVerified: row.proof_verified === true,
      }
    })
  } catch (err) {
    logger.warn("[Flotilla] No se pudieron cargar las entregas del repartidor", {
      error: err instanceof Error ? err.message : String(err),
    })
    return []
  }
}

/**
 * Devuelve el token del repartidor, generándolo si aún no tiene.
 *
 * Se genera a demanda y no en la migración porque necesita aleatoriedad
 * criptográfica de Node. Se usa `crypto.randomUUID()` sin guiones: 32
 * caracteres hex, suficiente para un capability token.
 */
export async function ensureCourierToken(
  supabase: Client,
  input: { courierId: string; restaurantId: string }
): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  try {
    const { data } = await supabase
      .from("foodos_couriers")
      .select("id, access_token")
      .eq("id", input.courierId)
      .eq("restaurant_id", input.restaurantId)
      .maybeSingle()
    const row = data as Record<string, unknown> | null
    if (!row) return { ok: false, error: "Repartidor no encontrado" }

    const existing = text(row.access_token)
    if (existing) return { ok: true, token: existing }

    const token = crypto.randomUUID().replace(/-/g, "")
    const { error } = await supabase
      .from("foodos_couriers")
      .update({ access_token: token })
      .eq("id", input.courierId)
      .eq("restaurant_id", input.restaurantId)
    if (error) throw error
    return { ok: true, token }
  } catch (err) {
    logger.warn("[Flotilla] No se pudo generar el enlace del repartidor", {
      error: err instanceof Error ? err.message : String(err),
    })
    return { ok: false, error: "No se pudo generar el enlace" }
  }
}

/** Rota el token del repartidor: el enlace anterior deja de funcionar. */
export async function revokeCourierToken(
  supabase: Client,
  input: { courierId: string; restaurantId: string }
): Promise<DeliveryActionResult> {
  try {
    const { error } = await supabase
      .from("foodos_couriers")
      .update({ access_token: null })
      .eq("id", input.courierId)
      .eq("restaurant_id", input.restaurantId)
    if (error) throw error
    return { ok: true, status: "pending" }
  } catch (err) {
    logger.warn("[Flotilla] No se pudo revocar el enlace del repartidor", {
      error: err instanceof Error ? err.message : String(err),
    })
    return { ok: false, error: "No se pudo revocar el enlace" }
  }
}
